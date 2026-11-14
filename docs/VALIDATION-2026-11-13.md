# Deployment evidence — 2026-11-13 (America/Los_Angeles)

## Passed

- TypeScript compile; owner command routing checks, including rejecting shell
  metacharacters in package names.
- Local HTTP MCP initialize/tools-list and anonymous 401.
- NAS Docker real-phone HTTP MCP initialize and all 21 tool schemas.
- USB device discovery; wake from sleep and dismiss credential-free lock.
- Actual PNG screenshot, screen dimensions, UI hierarchy (7 nodes on tested page).
- List packages, launch Settings, tap/swipe/back on the diagnostic screen.
- Unicode `中文输入 MCP 123 & test` committed and read back from the real Android
  EditText. Previous keyboard remains selected; clipboard restoration implemented.
- APK install through MCP, uninstall the bridge and verify package absent,
  reinstall and verify present. No personal app was removed.
- SMS provider query through MCP after normal Android permission authorization;
  the test uses a future timestamp and returns zero messages, exposing no SMS.
- Container image built from final source, backend bound only to NAS loopback.
- Gateway operator: public unauthenticated 401; isolated OAuth discovery;
  exact two-email Access allow policy; Muse fixed-client authorization and
  ChatGPT dynamic registration; existing Personal MCP and Drama routes retained.

## Not claimed as verified

- No outbound SMS was sent. Phone screenshot showed no cellular network coverage.
- Actual user OAuth login and subsequent public token-to-tool call await the
  user's first sign-in.
- OPPO Android 9 rejects `pm grant` and secure-settings/IME changes through ADB.
  SMS permission was granted using the normal app dialog; Unicode input uses
  clipboard paste. General runtime-grant and rotation tools remain ROM-dependent.
- Long press, URL APK download, and arbitrary third-party app workflows were not
  individually exercised. APK installation was exercised from a server-local file.

Targeted checks were kept within implementation time. Early failures exposed
disabled SSH forwarding, OPPO grant/IME restrictions, and `/dev/tty` UI dump
behavior. Final real-device checks ran inside the NAS backend; the UI driver now
reads a temporary XML file and removes it after each operation.

Source/bridge signing keys and ADB authorization keys are retained separately
from reproducible build cache. The bridge has no network permission. No telemetry
or cloud fleet code is invoked by the NAS Android profile.
