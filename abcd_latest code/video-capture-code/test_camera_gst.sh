#!/bin/bash
# Quick test: if this shows video, camera + GStreamer OK; white yolov5Demo = Qt/xvimagesink overlay issue.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=gst_env.sh
source "$DIR/gst_env.sh"

DEV="${CAMERA_DEVICE_0:-/dev/video0}"
unset LIBGL_ALWAYS_SOFTWARE

if ! "$DIR/cleanup_gstreamer.sh"; then
  exit 1
fi

if [ -r "/sys/class/video4linux/${DEV##*/}/name" ]; then
  echo "Device $DEV ($(cat "/sys/class/video4linux/${DEV##*/}/name"))"
else
  echo "Device $DEV"
fi
echo "Stop with Ctrl+C only (do not Ctrl+Z — leaves $DEV busy)."
echo "If busy: pkill gst-launch-1.0  OR  kill %1"
echo ""
echo "On RK3588, ximagesink needs BGRx (I420 often gives not-negotiated / black)."
echo "  Recommended: CAMERA_TEST_SINK=ximagesink $0"
echo "  Default autovideosink (Xv) may show a black window even when capture works."
echo "  Save one frame: CAMERA_TEST_SAVE_JPEG=1 $0"
echo "CH1 on hardware is often NOT video0 — try video1 or video5:"
echo "  CAMERA_DEVICE_0=/dev/video1 CAMERA_TEST_SINK=ximagesink $0"
echo "  CAMERA_DEVICE_0=/dev/video5 CAMERA_TEST_SINK=ximagesink $0"
echo "  $DIR/find_camera_device.sh   # scan all MIPI nodes"
echo ""

trap 'pkill -f "gst-launch-1.0.*v4l2src" 2>/dev/null || true' INT TERM

SINK="${CAMERA_TEST_SINK:-autovideosink}"
IO="${V4L2_IO_MODE:-4}"
CAPS="video/x-raw,format=NV16,width=1920,height=1080,framerate=25/1"

if [ "${CAMERA_TEST_SAVE_JPEG:-0}" = "1" ]; then
  OUT="${CAMERA_TEST_JPEG:-/tmp/cam_test_frame.jpg}"
  echo "Saving one frame to $OUT ..."
  gst-launch-1.0 -q v4l2src device="$DEV" io-mode="$IO" num-buffers=1 ! "$CAPS" ! \
    videoconvert ! video/x-raw,format=RGB ! jpegenc ! filesink location="$OUT"
  echo "Done. Open $OUT on PC or: ls -la $OUT"
  exit 0
fi

if [ "$SINK" = "ximagesink" ]; then
  PIX="${CAMERA_PIX_FORMAT:-BGRx}"
else
  PIX="${CAMERA_PIX_FORMAT:-}"
fi

echo "Starting GStreamer (sink=$SINK io-mode=$IO pix=${PIX:-auto})..."
if [ -n "$PIX" ]; then
  gst-launch-1.0 -v v4l2src device="$DEV" io-mode="$IO" ! "$CAPS" ! \
    videoconvert ! "video/x-raw,format=${PIX}" ! "$SINK" sync=false
else
  gst-launch-1.0 -v v4l2src device="$DEV" io-mode="$IO" ! "$CAPS" ! \
    videoconvert ! "$SINK" sync=false
fi
