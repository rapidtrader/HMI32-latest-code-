#!/bin/bash
# Pi: point HMI at production (https://hmi.dynacleanindustries.com)
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CFG="$ROOT/data/backend.json"
URL="${1:-https://hmi.dynacleanindustries.com}"
URL="${URL%/}"

mkdir -p "$ROOT/data"
printf '%s\n' "{
  \"backendBaseUrl\": \"$URL\",
  \"canRequireResponse\": true
}" > "$CFG"
echo "Wrote $CFG → $URL"
echo "Test: curl -sS \"$URL/api/health\""
echo "Clips: curl -sS \"$URL/api/camera-videos?limit=1\"  (404 = deploy latest backend on server)"
echo "Optional: add \"cameraAutoSave\": true for website clips after live view is stable"
