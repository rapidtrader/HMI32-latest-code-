#!/bin/sh
# One AHD camera — same pipeline as ahd-test/run_supplier_tests.sh (no Qt rebuild needed).
set -eu
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck source=gst_env.sh
[ -f "$DIR/gst_env.sh" ] && . "$DIR/gst_env.sh"

export DISPLAY="${DISPLAY:-:0}"
export XAUTHORITY="${XAUTHORITY:-$HOME/.Xauthority}"

DEV="${CAMERA_DEVICE_0:-/dev/video1}"
FMT="${CAMERA_PIXEL_FORMAT:-NV12}"
FPS="${CAMERA_FPS:-20}"
W="${CAMERA_SRC_WIDTH:-1920}"
H="${CAMERA_SRC_HEIGHT:-1080}"
LOG="${CAMERA_VIEWER_LOG:-/tmp/yolov5demo.log}"

pkill -9 gst-launch-1.0 2>/dev/null || true
sleep 0.5

echo "=== $(date) single camera viewer dev=$DEV fmt=$FMT ${W}x${H}@${FPS} ===" >>"$LOG"
echo "Pipeline: v4l2src device=$DEV ! ${FMT} ${W}x${H} @ ${FPS}fps ! ximagesink" >>"$LOG"

# Do not use "| tee" — HMI QProcess does not read stdout; pipe fill = hang / frozen frame.
echo "--- gst-launch start $(date) ---" >>"$LOG"
gst-launch-1.0 -q \
  v4l2src device="$DEV" ! \
  "video/x-raw,format=${FMT},width=${W},height=${H},framerate=${FPS}/1" ! \
  videoconvert ! ximagesink sync=false >>"$LOG" 2>&1
rc=$?
echo "--- gst-launch exit $rc $(date) ---" >>"$LOG"
exit "$rc"
