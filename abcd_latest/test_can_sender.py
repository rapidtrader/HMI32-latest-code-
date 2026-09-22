#!/usr/bin/env python3
"""Test can_send.py"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from hardware.can_sender import can_send
import time

print("Testing can_send(0x01, 1) (SUCTION ON)...")
result = can_send(0x01, 1)
print(f"Result: {result}")
time.sleep(1)
print("Testing can_send(0x01, 0) (SUCTION OFF)...")
result = can_send(0x01, 0)
print(f"Result: {result}")
