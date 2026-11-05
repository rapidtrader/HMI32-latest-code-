#!/bin/bash
# Fix "ffmpeg: liblapack.so.3: cannot open shared object file" on Debian/Ubuntu servers.
set -euo pipefail

echo "Installing distro ffmpeg + LAPACK libs…"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ffmpeg liblapack3 libopenblas0 libgfortran5

echo ""
echo "Verify:"
/usr/bin/ffmpeg -version | head -n 1
echo ""
echo "Set PM2 env (if needed): FFMPEG_PATH=/usr/bin/ffmpeg"
echo "Then: pm2 restart hmi-backend --update-env"
