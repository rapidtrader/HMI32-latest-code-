#!/bin/bash
# Run once after reboot (before camera tests). Uses scanner wrapper + libgomp preload.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=gst_env.sh
source "$DIR/gst_env.sh"

d_scan=$(ps -eo stat,cmd 2>/dev/null | awk '/gst-plugin-scanner/ && $1 ~ /D/ { c++ } END { print c+0 }')
if [ "${d_scan:-0}" -gt 0 ]; then
  echo "Found $d_scan stuck gst-plugin-scanner (D state). Reboot the board, then run this again."
  echo "Press Ctrl+C if warm_gst_registry is hung from an earlier attempt."
  exit 1
fi

export GST_REGISTRY_UPDATE=yes
echo "Warming GStreamer registry (about 30–90s on first run)..."
if timeout 120 gst-inspect-1.0 videoconvert >/dev/null; then
  echo "  videoconvert OK"
else
  echo "Timed out or failed on videoconvert — reboot and retry."
  exit 1
fi
if timeout 60 gst-inspect-1.0 v4l2src >/dev/null; then
  echo "  v4l2src OK"
else
  echo "Timed out on v4l2src — reboot and retry."
  exit 1
fi
echo "Done."
