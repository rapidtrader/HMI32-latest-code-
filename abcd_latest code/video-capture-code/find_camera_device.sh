#!/bin/bash
# Find which /dev/video* node has a live picture (try each MIPI / rkcif node).
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=gst_env.sh
source "$DIR/gst_env.sh"
"$DIR/cleanup_gstreamer.sh" || exit 1

CAPS='video/x-raw,format=NV16,width=1920,height=1080,framerate=25/1'
echo "Scanning nodes (CH1 is often video1 or video5 rkcif_scale_ch1, not always video0)..."
echo ""

for dev in /sys/class/video4linux/video*; do
  [ -d "$dev" ] || continue
  node="/dev/$(basename "$dev")"
  name=$(cat "$dev/name" 2>/dev/null || echo "?")
  case "$name" in
    stream_cif_mipi_id*|rkcif_scale_ch*) ;;
    *) continue ;;
  esac
  out="/tmp/find_cam_$(basename "$dev").jpg"
  rm -f "$out"
  if timeout 12 gst-launch-1.0 -q v4l2src device="$node" io-mode=4 num-buffers=1 ! "$CAPS" ! \
    videoconvert ! video/x-raw,format=RGB ! jpegenc ! filesink location="$out" 2>/dev/null; then
    sz=$(stat -c%s "$out" 2>/dev/null || echo 0)
    if [ "${sz:-0}" -gt 10000 ]; then
      echo "OK  $node  ($name)  snapshot=${sz} bytes  -> $out"
    else
      echo "weak $node  ($name)  snapshot=${sz} bytes (tiny/empty)"
    fi
  else
    echo "FAIL $node  ($name)"
  fi
done

echo ""
if ! ls /tmp/find_cam_video*.jpg 2>/dev/null | head -1 | xargs -r test -s; then
  echo "All nodes failed — usually NO frames from driver (not a GStreamer UI bug)."
  echo "Check: camera power/cable, CH1 wiring, supplier Techpoint/serializer init."
  echo "Kernel (last CSI errors):"
  dmesg 2>/dev/null | grep -iE 'rkcif-mipi|csi size err|techpoint' | tail -5 || true
  echo ""
  echo "Quick probe: v4l2-ctl -d /dev/video1 --stream-mmap --stream-count=3 --stream-to=/tmp/t.bin"
  echo "If /tmp/t.bin is 0 bytes → hardware/driver before HMI."
fi
echo "Use the OK node:"
echo "  CAMERA_DEVICE_0=/dev/videoX CAMERA_TEST_SINK=ximagesink $DIR/test_camera_gst.sh"
echo "CH1 often: CAMERA_DEVICE_0=/dev/video1 (mipi_id1)"
