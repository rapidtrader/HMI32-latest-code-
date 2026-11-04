"""
Continuous GPS read from serial (gps-code style) + track history for HMI map.
"""
from __future__ import annotations

import json
import os
import threading
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any, Deque, Dict, List, Optional

from logic.gps_code_parser import GpsCodeParser

_lock = threading.Lock()
_parser = GpsCodeParser()
_latest_fix: Optional[Dict[str, Any]] = None
_track: Deque[Dict[str, Any]] = deque(maxlen=max(50, int(os.environ.get("GPS_TRACK_MAX_POINTS", "500"))))
_running = False
_thread: Optional[threading.Thread] = None
_status = "idle"
_serial_errors = 0

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRACK_JSON = os.path.join(BASE_DIR, "data", "gps_track.json")


def _serial_port() -> str:
    from logic.gps import _gps_serial_port

    return _gps_serial_port()


def _baud() -> int:
    from logic.gps import _gps_baud

    return _gps_baud()


def get_status() -> str:
    with _lock:
        return _status


def get_cached_fix() -> Optional[Dict[str, Any]]:
    with _lock:
        if _latest_fix is None:
            return None
        return dict(_latest_fix)


def get_track_points(limit: int = 500) -> List[Dict[str, Any]]:
    with _lock:
        pts = list(_track)
    if limit > 0:
        pts = pts[-limit:]
    return pts


def _save_track_file() -> None:
    try:
        os.makedirs(os.path.dirname(TRACK_JSON), exist_ok=True)
        with _lock:
            payload = {
                "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "points": list(_track)[-200:],
            }
        with open(TRACK_JSON, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
    except OSError:
        pass


def _apply_fix(fix: Dict[str, Any]) -> None:
    global _latest_fix
    save_track = False
    with _lock:
        _latest_fix = fix
        if fix.get("fix_valid"):
            _track.append(
                {
                    "latitude": fix["latitude"],
                    "longitude": fix["longitude"],
                    "timestamp": fix.get("timestamp"),
                }
            )
            save_track = len(_track) % 10 == 0
    if save_track:
        _save_track_file()


def _reader_loop() -> None:
    global _status, _serial_errors
    try:
        import serial
    except ImportError:
        with _lock:
            _status = "pyserial missing"
        return

    port = _serial_port()
    if not port:
        with _lock:
            _status = "GPS_SERIAL_PORT not set"
        return

    while _running:
        try:
            with _lock:
                _status = f"opening {port}"
            ser = serial.Serial(port, _baud(), timeout=1)
            with _lock:
                _status = f"tracking on {port}"
            _parser.reset()
            while _running:
                chunk = ser.read(512)
                if not chunk:
                    continue
                _parser.calc_gps_info(chunk)
                fix = _parser.merged_fix()
                if fix:
                    _apply_fix(fix)
            ser.close()
        except Exception as exc:
            _serial_errors += 1
            with _lock:
                _status = f"serial error: {exc}"[:120]
            time.sleep(2.0)


def start_gps_tracker() -> None:
    global _running, _thread
    if _running and _thread and _thread.is_alive():
        return
    _running = True
    _thread = threading.Thread(target=_reader_loop, daemon=True, name="gps-tracker")
    _thread.start()


def stop_gps_tracker() -> None:
    global _running
    _running = False
