#!/bin/sh
# Quick CAN receive test: green = frames on can0, red = none.
# Usage: ./check_can.sh [seconds]
#        ./check_can.sh probe [seconds]   — send 0x200#0101, wait for 0x202
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if [ "$1" = "probe" ]; then
  SEC="${2:-5}"
  exec python3 "$DIR/check_can_receive.py" --setup --probe -t "$SEC"
fi
SEC="${1:-5}"
exec python3 "$DIR/check_can_receive.py" --setup -t "$SEC"
