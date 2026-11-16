#!/bin/bash
# Create local clip index (run from abcd_latest root on Pi).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p data/video_clips
if [ ! -f data/camera_videos.json ]; then
  if [ -f data/camera_videos.json.example ]; then
    cp data/camera_videos.json.example data/camera_videos.json
  else
    printf '%s\n' '{"version":1,"updated_at":null,"clips":[]}' > data/camera_videos.json
  fi
  echo "Created: $ROOT/data/camera_videos.json"
else
  echo "Already exists: $ROOT/data/camera_videos.json"
fi
python3 -c "from logic.camera_videos_store import STORE_PATH; print('STORE_PATH=', STORE_PATH)" 2>/dev/null || true
