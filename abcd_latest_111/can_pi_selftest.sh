#!/bin/sh
# Pi-only CAN check: loopback ON -> your TX must appear in candump.
# Then loopback OFF -> listen for STM32 (0x201-0x205). Empty = wiring/STM32/transceiver.
set -e
IF=can0
BITRATE=125000
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

echo "=== Pi CAN self-test (loopback) ==="
sudo ip link set "$IF" down 2>/dev/null || true
sudo ip link set "$IF" type can bitrate "$BITRATE" loopback on restart-ms 100
sudo ip link set "$IF" up
sleep 0.3

LOG="/tmp/can_loopback_$$.log"
timeout 2 candump -t a "$IF" >"$LOG" 2>&1 &
DP=$!
sleep 0.2
cansend "$IF" 200#0101 2>&1 || echo "cansend failed (see dmesg)"
sleep 0.8
wait "$DP" 2>/dev/null || true

if grep -qE ' 200 ' "$LOG" || grep -qE ' 200\t' "$LOG"; then
  echo "LOOPBACK OK: Pi can0 TX/RX works (driver OK)."
else
  echo "LOOPBACK FAIL: no 0x200 in candump — Pi driver/interface problem."
  cat "$LOG"
  rm -f "$LOG"
  exit 1
fi
rm -f "$LOG"

echo ""
echo "=== Listen for STM32 (loopback OFF, 12s) ==="
echo "    Power STM32 + same CAN H/L/GND as Pi before this step."
sudo ip link set "$IF" down 2>/dev/null || true
sudo ip link set "$IF" type can bitrate "$BITRATE" loopback off restart-ms 100
sudo ip link set "$IF" up
sleep 0.3

timeout 12 candump -t a "$IF" | tee "/tmp/can_stm32_$$.log" | head -30
echo ""
if [ -s "/tmp/can_stm32_$$.log" ]; then
  echo "RESULT: STM32 (or another node) is visible on the bus."
  grep -qE ' 202 ' "/tmp/can_stm32_$$.log" && echo "  Saw 0x202 — HMI protocol OK."
else
  echo "RESULT: Bus quiet — fix STM32 power, PD0/PD1->transceiver->H/L, GND, STB pin, 120R."
  echo "  On MCU: PC6 slow blink ~500ms = firmware running; fast = Error_Handler."
fi
rm -f "/tmp/can_stm32_$$.log"