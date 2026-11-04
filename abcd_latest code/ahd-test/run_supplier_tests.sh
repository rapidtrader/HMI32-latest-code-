#!/bin/bash
# Commands from supplier plusg-ahd-test.md (CH0–CH3 = video0–video3).
set -u
export DISPLAY="${DISPLAY:-:0}"
export XAUTHORITY="${XAUTHORITY:-$HOME/.Xauthority}"
GOMP=/lib/aarch64-linux-gnu/libgomp.so.1
[ -f "$GOMP" ] && export LD_PRELOAD="$GOMP${LD_PRELOAD:+:$LD_PRELOAD}"

DIR="$(cd "$(dirname "$0")" && pwd)"
DEV="${CAMERA_DEVICE_0:-/dev/video0}"
MODE="${1:-gst}"   # gst | v4l2 | demo | jpeg

# One consumer only — never run gst + yolov5Demo together.
pkill -9 gst-launch-1.0 2>/dev/null || true
pkill -9 -f '/yolov5Demo' 2>/dev/null || true
pkill -9 v4l2-ctl 2>/dev/null || true
sleep 1
if fuser /dev/video0 /dev/video1 >/dev/null 2>&1; then
  echo "WARNING: video0/1 still busy:"
  fuser -v /dev/video0 /dev/video1 2>&1 || true
fi

case "$MODE" in
  v4l2)
    echo "=== Supplier v4l2-ctl NV12 on $DEV ==="
    rm -f /tmp/mstahd.yuv
    v4l2-ctl --verbose -d "$DEV" \
      --set-fmt-video=width=1920,height=1080,pixelformat=NV12 \
      --stream-mmap=3 --stream-to=/tmp/mstahd.yuv --stream-count=30 --stream-poll
    ls -la /tmp/mstahd.yuv
    echo "Play: ffplay -f rawvideo -video_size 1920x1080 -pix_fmt nv12 /tmp/mstahd.yuv"
    ;;
  jpeg)
    echo "=== One JPEG from $DEV (NV12) ==="
    OUT=/tmp/ahd_test.jpg
    rm -f "$OUT"
    gst-launch-1.0 -v v4l2src device="$DEV" num-buffers=1 ! \
      "video/x-raw,format=NV12,width=1920,height=1080,framerate=20/1" ! \
      videoconvert ! video/x-raw,format=RGB ! jpegenc ! filesink location="$OUT"
    ls -la "$OUT"
    ;;
  demo)
    echo "=== Run supplier yolov5Demo ==="
    chmod +x "$DIR/yolov5Demo"
    cd "$DIR"
    exec ./yolov5Demo
    ;;
  gst|*)
    echo "=== Supplier gst-launch NV12 + ximagesink on $DEV ==="
    echo "Stop with Ctrl+C. Try also: CAMERA_DEVICE_0=/dev/video1 $0 gst"
    echo "If black: confirm AHD camera has SEPARATE 12V power (supplier point 4)."
    SINK=ximagesink
    gst-launch-1.0 -v v4l2src device="$DEV" ! \
      "video/x-raw,format=NV12,width=1920,height=1080,framerate=20/1" ! \
      videoconvert ! "$SINK"
    ;;
esac
