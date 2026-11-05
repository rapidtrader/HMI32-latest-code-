#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "=== .env keys (values hidden) ==="
grep -E '^[A-Z_]+=' .env 2>/dev/null | sed 's/=.*/=***/' | sort -u || echo "MISSING .env"
echo ""
echo "=== gps-backend cwd ==="
pm2 describe gps-backend 2>/dev/null | awk '/exec cwd/{print $4}' || true
echo ""
echo "=== node test-mongo-connect.js ==="
node scripts/test-mongo-connect.js
echo ""
echo "=== health ==="
curl -s "http://127.0.0.1:${PORT:-4002}/api/health" || true
echo ""
