#!/bin/bash
# Clean env for xvimagesink (do not inherit HMI software GL).
DIR="$(cd "$(dirname "$0")" && pwd)"
BIN="$DIR/build/yolov5Demo"
LOG="${CAMERA_VIEWER_LOG:-/tmp/yolov5demo.log}"

: >"$LOG"

if [ ! -f "$BIN" ]; then
  echo "Missing: $BIN" | tee -a "$LOG"
  exit 1
fi
chmod +x "$BIN" 2>/dev/null || true

# shellcheck source=gst_env.sh
source "$DIR/gst_env.sh"
export GST_CLEANUP_KEEP_PIDS="$$"
if ! "$DIR/cleanup_gstreamer.sh"; then
  exit 1
fi

export HMI_CAMERA_CHILD=1
export QT_QPA_PLATFORM=xcb
unset LIBGL_ALWAYS_SOFTWARE QT_OPENGL QT_QUICK_BACKEND QT_XCB_GL_INTEGRATION
unset QT_QUICK_CONTROLS_STYLE QML_DISABLE_DISK_CACHE

if [ "${CAMERA_GST_DEBUG:-0}" = "1" ]; then
  export GST_DEBUG=2
fi

echo "=== $(date) starting $BIN ===" >>"$LOG"
"$BIN" "$@" 2>&1 | tee -a "$LOG"
exit "${PIPESTATUS[0]}"
