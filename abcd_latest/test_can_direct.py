#!/usr/bin/env python3
"""Test both can_send and direct send like cansend"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

print("="*50)
print("TEST 1: Using can_send(0x01, 1)")
from hardware.can_sender import can_send, _get_bus
print("Calling can_send(0x01,1)...")
result = can_send(0x01, 1)
print(f"Result: {result}")

print("\n" + "="*50)
print("TEST 2: Direct send using python-can like cansend 200#0101")
import can as _can

bus = _can.interface.Bus(channel='can0', interface='socketcan')
print(f"Opened direct bus: {bus}")
msg1 = _can.Message(arbitration_id=0x200, data=[0x01, 0x01], is_extended_id=False)
print(f"Direct send msg: {msg1}")
try:
    bus.send(msg1)
    print("Direct send success!")
except Exception as e:
    print(f"Direct send failed: {e}")

import time
time.sleep(1)

print("\n" + "="*50)
print("TEST 3: Direct send OFF: 200#0100")
msg2 = _can.Message(arbitration_id=0x200, data=[0x01, 0x00], is_extended_id=False)
print(f"Direct send msg 2: {msg2}")
try:
    bus.send(msg2)
    print("Direct send success!")
except Exception as e:
    print(f"Direct send failed: {e}")
