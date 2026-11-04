#!/bin/sh
set -e
cd "$(dirname "$0")"
mkdir -p build
cd build

QMAKE=""
for c in qmake-qt5 qmake qt5-qmake /usr/lib/qt5/bin/qmake; do
  if command -v "$c" >/dev/null 2>&1; then
    QMAKE="$c"
    break
  fi
  if [ -x "$c" ]; then
    QMAKE="$c"
    break
  fi
done

if [ -z "$QMAKE" ]; then
  echo "ERROR: qmake not found."
  echo "Install (if apt works on your image): sudo apt-get install -y qtbase5-dev qt5-qmake build-essential"
  echo "Or use HMI Cameras with gst viewer (no rebuild): CAMERA_VIEWER=gst ./run_hmi.sh"
  exit 1
fi

if [ ! -f /usr/include/gstreamer-1.0/gst/video/videooverlay.h ] \
   && [ ! -f /usr/include/gst/video/videooverlay.h ]; then
  echo "ERROR: missing GStreamer video headers (gst/video/videooverlay.h)."
  echo "Install: sudo apt-get install -y libgstreamer-plugins-base1.0-dev libgstreamer1.0-dev"
  echo "Firefly images: use vendor repo when wiki.t-firefly.com is reachable."
  echo "Or skip rebuild — HMI camera works with: CAMERA_VIEWER=gst ./run_hmi.sh"
  exit 1
fi

echo "Using: $QMAKE"
"$QMAKE" ..
make -j"$(nproc 2>/dev/null || echo 2)"
chmod +x yolov5Demo
echo "Built: $(pwd)/yolov5Demo"
