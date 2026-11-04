#!/usr/bin/env python3
"""Listen on can0 for 5 seconds and report which CAN IDs were seen."""
import sys
import time

if sys.platform != "linux":
    print("Run this on the RK356x board (Linux), not on Windows.")
    sys.exit(1)

try:
    import can
except ImportError:
    print("python-can not installed")
    sys.exit(1)

LISTEN_SEC = 5
WANT_IDS = {0x201, 0x202, 0x203, 0x204, 0x205}

print(f"Listening on can0 for {LISTEN_SEC}s (stop main_pyqt5.py first)...")
bus = can.interface.Bus(channel="can0", interface="socketcan")
seen = {}
deadline = time.time() + LISTEN_SEC

try:
    while time.time() < deadline:
        msg = bus.recv(timeout=0.2)
        if msg is None:
            continue
        aid = msg.arbitration_id
        seen[aid] = seen.get(aid, 0) + 1
        print(f"  RX  ID=0x{aid:03X}  data={[hex(b) for b in msg.data]}")
finally:
    bus.shutdown()

print("\nSummary:")
if not seen:
    print("  NO messages received from bus.")
    print("  STM32 is not transmitting (check power, wiring, firmware, CAN pins).")
else:
    for aid, count in sorted(seen.items()):
        tag = "STM32" if aid in WANT_IDS else "other"
        print(f"  0x{aid:03X}: {count} frame(s) [{tag}]")

if not any(aid in WANT_IDS for aid in seen):
    print("\nNo 0x201-0x205 from STM32 -> UI will stay RED (no response to wait for).")
