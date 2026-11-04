#!/bin/sh
# Clear CAN error state and TX queue (fixes "write: No buffer space available").
# Brings can0 UP (fixes candump "read: Network is down").
# Root cause of no ACK is usually STM32 / wiring — see check_can.sh.
set -e
IF=can0
BITRATE=125000

if ! ip link show "$IF" >/dev/null 2>&1; then
  echo "ERROR: $IF not found — CAN driver / device tree?"
  exit 1
fi

sudo ip link set "$IF" down 2>/dev/null || true
sudo ip link set "$IF" type can bitrate "$BITRATE" restart-ms 100 loopback off
sudo ip link set "$IF" up

echo "=== $IF after reset ==="
ip -details link show "$IF" | sed -n '1,8p'

if ip link show "$IF" | grep -q 'state DOWN'; then
  echo ""
  echo "ERROR: $IF still DOWN — candump will say 'Network is down'."
  echo "Try: sudo ip link set $IF up"
  exit 1
fi

CAN_STATE=$(ip -details link show "$IF" | sed -n 's/.*can state \([^ ]*\).*/\1/p' | head -1)
if [ "$CAN_STATE" = "BUS-OFF" ]; then
  echo ""
  echo "WARNING: CAN is BUS-OFF — reset again or fix wiring / STM32 ACK."
fi

echo ""
echo "OK: $IF is UP (can state ${CAN_STATE:-unknown}). You can run: candump -t a $IF"
