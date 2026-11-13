#!/usr/bin/env python3
"""
Check whether CAN is receiving frames on can0 (STM32 IDs 0x201–0x205).
Prints GREEN when at least one expected frame is seen, RED otherwise.
Exit code: 0 = receiving, 1 = not receiving / error.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import time

GREEN = "\033[32m"
RED = "\033[31m"
YELLOW = "\033[33m"
BOLD = "\033[1m"
RESET = "\033[0m"

STM32_RX_IDS = (0x201, 0x202, 0x203, 0x204, 0x205)
CAN_ID_COMMAND = 0x200
CAN_ID_GPIO_STATUS = 0x202
CAN_INTERFACE = "can0"
BITRATE = 125000


def _color(use_color: bool, code: str, text: str) -> str:
    if not use_color:
        return text
    return f"{code}{text}{RESET}"


def _can_link_up() -> bool:
    try:
        r = subprocess.run(
            ["ip", "-details", "link", "show", CAN_INTERFACE],
            capture_output=True,
            text=True,
            timeout=2,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False
    if r.returncode != 0:
        return False
    return "state UP" in (r.stdout or "")


def _bring_up_can0() -> bool:
    steps = [
        ["sudo", "ip", "link", "set", CAN_INTERFACE, "down"],
        [
            "sudo",
            "ip",
            "link",
            "set",
            CAN_INTERFACE,
            "type",
            "can",
            "bitrate",
            str(BITRATE),
            "restart-ms",
            "100",
            "loopback",
            "off",
        ],
        ["sudo", "ip", "link", "set", CAN_INTERFACE, "up"],
    ]
    for cmd in steps:
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=3)
            if r.returncode != 0 and "down" not in cmd:
                print(_color(True, RED, f"FAIL: {' '.join(cmd)}"))
                if r.stderr:
                    print(r.stderr.strip())
                return False
        except Exception as exc:
            print(_color(True, RED, f"FAIL: {' '.join(cmd)} — {exc}"))
            return False
    return _can_link_up()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Check CAN receive on can0 (green = STM32 frames seen, red = none)."
    )
    parser.add_argument(
        "-t",
        "--seconds",
        type=float,
        default=5.0,
        help="Listen duration in seconds (default: 5)",
    )
    parser.add_argument(
        "--no-color",
        action="store_true",
        help="Plain text output (no ANSI colors)",
    )
    parser.add_argument(
        "--setup",
        action="store_true",
        help="Run ip link setup for can0 @ 125k before listening",
    )
    parser.add_argument(
        "--any-id",
        action="store_true",
        help="Treat any CAN ID as success (default: only 0x201–0x205)",
    )
    parser.add_argument(
        "--probe",
        action="store_true",
        help="Send 0x200 vacuum ON (01 01), pass if 0x202 reply seen (good when bus is quiet)",
    )
    args = parser.parse_args()
    use_color = not args.no_color and sys.stdout.isatty()

    if sys.platform != "linux":
        print(_color(use_color, RED, "CAN check: run on Linux (socketcan), not Windows."))
        return 1

    try:
        import can
    except ImportError:
        print(
            _color(
                use_color,
                RED,
                "CAN check: python-can not installed — pip3 install python-can",
            )
        )
        return 1

    if args.setup or not _can_link_up():
        print(_color(use_color, YELLOW, f"Bringing up {CAN_INTERFACE} @ {BITRATE} bit/s..."))
        if not _bring_up_can0():
            print(
                _color(
                    use_color,
                    RED,
                    f"CAN check: {CAN_INTERFACE} is not UP (wiring/driver/interface name?)",
                )
            )
            return 1

    want = None if args.any_id else set(STM32_RX_IDS)
    listen_sec = max(0.5, args.seconds)

    if args.probe:
        print(
            f"Probe: send 0x{CAN_ID_COMMAND:03X} [01 01] (VACUUM ON), "
            f"listen {listen_sec:g}s for 0x{CAN_ID_GPIO_STATUS:03X} reply..."
        )
    else:
        print(
            f"Listening on {CAN_INTERFACE} for {listen_sec:g}s "
            f"(stop main_pyqt5.py if it already uses can0)..."
        )

    try:
        bus = can.interface.Bus(channel=CAN_INTERFACE, interface="socketcan")
    except Exception as exc:
        err = str(exc).lower()
        if "network is down" in err or not _can_link_up():
            print(
                _color(
                    use_color,
                    RED,
                    "CAN check: can0 is DOWN — run: ./reset_can.sh",
                )
            )
            print("  (candump also shows: read: Network is down)")
        else:
            print(_color(use_color, RED, f"CAN check: cannot open bus — {exc}"))
        return 1

    seen: dict[int, int] = {}
    stm32_seen: dict[int, int] = {}
    got_202_reply = False
    deadline = time.time() + listen_sec
    probe_sent = False

    try:
        while time.time() < deadline:
            if args.probe and not probe_sent:
                probe_msg = can.Message(
                    arbitration_id=CAN_ID_COMMAND,
                    data=[0x01, 0x01],
                    is_extended_id=False,
                )
                try:
                    bus.send(probe_msg)
                    print("  TX  ID=0x200  data=[01 01]")
                    probe_sent = True
                except can.CanError as exc:
                    print(_color(use_color, RED, f"Probe send failed: {exc}"))
                    return 1

            msg = bus.recv(timeout=0.2)
            if msg is None:
                continue
            aid = msg.arbitration_id
            seen[aid] = seen.get(aid, 0) + 1
            if aid in STM32_RX_IDS:
                stm32_seen[aid] = stm32_seen.get(aid, 0) + 1
            if (
                args.probe
                and aid == CAN_ID_GPIO_STATUS
                and len(msg.data) >= 2
                and msg.data[0] == 0x01
            ):
                got_202_reply = True
            data_hex = " ".join(f"{b:02X}" for b in msg.data)
            print(f"  RX  ID=0x{aid:03X}  data=[{data_hex}]")
    finally:
        bus.shutdown()

    if args.probe:
        ok = got_202_reply
    else:
        ok = bool(seen) if args.any_id else bool(stm32_seen)

    print()
    if ok:
        label = "CAN RECEIVE OK"
        if args.probe:
            detail = " — STM32 replied on 0x202"
        elif not args.any_id:
            ids = ", ".join(f"0x{i:03X}" for i in sorted(stm32_seen))
            detail = f" — STM32 frame(s): {ids}"
        else:
            ids = ", ".join(f"0x{i:03X}" for i in sorted(seen))
            detail = f" — ID(s): {ids}"
        print(_color(use_color, GREEN + BOLD, label + detail))
        return 0

    print(_color(use_color, RED + BOLD, "CAN RECEIVE FAIL — no frames received"))
    if args.probe:
        if seen and not got_202_reply:
            others = ", ".join(f"0x{i:03X}" for i in sorted(seen))
            print(
                _color(
                    use_color,
                    YELLOW,
                    f"  Bus RX works (saw {others}) but no 0x202 reply to VACUUM cmd.",
                )
            )
            print(
                "  HMI expects STM32 on IDs 0x201–0x205; 0x004 is another device / wrong firmware."
            )
        else:
            print(
                "  No 0x202 after 0x200#0101 — STM32 not replying on GPIO status ID."
            )
    elif not args.any_id and seen:
        print(
            _color(
                use_color,
                YELLOW,
                "  (Other IDs seen but not 0x201–0x205 — try --any-id or check STM32 firmware)",
            )
        )
    else:
        print("  Check: STM32 power, CAN H/L, 120Ω termination, bitrate 125k, GND common.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
