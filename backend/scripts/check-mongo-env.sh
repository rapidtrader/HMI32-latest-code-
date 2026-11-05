#!/bin/bash
# Run on VPS: bash scripts/check-mongo-env.sh
set -euo pipefail
cd "$(dirname "$0")/.."
echo "=== /var/www/hmi/backend/.env (keys only) ==="
grep -E '^[A-Z_]+=' .env 2>/dev/null | sed 's/=.*/=***/' || echo "MISSING .env"
echo ""
echo "=== PM2 hmi-backend env (MONGODB*) ==="
pm2 env hmi-backend 2>/dev/null | grep -E '^MONGODB_' | sed 's/=.*/=***/' || echo "hmi-backend not in pm2"
echo ""
echo "=== curl health ==="
curl -s "http://127.0.0.1:${PORT:-4002}/api/health" || true
echo ""
echo "=== ffmpeg ==="
/usr/bin/ffmpeg -version 2>/dev/null | head -1 || echo "install: apt install ffmpeg liblapack3"
