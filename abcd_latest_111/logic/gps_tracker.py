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
_modem_enable_done = False
_modem_enable_lock = threading.Lock()
_nmea_satellites = 0
_nmea_fix_quality = 0
_last_at_loc_poll = 0.0
_last_fix_log: Optional[tuple] = None
_last_fix_log_time = 0.0

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


def get_nmea_stats() -> Dict[str, Any]:
    with _lock:
        return {
            "satellites": int(_nmea_satellites),
            "fix_quality": int(_nmea_fix_quality),
            "in_view": int(getattr(_parser, "satellites_in_view", 0)),
        }


def get_cached_fix() -> Optional[Dict[str, Any]]:
    with _lock:
        if _latest_fix is None:
            return None
        return dict(_latest_fix)


def get_track_points(limit: int = 500) -> List[Dict[str, Any]]:
    with _lock:
        if not _track:
            _load_track_file_unlocked()
        pts = list(_track)
    if limit > 0:
        pts = pts[-limit:]
    return pts


def _load_track_file_unlocked() -> None:
    """Restore in-memory track from data/gps_track.json after HMI restart."""
    if not os.path.isfile(TRACK_JSON):
        return
    try:
        with open(TRACK_JSON, encoding="utf-8") as f:
            data = json.load(f)
        points = data.get("points") or []
        if not points:
            return
        for p in points:
            lat, lon = p.get("latitude"), p.get("longitude")
            if lat is None or lon is None:
                continue
            _track.append(
                {
                    "latitude": lat,
                    "longitude": lon,
                    "timestamp": p.get("timestamp"),
                }
            )
    except (OSError, json.JSONDecodeError, TypeError):
        pass


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


def _poll_modem_fix_if_due() -> None:
    global _last_at_loc_poll
    with _lock:
        if _latest_fix and _latest_fix.get("fix_valid"):
            return
    try:
        interval = max(8.0, float(os.environ.get("GPS_AT_LOC_POLL_SEC", "15")))
    except ValueError:
        interval = 15.0
    with _lock:
        if _parser.satellites_in_view >= 4 or _nmea_satellites >= 4:
            interval = min(interval, 12.0)
    now = time.time()
    if now - _last_at_loc_poll < interval:
        return
    _last_at_loc_poll = now
    try:
        from logic.gps_modem import query_quectel_fix

        fix = query_quectel_fix()
        if fix:
            _apply_fix(fix)
            with _lock:
                _status = "fix from modem AT+QGPSLOC"
    except Exception as exc:
        print(f"[GPS] AT loc poll: {exc}")


def _apply_fix(fix: Dict[str, Any]) -> None:
    global _latest_fix, _last_fix_log, _last_fix_log_time
    save_track = False
    lat = fix.get("latitude")
    lon = fix.get("longitude")
    if lat is not None and lon is not None and fix.get("fix_valid"):
        try:
            key = (round(float(lat), 5), round(float(lon), 5))
            now = time.time()
            log_again = (
                _last_fix_log != key
                or (now - _last_fix_log_time) > 120.0
            )
            if log_again:
                _last_fix_log = key
                _last_fix_log_time = now
                print(
                    f"[GPS] fix lat={float(lat):.6f} lon={float(lon):.6f} "
                    f"src={fix.get('source', 'nmea')} sats={fix.get('satellites')}"
                )
        except (TypeError, ValueError):
            pass
    with _lock:
        _latest_fix = fix
        lat = fix.get("latitude")
        lon = fix.get("longitude")
        has_pos = (
            lat is not None
            and lon is not None
            and abs(float(lat)) > 0.0001
            and abs(float(lon)) > 0.0001
        )
        if fix.get("fix_valid") or has_pos:
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


def _ensure_modem_gnss() -> None:
    global _modem_enable_done
    with _modem_enable_lock:
        if _modem_enable_done:
            return
        _modem_enable_done = True
    try:
        from logic.gps_modem import enable_gps_modem

        if enable_gps_modem():
            with _lock:
                _status = "modem GNSS enabled (AT+QGPS=1)"
        else:
            with _lock:
                _status = "modem GNSS enable failed — check GPS_AT_PORT"
    except Exception as exc:
        with _lock:
            _status = f"modem GNSS: {exc}"[:120]


def tracker_is_running() -> bool:
    return bool(_running and _thread is not None and _thread.is_alive())


def _reader_loop() -> None:
    global _status, _serial_errors, _nmea_satellites, _nmea_fix_quality
    try:
        import serial
    except ImportError:
        with _lock:
            _status = "pyserial missing"
        return

    _ensure_modem_gnss()

    port = _serial_port()
    if not port:
        with _lock:
            _status = "GPS_SERIAL_PORT not set"
        return

    while _running:
        try:
            with _lock:
                _status = f"opening {port}"
            try:
                ser = serial.Serial(
                    port,
                    _baud(),
                    timeout=1,
                    exclusive=True,
                )
            except TypeError:
                ser = serial.Serial(port, _baud(), timeout=1)
            with _lock:
                _status = f"tracking on {port}"
            _parser.reset()
            while _running:
                chunk = ser.read(512)
                if not chunk:
                    _poll_modem_fix_if_due()
                    continue
                _parser.calc_gps_info(chunk)
                fix = _parser.merged_fix()
                if fix:
                    _apply_fix(fix)
                else:
                    _poll_modem_fix_if_due()
                    gga = _parser.last_gga
                    if gga:
                        sats = int(gga.get("satellites") or 0)
                        sats = max(sats, int(_parser.satellites_in_view or 0))
                        fq = int(gga.get("fix_quality") or 0)
                        with _lock:
                            _nmea_satellites = sats
                            _nmea_fix_quality = fq
                            if fq > 0 and sats >= 3:
                                _status = f"tracking on {port} — fix soon ({sats} satellites)"
                            elif sats > 0:
                                _status = (
                                    f"tracking on {port} — GNSS on, "
                                    f"{sats} satellites (fix pending)"
                                )
                            else:
                                _status = (
                                    f"tracking on {port} — GNSS on, searching satellites…"
                                )
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
    with _lock:
        if not _track:
            _load_track_file_unlocked()
    _ensure_modem_gnss()
    _running = True
    _thread = threading.Thread(target=_reader_loop, daemon=True, name="gps-tracker")
    _thread.start()


def stop_gps_tracker() -> None:
    global _running
    _running = False
