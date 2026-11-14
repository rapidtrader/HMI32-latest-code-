import time
import threading
import board
from hardware.relay_io_map import print_all_stop_pin_table
import busio
from adafruit_mcp230xx.mcp23017 import MCP23017
from digitalio import Direction

# =========================================================
# I2C SETUP - COMMENTED OUT FOR STM32 CAN GPIO
# =========================================================

# i2c = busio.I2C(board.SCL, board.SDA)

# while not i2c.try_lock():
#     pass

# i2c.unlock()

# mcp1 = MCP23017(i2c, address=0x26)
# mcp2 = MCP23017(i2c, address=0x27)



# =========================================================
# FORCE ALL PINS SAFE - COMMENTED OUT FOR STM32 CAN GPIO
# =========================================================

# from digitalio import Direction
# import time

# for i in range(16):
#     pin1 = mcp1.get_pin(i)
#     pin1.switch_to_output(value=False)   # LOW → OFF

#     pin2 = mcp2.get_pin(i)
#     pin2.switch_to_output(value=False)   # LOW → OFF
 


# =========================================================
# DEVICE CLASSES - COMMENTED OUT FOR STM32 CAN GPIO
# =========================================================
# from digitalio import Direction

# class OutputDevice:

#     def __init__(self, pin):
#         self.pin = pin
#         self.pin.direction = Direction.OUTPUT

#         # OFF at startup
#         self.pin.value = False   # LOW → OFF

#     def on(self):
#         self.pin.value = True    # HIGH → ON

#     def off(self):
#         self.pin.value = False   # LOW → OFF

#     @property
#     def value(self):
#         return self.pin.value

#     @value.setter
#     def value(self, v):
#         if v:
#             self.on()
#         else:
#             self.off()

# # MCP23017 has no real PWM
# class PWMOutputDevice(OutputDevice):

#     def __init__(self, pin):
#         super().__init__(pin)
#         self._value = 0

#     @property
#     def value(self):
#         return self._value

#     @value.setter
#     def value(self, v):
#         self._value = v
#         self.pin.value = v > 0


# =========================================================
# RELAY DEFINITIONS - COMMENTED OUT FOR STM32 CAN GPIO
# =========================================================

# # ---------- MCP1 : Address 0x26 ----------

# # PORT A
# SUCTION = PWMOutputDevice(mcp1.get_pin(0))       # PA0
# VACUUM = SUCTION
# JET = OutputDevice(mcp1.get_pin(1))              # PA1
# BRUSH_SPRAY = OutputDevice(mcp1.get_pin(2))      # PA2
# DUMP_UP = OutputDevice(mcp1.get_pin(3))          # PA3
# DUMP_DOWN = OutputDevice(mcp1.get_pin(4))        # PA4
# GATE_OPEN = OutputDevice(mcp1.get_pin(5))        # PA5
# GATE_CLOSE = OutputDevice(mcp1.get_pin(6))       # PA6
# RESERVE = OutputDevice(mcp1.get_pin(7))          # PA7

# # PORT B
# LEFT_EXTEND = OutputDevice(mcp1.get_pin(8))      # PB0
# LEFT_RETRACT = OutputDevice(mcp1.get_pin(9))     # PB1
# RIGHT_EXTEND = OutputDevice(mcp1.get_pin(10))    # PB2
# RIGHT_RETRACT = OutputDevice(mcp1.get_pin(11))   # PB3
# REAR_UP = OutputDevice(mcp1.get_pin(12))         # PB4
# REAR_DOWN = OutputDevice(mcp1.get_pin(13))       # PB5
# FRONT_UP = OutputDevice(mcp1.get_pin(14))        # PB6
# FRONT_DOWN = OutputDevice(mcp1.get_pin(15))      # PB7


# # ---------- MCP2 : Address 0x27 ----------

# # Litter picker — PB0 (pin index 8)
# _LITTER_PIN = mcp2.get_pin(8)
# LITTER_ON = OutputDevice(_LITTER_PIN)
# LITTER_OFF = OutputDevice(_LITTER_PIN)

# # Auto sweeping — PB1 (pin index 9)
# _SWEEP_PIN = mcp2.get_pin(9)
# SWEEP_ON = OutputDevice(_SWEEP_PIN)
# SWEEP_OFF = OutputDevice(_SWEEP_PIN)

# FILTER_ACT_OPEN = OutputDevice(mcp2.get_pin(11)) # PB3
# FILTER_ACT_CLOSE = OutputDevice(mcp2.get_pin(12))# PB4
# FILTER_MOTOR = OutputDevice(mcp2.get_pin(13))    # PB5

# # MCP2 PB6 (pin index 14) — held ON for whole HMI session; OFF on shutdown / ALL STOP
# MCP2_PB6_ALWAYS_ON = OutputDevice(mcp2.get_pin(14))

# # Aliases for logic layer (same physical outputs — adjust wiring if needed)
# FILTER_CLEAN = FILTER_MOTOR
# DUMP_LEFT = RESERVE

# Inputs



# =========================================================
# RELAY LIST - COMMENTED OUT FOR STM32 CAN GPIO
# =========================================================

# ALL_RELAYS = [
#     SUCTION, JET, BRUSH_SPRAY,
#     DUMP_UP, DUMP_DOWN,
#     GATE_OPEN, GATE_CLOSE,
#     LEFT_EXTEND, LEFT_RETRACT,
#     RIGHT_EXTEND, RIGHT_RETRACT,
#     REAR_UP, REAR_DOWN,
#     FRONT_UP, FRONT_DOWN,
#     LITTER_ON, LITTER_OFF,
#     SWEEP_ON, SWEEP_OFF,
#     FILTER_ACT_OPEN, FILTER_ACT_CLOSE,
#     FILTER_MOTOR,
#     MCP2_PB6_ALWAYS_ON,
#     RESERVE,
# ]


# def _mcp2_pb6_session_hold_on():
#     """Energize PB6 as soon as GPIO module loads; stays on until process exit / safe_shutdown."""
#     try:
#         MCP2_PB6_ALWAYS_ON.on()
#          print("CAN 0x27 PB6: ON ")
#     except Exception as e:
#         print("CAN 0x27 PB6:  FAILED", e)


# _mcp2_pb6_session_hold_on()

# =========================================================
# SAFETY FUNCTIONS - COMMENTED OUT FOR STM32 CAN GPIO
# =========================================================
# import atexit
# import signal
# import sys


# import time

# def safe_shutdown():

#     print("Shutdown → turning all relays OFF")

#     for r in ALL_RELAYS:
#         try:
#             r.off()
#         except:
#             pass

#     time.sleep(0.3)


# atexit.register(safe_shutdown)


# def handle_exit(signum, frame):
#     safe_shutdown()
#     sys.exit(0)


# signal.signal(signal.SIGTERM, handle_exit)
# signal.signal(signal.SIGINT, handle_exit)


# def all_stop():
#     print("ALL STOP ACTIVATED")
#     print_all_stop_pin_table()
#     for r in ALL_RELAYS:
#         r.off()


# def safe_on(relay):
#     relay.on()


# def safe_off(relay):
#     relay.off()


# def interlock(a, b):
#     a.off()
#     b.off()


# =========================================================
# SUCTION CONTROL - COMMENTED OUT FOR STM32 CAN GPIO
# =========================================================

# def set_suction_power(volts):

#     try:
#         value = float(volts)
#     except:
#         return

#     if value < 0:
#         value = 0

#     if value > 3.3:
#         value = 3.3

#     duty = value / 3.3
#     SUCTION.value = duty

#     print(f"SUCTION POWER {value:.2f}V")


# =========================================================
# MOMENTARY RELAY - COMMENTED OUT FOR STM32 CAN GPIO
# =========================================================

# def momentary(relay, sec=1.5):

#     def run():
#         relay.on()
#         time.sleep(sec)
#         relay.off()

#     threading.Thread(target=run).start()


# =========================================================
# HYDRAULIC CONTROLS - COMMENTED OUT FOR STM32 CAN GPIO
# =========================================================

# def dump_up():
#     interlock(DUMP_UP, DUMP_DOWN)
#     safe_on(DUMP_UP)


# def dump_down():
#     interlock(DUMP_UP, DUMP_DOWN)
#     safe_on(DUMP_DOWN)


# def gate_open():
#     interlock(GATE_OPEN, GATE_CLOSE)
#     safe_on(GATE_OPEN)


# def gate_close():
#     interlock(GATE_OPEN, GATE_CLOSE)
#     safe_on(GATE_CLOSE)


# def brush_front_down():
#     interlock(FRONT_UP, FRONT_DOWN)
#     safe_on(FRONT_DOWN)


# def brush_front_up():
#     interlock(FRONT_UP, FRONT_DOWN)
#     safe_on(FRONT_UP)


# def brush_rear_down():
#     interlock(REAR_UP, REAR_DOWN)
#     safe_on(REAR_DOWN)


# def brush_rear_up():
#     interlock(REAR_UP, REAR_DOWN)
#     safe_on(REAR_UP)


# def left_extend():
#     interlock(LEFT_EXTEND, LEFT_RETRACT)
#     safe_on(LEFT_EXTEND)


# def left_retract():
#     interlock(LEFT_EXTEND, LEFT_RETRACT)
#     safe_on(LEFT_RETRACT)


# def right_extend():
#     interlock(RIGHT_EXTEND, RIGHT_RETRACT)
#     safe_on(RIGHT_EXTEND)


# def right_retract():
#     interlock(RIGHT_EXTEND, RIGHT_RETRACT)
#     safe_on(RIGHT_RETRACT)


