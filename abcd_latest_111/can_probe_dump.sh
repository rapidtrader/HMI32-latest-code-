#!/bin/sh
# Run candump and cansend together (common mistake: cansend after candump stopped).
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
sh "$DIR/reset_can.sh" || exit 1

IF=can0
LOG="/tmp/can_probe_$$.log"
echo "=== Listening on $IF while sending 0x200#0101 then 0x200#0100 ==="
echo "    (Your TX on 0x200 is hidden without loopback — only OTHER nodes appear.)"
echo ""

timeout 8 candump -t a "$IF" >"$LOG" 2>&1 &
DUMP_PID=$!
sleep 0.3

CS1="ok"
CS2="ok"
cansend "$IF" 200#0101 2>&1 || CS1="FAIL"
sleep 0.3
cansend "$IF" 200#0100 2>&1 || CS2="FAIL"
echo "cansend vacuum ON=${CS1} OFF=${CS2}"

wait "$DUMP_PID" 2>/dev/null || true

if [ -n "${CS1:-}" ] || [ -n "${CS2:-}" ]; then
  echo "cansend errors: ON=${CS1:-ok} OFF=${CS2:-ok}"
fi

# can0 often has ECHO flag: candump shows your own 0x200 TX — not STM32 reply.
STM32_IDS=" 201  202  203  204  205"

if [ ! -s "$LOG" ]; then
  echo "RESULT: No RX frames in 8s (even while sending)."
  echo "  → Bus quiet: STM32 is NOT sending 0x202 / 0x201 / …"
  echo "  → HMI will stay RED until STM32 Dynaclean firmware replies on 0x202."
else
  echo "=== RX log ==="
  cat "$LOG"
  echo "=== end ==="
  if grep -qE ' 202 ' "$LOG" || grep -qE ' 202\t' "$LOG"; then
    echo "RESULT: Saw 0x202 — HMI protocol reply OK."
  elif grep -qE ' 200 ' "$LOG" && ! grep -qE ' 202 ' "$LOG"; then
    echo "RESULT: Only 0x200 — likely YOUR TX echo on can0 (ECHO flag), not STM32. Need 0x202."
  elif grep -qE ' 004 ' "$LOG" || grep -q ' 004	' "$LOG"; then
    echo "RESULT: Saw 0x004 only — other device, NOT HMI STM32 (need 0x202)."
  else
    echo "RESULT: Some traffic — check IDs above (HMI needs 0x201–0x205)."
  fi
fi
rm -f "$LOG"
