# Transages Android NAS deployment

This fork adds a dedicated Android owner deployment to Mobile Next (Apache-2.0).
Upstream iOS/cloud modes remain available outside this deployment. The NAS profile
uses the existing Android driver directly, without mobilecli auto-install or
telemetry. All user-scoped commands explicitly target owner user 0.

## Services

- Public MCP endpoint: `https://mcp.transages.com/mobile` (Streamable HTTP).
- Identity gateway: separate Cloudflare Access application, configured by the MCP
  server deployment. Existing Personal MCP root and Drama routes stay independent.
- Backend: NAS loopback `127.0.0.1:18793/mcp`, mandatory private Bearer token.
- ADB: `mobile-mcp-adb:5037` on the Docker `mobile-mcp` network, no published port.
- Persistent NAS root: `/vol1/1000/mobile-mcp`.
- Private backend env: `private/backend.env`, single `MOBILEMCP_AUTH=...` line.
- ADB trust keys: `adb-keys/`. Preserve these to keep the phone authorization.
- Downloads: `data/downloads/`. URL APK files are removed after install/failure.

Run `scripts/deploy-nas.sh` for the first backend deployment after placing source,
the built bridge APK, and the private env file. It reuses the existing Google
platform tools mounted from `/vol1/1000/tools/android-platform-tools/platform-tools`.
Do not replace the ADB keys or expose port 5037 to the LAN or Internet.

## Phone bridge

Build `android-bridge/build.ps1` using the existing JDK/Android SDK. Build cache is
on E; signing key stays outside the repository in `E:\Dev\Secrets\mobile-mcp`.
Install `android-bridge/dist/mobile-bridge.apk` with `adb install --user 0 -r`.
It has no network permission and exposes its receiver/diagnostic activities only
to callers holding Android's `DUMP` permission (ADB shell).

On the tested OPPO Android 9, ADB `pm grant` and IME switching are denied by the ROM.
Start `com.transages.mobilebridge/.PermissionsActivity` with `am start --user 0`
and allow the normal SMS permission dialog. Unicode input uses the Android
clipboard and paste key, restoring the prior clip and preserving the keyboard.
The bridge stores no SMS database; reads are live Android provider queries.

## Tools and limitations

21 tools cover device discovery/status, wake/dismiss swipe lock, screenshot,
UI hierarchy, tap/long press/swipe/buttons, Unicode text, list/launch/stop/install/
uninstall apps, URLs, orientation, runtime permission grants, read SMS and send SMS.
APK installation accepts HTTP(S) download URLs or paths visible in the container.
Authenticated users control the same physical phone; operations are serialized.

Wake does not bypass a password/PIN. SMS send reports submission to Android, not
carrier delivery; a working SIM/network is required. No real outbound SMS is sent
by the checks. Runtime permission grants depend on the ROM (OPPO rejects direct
ADB grant; use the app's normal permission page). Screen hierarchy may be
incomplete on some screens; screenshots remain available.

## Validation

- `npm run build`
- `node scripts/check-owner-routing.cjs` (command routing and package validation)
- `scripts/check-owner.cjs` uses a real HTTP MCP endpoint and a real USB phone.
  `CHECK_INPUT=1` checks actual Unicode text in an ADB-only diagnostic activity.
  SMS reads use a future date range so no private message content is printed.
  `CHECK_INSTALL=1` / `CHECK_LIFECYCLE=1` require a ROM that allows ADB grants;
  on OPPO use normal permission UI during provisioning instead.

## Public client setup

Use `https://mcp.transages.com/mobile` as the Streamable HTTP MCP endpoint.
For clients supporting dynamic OAuth registration (including the configured
ChatGPT connection flow), leave manual client credentials empty and sign in.
For Muse, use public client ID `4df897dc-cd48-42ff-86b5-9a8980d9286f` with no
client secret, and complete browser authorization. The account must be allowed
by the independent Mobile Cloudflare Access policy.

Public anonymous access returns 401 with Mobile-specific OAuth discovery.
The gateway operator verified dynamic client registration and the fixed client's
consent/login entry. A first user sign-in is still required to verify the complete
public token-to-tool flow; backend real-phone operations have passed independently.
