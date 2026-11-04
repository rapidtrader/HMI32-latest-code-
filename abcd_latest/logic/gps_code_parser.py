"""
NMEA GPS parser — logic ported from /home/marvsmart/hmi/gps-code (GPGGA / GPRMC / GN*).

Public API mirrors calcGpsInfo(inData, len): feed bytes, read merged fix dict.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional


def _find_comma_field(buf: str, field_num: int) -> Optional[str]:
    if field_num < 1:
        return None
    start = 0
    for _ in range(field_num):
        idx = buf.find(",", start)
        if idx < 0:
            return None
        if _ == field_num - 1:
            end = buf.find(",", idx + 1)
            if end < 0:
                end = buf.find("*", idx + 1)
            if end < 0:
                end = len(buf)
            return buf[idx + 1 : end]
        start = idx + 1
    return None


def _parse_float(raw: Optional[str]) -> Optional[float]:
    if raw is None or raw == "":
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def _parse_int(raw: Optional[str]) -> Optional[int]:
    if raw is None or raw == "":
        return None
    try:
        return int(float(raw))
    except ValueError:
        return None


def nmea_to_decimal(raw: Optional[float], hemisphere: Optional[str]) -> Optional[float]:
    if raw is None:
        return None
    deg = int(raw // 100)
    minutes = raw - deg * 100
    dec = deg + minutes / 60.0
    if hemisphere in ("S", "W"):
        dec = -dec
    return dec


def _parse_gga(line: str) -> Dict[str, Any]:
    out: Dict[str, Any] = {"sentence": "GGA", "raw_line": line.strip()}
    out["utc_time"] = _parse_float(_find_comma_field(line, 1))
    lat_raw = _parse_float(_find_comma_field(line, 2))
    lat_h = (_find_comma_field(line, 3) or "").strip() or None
    lon_raw = _parse_float(_find_comma_field(line, 4))
    lon_h = (_find_comma_field(line, 5) or "").strip() or None
    out["latitude"] = nmea_to_decimal(lat_raw, lat_h)
    out["longitude"] = nmea_to_decimal(lon_raw, lon_h)
    out["fix_quality"] = _parse_int(_find_comma_field(line, 6)) or 0
    out["satellites"] = _parse_int(_find_comma_field(line, 7))
    out["hdop"] = _parse_float(_find_comma_field(line, 8))
    out["altitude"] = _parse_float(_find_comma_field(line, 9))
    return out


def _parse_rmc(line: str) -> Dict[str, Any]:
    out: Dict[str, Any] = {"sentence": "RMC", "raw_line": line.strip()}
    out["utc_time"] = _parse_float(_find_comma_field(line, 1))
    out["status"] = (_find_comma_field(line, 2) or "").strip()
    lat_raw = _parse_float(_find_comma_field(line, 3))
    lat_h = (_find_comma_field(line, 4) or "").strip() or None
    lon_raw = _parse_float(_find_comma_field(line, 5))
    lon_h = (_find_comma_field(line, 6) or "").strip() or None
    out["latitude"] = nmea_to_decimal(lat_raw, lat_h)
    out["longitude"] = nmea_to_decimal(lon_raw, lon_h)
    out["speed_knots"] = _parse_float(_find_comma_field(line, 7))
    out["course"] = _parse_float(_find_comma_field(line, 8))
    date_raw = _find_comma_field(line, 9)
    out["date_ddmmyy"] = date_raw
    if date_raw and out["utc_time"] is not None and len(date_raw) >= 6:
        try:
            dd = int(date_raw[0:2])
            mm = int(date_raw[2:4])
            yy = 2000 + int(date_raw[4:6])
            t = out["utc_time"]
            hh = int(t // 10000)
            mi = int((t // 100) % 100)
            ss = int(t % 100)
            out["timestamp"] = datetime(yy, mm, dd, hh, mi, ss, tzinfo=timezone.utc).isoformat().replace(
                "+00:00", "Z"
            )
        except (ValueError, TypeError):
            out["timestamp"] = None
    else:
        out["timestamp"] = None
    return out


def _sentence_kind(line: str) -> Optional[str]:
    if not line.startswith("$") or len(line) < 6:
        return None
    tag = line[1:6]
    if tag.endswith("GGA"):
        return "GGA"
    if tag.endswith("RMC"):
        return "RMC"
    return None


class GpsCodeParser:
    """Byte/stream parser (same role as gps-code calcGpsInfo + GN_UartRcvGPSInfo)."""

    def __init__(self) -> None:
        self._line_buf = ""
        self.last_gga: Dict[str, Any] = {}
        self.last_rmc: Dict[str, Any] = {}

    def reset(self) -> None:
        self._line_buf = ""
        self.last_gga = {}
        self.last_rmc = {}

    def calc_gps_info(self, data: bytes) -> None:
        if not data:
            return
        text = data.decode("ascii", errors="replace")
        self._line_buf += text
        while True:
            nl = self._line_buf.find("\n")
            if nl < 0:
                break
            line = self._line_buf[:nl].strip("\r")
            self._line_buf = self._line_buf[nl + 1 :]
            self._handle_line(line)

    def _handle_line(self, line: str) -> None:
        kind = _sentence_kind(line)
        if kind == "GGA":
            self.last_gga = _parse_gga(line)
        elif kind == "RMC":
            self.last_rmc = _parse_rmc(line)

    def merged_fix(self) -> Optional[Dict[str, Any]]:
        gga = self.last_gga
        rmc = self.last_rmc
        lat = gga.get("latitude")
        lon = gga.get("longitude")
        if lat is None or lon is None:
            lat = rmc.get("latitude")
            lon = rmc.get("longitude")
        if lat is None or lon is None:
            return None

        fix_ok = (gga.get("fix_quality") or 0) > 0 or rmc.get("status") == "A"
        ts = rmc.get("timestamp") or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        speed_kn = rmc.get("speed_knots")
        speed_kmh = speed_kn * 1.852 if speed_kn is not None else None

        return {
            "latitude": lat,
            "longitude": lon,
            "timestamp": ts,
            "fix_valid": fix_ok,
            "altitude": gga.get("altitude"),
            "satellites": gga.get("satellites"),
            "hdop": gga.get("hdop"),
            "speed_knots": speed_kn,
            "speed_kmh": speed_kmh,
            "course": rmc.get("course"),
            "source": "gps-code-parser",
        }


def calc_gps_info(data: bytes, parser: Optional[GpsCodeParser] = None) -> Optional[Dict[str, Any]]:
    p = parser or GpsCodeParser()
    p.calc_gps_info(data)
    return p.merged_fix()
