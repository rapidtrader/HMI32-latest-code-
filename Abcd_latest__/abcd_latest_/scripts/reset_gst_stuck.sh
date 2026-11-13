#!/bin/bash
# Run with HMI *closed* (Ctrl+C main_pyqt5.py). Does not call gst-inspect (avoids new deadlocks).
set -e
echo "[reset_gst] killing hung gst-launch / gst-plugin-scanner / camera probe…"
pkill -9 -f gst-launch-1.0 2>/dev/null || true
pkill -9 -f gst-plugin-scanner 2>/dev/null || true
pkill -9 -f 'gst-inspect-1.0' 2>/dev/null || true
pkill -9 -f warm_gst_registry 2>/dev/null || true
pkill -9 -f yolov5Demo 2>/dev/null || true
for dev in /dev/video0 /dev/video1 /dev/video2 /dev/video3; do
  fuser -k "$dev" 2>/dev/null || true
done
sleep 1
STUCK=$(ps -eo stat,cmd 2>/dev/null | awk '/gst-plugin-scanner/ && $1 ~ /D/ { c++ } END { print c+0 }')
if [ "${STUCK:-0}" -gt 0 ]; then
  echo "[reset_gst] still $STUCK D-state scanner(s) — stop HMI (python3 main_pyqt5) then:"
  echo "  sudo reboot"
  exit 1
fi
echo "[reset_gst] OK — start HMI: cd ~/hmi/abcd_latest_ && ./run_hmi.sh"
