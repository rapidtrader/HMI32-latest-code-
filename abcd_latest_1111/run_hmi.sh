#!/bin/sh
# Start HMI with AHD camera + CAN defaults for this RK3588 board.
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$DIR" || exit 1

export CAMERA_STREAM_IDS="${CAMERA_STREAM_IDS:-all}"
export CAMERA_VIEWER="${CAMERA_VIEWER:-inline}"
# UI CH1–CH4 use data/camera_map.json (override with CAMERA_DEVICE_1 … _4)
export CAMERA_DEVICE_1="${CAMERA_DEVICE_1:-/dev/video1}"
export CAMERA_DEVICE_2="${CAMERA_DEVICE_2:-/dev/video2}"
export CAMERA_DEVICE_3="${CAMERA_DEVICE_3:-/dev/video3}"
export CAMERA_DEVICE_4="${CAMERA_DEVICE_4:-/dev/video0}"
export CAMERA_PIXEL_FORMAT="${CAMERA_PIXEL_FORMAT:-NV12}"
export CAMERA_FPS="${CAMERA_FPS:-20}"

pkill -9 -f yolov5Demo 2>/dev/null || true
pkill -9 -f gst-launch-1.0 2>/dev/null || true
pkill -9 -f gst-plugin-scanner 2>/dev/null || true
fuser -k /dev/video1 2>/dev/null || true
sleep 1

if [ -x "$DIR/scripts/reset_gst_stuck.sh" ]; then
  "$DIR/scripts/reset_gst_stuck.sh" || echo "If reset failed: close HMI, sudo reboot, then ./run_hmi.sh"
fi

if [ -x "$DIR/reset_can.sh" ]; then
  "$DIR/reset_can.sh" || true
elif [ -f "$DIR/reset_can.sh" ]; then
  sh "$DIR/reset_can.sh" || true
fi

exec python3 main_pyqt5.py "$@"
