#!/bin/bash
# Pi: point HMI at PC running npm run dev (same Mongo as website on PC)
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CFG="$ROOT/data/backend.json"
IP="${1:-100.90.128.80}"
PORT="${2:-4002}"
URL="http://${IP}:${PORT}"

mkdir -p "$ROOT/data"
cat > "$CFG" <<EOF
{
  "backendBaseUrl": "$URL",
  "canRequireResponse": true
}
EOF
echo "Wrote $CFG → $URL"
echo "Test: curl -v --connect-timeout 10 $URL/api/health"
