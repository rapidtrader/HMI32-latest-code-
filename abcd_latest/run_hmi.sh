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
pkill -9 gst-launch-1.0 2>/dev/null || true
fuser -k /dev/video1 2>/dev/null || true
sleep 1

STUCK=$(ps -eo stat,cmd 2>/dev/null | awk '/gst-plugin-scanner/ && $1 ~ /D/ { c++ } END { print c+0 }')
if [ "${STUCK:-0}" -gt 0 ]; then
  echo "WARNING: $STUCK stuck gst-plugin-scanner — cameras will hang until reboot."
  echo "  sudo reboot"
  echo "  then: /home/marvsmart/hmi/video-capture-code/warm_gst_registry.sh"
fi

if [ -x "$DIR/reset_can.sh" ]; then
  "$DIR/reset_can.sh" || true
fi

exec python3 main_pyqt5.py "$@"
