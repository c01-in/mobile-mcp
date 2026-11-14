// Transages Android deployment. Reuses Mobile Next's Android driver (Apache-2.0).
// No cloud fleet, agent auto-install, or telemetry code runs in this deployment.
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { AndroidRobot, AndroidDeviceManager } from "./android";
import { validatePackageName } from "./utils";
import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const helper = "com.transages.mobilebridge";
const deviceSchema = { device: z.string().min(1).describe("ID from mobile_list_available_devices") };
// Serializes whole operations across stateless HTTP requests, including IME restoration.
let pending: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
	const result = pending.then(fn, fn);
	pending = result.catch(() => {});
	return result;
}
export function ownerRobot(device: string): AndroidRobot {
	const robot = new AndroidRobot(device);
	const user = robot.adb("shell", "am", "get-current-user").toString().trim();
	if (user !== "0") throw new Error(`Phone is displaying user ${user}; this service operates owner 0.`);
	return robot;
}
async function wakePhone(device: string) {
	const r = ownerRobot(device);
	r.adb("shell", "input", "keyevent", "KEYCODE_WAKEUP");
	await new Promise(resolve => setTimeout(resolve, 250));
	r.adb("shell", "wm", "dismiss-keyguard");
	await new Promise(resolve => setTimeout(resolve, 200));
	const policy = r.adb("shell", "dumpsys", "window", "policy").toString();
	if (/showing=true/.test(policy) && /secure=false/.test(policy)) {
		const size = await r.getScreenSize();
		r.adb("shell", "input", "swipe", `${Math.floor(size.width / 2)}`, `${Math.floor(size.height * .8)}`, `${Math.floor(size.width / 2)}`, `${Math.floor(size.height * .25)}`, "300");
		await new Promise(resolve => setTimeout(resolve, 300));
	}
	return r;
}
function bridge(robot: AndroidRobot, action: string, payload: object = {}): any {
	const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
	const output = robot.adb("shell", "am", "broadcast", "--user", "0", "--include-stopped-packages",
		"-n", `${helper}/.BridgeReceiver`, "-a", `${helper}.${action}`, "--es", "payload", encoded).toString();
	const match = output.match(/data="([A-Za-z0-9+/=]+)"/);
	if (!match) throw new Error("Android bridge returned no response. Install the supplied bridge APK on owner 0.");
	const result = JSON.parse(Buffer.from(match[1], "base64").toString());
	if (result.error) throw new Error(result.error);
	return result;
}
export const createOwnerMcpServer = (): McpServer => {
	const server = new McpServer({ name: "transages-mobile", version: "1.0.0" }, {
		instructions: "Controls the owner's USB Android phone (user 0). Wake the phone before UI actions. Use screenshots when UI hierarchy is incomplete. SMS send transmits a real message: obtain the user's intended recipient and text. Install APKs from supplied URLs or server paths. No telemetry. All device operations are serialized.",
	});
	function tool(name: string, description: string, schema: Record<string, z.ZodType>, fn: (args: any) => Promise<any>, readOnly = false) {
		server.registerTool(name, { description, inputSchema: z.object(schema), annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly } }, async (args: any) => {
			try {
				const result = await serial(async () => {
					if (/^mobile_(take_screenshot|list_elements|click_|long_press|swipe_|press_button|type_keys|launch_app|open_url)/.test(name)) await wakePhone(args.device);
					return fn(args);
				});
				if (Buffer.isBuffer(result)) return { content: [{ type: "image" as const, data: result.toString("base64"), mimeType: "image/png" }] };
				return { content: [{ type: "text" as const, text: typeof result === "string" ? result : JSON.stringify(result ?? { ok: true }) }] };
			} catch (err) {
				return { isError: true, content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }] };
			}
		});
	}
	tool("mobile_list_available_devices", "List USB Android devices.", {}, async () => new AndroidDeviceManager().getConnectedDevicesWithDetails(), true);
	tool("mobile_wake_unlock", "Wake screen and dismiss a swipe/no-password lock. Does not bypass a PIN.", deviceSchema, async ({ device }) => {
		const r = await wakePhone(device);
		return { power: r.adb("shell", "dumpsys", "power").toString().split("\n").filter(x => /mWakefulness=|Display Power:/.test(x)),
			keyguard: r.adb("shell", "dumpsys", "window", "policy").toString().split("\n").filter(x => /showing=|secure=/.test(x)) };
	});
	tool("mobile_take_screenshot", "Read current screen as a PNG image.", deviceSchema, async ({ device }) => ownerRobot(device).getScreenshot(), true);
	tool("mobile_list_elements_on_screen", "Read UI hierarchy; use screenshot if Android returns incomplete nodes.", deviceSchema, async ({ device }) => ownerRobot(device).getElementsOnScreen(), true);
	tool("mobile_get_screen_size", "Screen dimensions for touch coordinates.", deviceSchema, async ({ device }) => ownerRobot(device).getScreenSize(), true);
	tool("mobile_click_on_screen_at_coordinates", "Tap a screen coordinate.", { ...deviceSchema, x: z.number().int().nonnegative(), y: z.number().int().nonnegative() }, async ({ device, x, y }) => ownerRobot(device).tap(x, y));
	tool("mobile_long_press_on_screen_at_coordinates", "Long press a coordinate.", { ...deviceSchema, x: z.number().int().nonnegative(), y: z.number().int().nonnegative(), duration: z.number().int().positive().default(800) }, async ({ device, x, y, duration }) => ownerRobot(device).longPress(x, y, duration));
	tool("mobile_swipe_on_screen", "Swipe in a direction.", { ...deviceSchema, direction: z.enum(["up", "down", "left", "right"]) }, async ({ device, direction }) => ownerRobot(device).swipe(direction));
	tool("mobile_press_button", "Press a system key.", { ...deviceSchema, button: z.enum(["HOME", "BACK", "ENTER", "VOLUME_UP", "VOLUME_DOWN", "DPAD_CENTER", "DPAD_UP", "DPAD_DOWN", "DPAD_LEFT", "DPAD_RIGHT"]) }, async ({ device, button }) => ownerRobot(device).pressButton(button));
	tool("mobile_type_keys", "Paste Unicode text (including Chinese) into the focused input, then restore the previous clipboard. Keeps the user's keyboard.", { ...deviceSchema, text: z.string() }, async ({ device, text }) => {
		const r = ownerRobot(device);
		bridge(r, "paste_prepare", { text });
		try {
			r.adb("shell", "input", "keyevent", "KEYCODE_PASTE");
			await new Promise(resolve => setTimeout(resolve, 200));
			return { pasted: true };
		} finally {
			bridge(r, "paste_finish");
		}
	});
	tool("mobile_list_apps", "List all packages installed for owner 0.", deviceSchema, async ({ device }) => ownerRobot(device).adb("shell", "pm", "list", "packages", "--user", "0").toString(), true);
	tool("mobile_launch_app", "Launch an app for owner 0.", { ...deviceSchema, packageName: z.string() }, async ({ device, packageName }) => ownerRobot(device).launchApp(packageName));
	tool("mobile_terminate_app", "Force stop an app for owner 0.", { ...deviceSchema, packageName: z.string() }, async ({ device, packageName }) => ownerRobot(device).terminateApp(packageName));
	tool("mobile_uninstall_app", "Uninstall an app for owner 0; removes its data.", { ...deviceSchema, packageName: z.string() }, async ({ device, packageName }) => ownerRobot(device).uninstallApp(packageName));
	tool("mobile_install_app", "Download an APK from an HTTP(S) URL or install a server-local APK path for owner 0. Returns SHA256. Updates preserve app data.", { ...deviceSchema, source: z.string() }, async ({ device, source }) => {
		const r = ownerRobot(device);
		let file = source;
		const remote = /^https?:\/\//i.test(source);
		if (remote) {
			const dir = process.env.MOBILEMCP_DOWNLOAD_DIR || "/data/downloads";
			fs.mkdirSync(dir, { recursive: true });
			file = path.join(dir, `${randomUUID()}.apk`);
		}
		try {
			if (remote) {
				const response = await fetch(source, { signal: AbortSignal.timeout(600000) });
				if (!response.ok || !response.body) throw new Error(`APK download HTTP ${response.status}`);
				await pipeline(Readable.fromWeb(response.body as any), fs.createWriteStream(file, { flags: "wx" }));
			}
			const hash = createHash("sha256");
			for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
			await r.installApp(file);
			return { installed: true, user: 0, sha256: hash.digest("hex") };
		} finally { if (remote && fs.existsSync(file)) fs.unlinkSync(file); }
	});
	tool("mobile_open_url", "Open a URL in an Android app/browser for owner 0.", { ...deviceSchema, url: z.string().url() }, async ({ device, url }) => ownerRobot(device).openUrl(url));
	tool("mobile_get_device_status", "Read battery, storage and foreground app.", deviceSchema, async ({ device }) => {
		const r = ownerRobot(device);
		return { battery: r.adb("shell", "dumpsys", "battery").toString(), storage: r.adb("shell", "df", "-h", "/data").toString(), foreground: r.adb("shell", "dumpsys", "window", "windows").toString().split("\n").filter(x => /mCurrentFocus|mFocusedApp/.test(x)) };
	}, true);
	tool("mobile_set_orientation", "Set screen orientation for owner 0.", { ...deviceSchema, orientation: z.enum(["portrait", "landscape"]) }, async ({ device, orientation }) => ownerRobot(device).setOrientation(orientation));
	tool("mobile_grant_app_permission", "Grant a declared Android runtime permission for owner 0.", { ...deviceSchema, packageName: z.string(), permission: z.string().regex(/^[a-zA-Z0-9_.]+$/) }, async ({ device, packageName, permission }) => {
		validatePackageName(packageName);
		return ownerRobot(device).adb("shell", "pm", "grant", "--user", "0", packageName, permission).toString();
	});
	tool("mobile_read_sms", "Read received/sent SMS on this phone. Optional since timestamp in Unix milliseconds.", { ...deviceSchema, limit: z.number().int().min(1).max(100).default(20), since: z.number().nonnegative().default(0) }, async ({ device, limit, since }) => bridge(ownerRobot(device), "read_sms", { limit, since }), true);
	tool("mobile_send_sms", "Send a real SMS to the specified recipient. Carrier charges may apply. Requires the user's intended destination and message.", { ...deviceSchema, recipient: z.string().regex(/^[+0-9][0-9 ()-]*$/), text: z.string().min(1) }, async ({ device, recipient, text }) => bridge(ownerRobot(device), "send_sms", { recipient, text }));
	return server;
};
