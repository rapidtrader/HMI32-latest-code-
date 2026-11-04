#!/bin/bash
# Clear stuck GStreamer plugin scanners and camera viewers (safe to run anytime).
set -u

count_scanners() {
  ps -eo stat,cmd 2>/dev/null | awk '/gst-plugin-scanner/ && $1 ~ /D/ { c++ } END { print c+0 }'
}

count_zombie_gst() {
  ps -eo stat,cmd 2>/dev/null | awk '/gst-launch-1.0/ && $1 ~ /Z/ { c++ } END { print c+0 }'
}

should_skip_pid() {
  local pid="$1"
  [ "$pid" -eq $$ ] && return 0
  local keep
  for keep in ${GST_CLEANUP_KEEP_PIDS:-}; do
    [ -n "$keep" ] && [ "$pid" -eq "$keep" ] && return 0
  done
  return 1
}

kill_other() {
  local sig="$1"
  local pattern="$2"
  local pid
  while IFS= read -r pid; do
    [ -z "$pid" ] && continue
    if should_skip_pid "$pid"; then
      continue
    fi
    kill "$sig" "$pid" 2>/dev/null || true
  done < <(pgrep -f "$pattern" 2>/dev/null || true)
}

echo "Stopping camera viewers..."
kill_other TERM '/yolov5Demo'
kill_other TERM gst-launch-1.0
sleep 1
kill_other 9 '/yolov5Demo'
kill_other 9 gst-launch-1.0
kill_other 9 gst-plugin-scanner
sleep 1

n_scan=$(count_scanners)
n_zgst=$(count_zombie_gst)
n_demo=$(pgrep -c '/yolov5Demo' 2>/dev/null || true)
n_demo=${n_demo:-0}

echo "Stuck plugin scanners (D state, need reboot): $n_scan"
echo "Zombie gst-launch: $n_zgst  yolov5Demo: $n_demo"

if [ "$n_scan" -gt 0 ] || [ "$n_zgst" -gt 0 ]; then
  echo ""
  echo ">>> Reboot required before GStreamer will work reliably."
  echo "    Kill cannot remove D-state gst-plugin-scanner (kernel stuck on plugin load)."
  echo "    After reboot: stop HMI, run warm_gst_registry.sh once, then test_camera_gst.sh"
  exit 1
fi

exit 0
