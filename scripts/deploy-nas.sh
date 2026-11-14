#!/bin/sh
set -eu
root=/vol1/1000/mobile-mcp
mkdir -p "$root/data/downloads" "$root/private"
chmod 700 "$root/private"
chmod 600 "$root/private/backend.env"
docker build -f "$root/source/Dockerfile.nas" -t transages-mobile:1.0.0 "$root/source"
if docker container inspect mobile-mcp-backend >/dev/null 2>&1; then
  docker stop -t 5 mobile-mcp-backend
  docker rm mobile-mcp-backend
fi
docker run -d --name mobile-mcp-backend --restart unless-stopped \
  --network mobile-mcp --user 1000:1001 --cap-drop ALL --security-opt no-new-privileges:true \
  -p 127.0.0.1:18793:18793 --env-file "$root/private/backend.env" \
  -v /vol1/1000/tools/android-platform-tools/platform-tools:/opt/android/platform-tools:ro \
  -v "$root/data:/data" -v "$root/source/android-bridge/dist:/opt/bridge:ro" \
  -v "$root/source/scripts:/opt/checks:ro" \
  transages-mobile:1.0.0
