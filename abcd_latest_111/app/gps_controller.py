"""QML bridge for live GPS + track (gps-code parser)."""
import json
import os

from PyQt5.QtCore import QObject, QTimer, pyqtProperty, pyqtSignal, pyqtSlot

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GPS_LATEST_JSON = os.path.join(BASE_DIR, "data", "gps_latest.json")
GPS_TRACK_JSON = os.path.join(BASE_DIR, "data", "gps_track.json")


def _short_iso(ts: str) -> str:
    if not ts:
        return "—"
    return ts.replace("T", " ").replace(".000", "").replace("Z", " UTC")[:22]


class GpsController(QObject):
    fixChanged = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self._latitude = 0.0
        self._longitude = 0.0
        self._speed_kmh = 0.0
        self._altitude = 0.0
        self._satellites = 0
        self._course = 0.0
        self._fix_valid = False
        self._status = "Waiting for GPS…"
        self._track_count = 0
        self._last_time = ""
        self._save_local_at = ""
        self._save_track_file_at = ""
        self._save_server_ok = False
        self._save_server_line = "Cloud: waiting…"

        self._timer = QTimer(self)
        self._timer.setInterval(int(os.environ.get("GPS_UI_REFRESH_MS", "1000")))
        self._timer.timeout.connect(self._refresh)
        self._timer.start()
        self._refresh()

    def _refresh(self) -> None:
        changed = False
        try:
            from logic.gps_tracker import (
                get_cached_fix,
                get_nmea_stats,
                get_status,
                get_track_points,
                start_gps_tracker,
            )

            start_gps_tracker()
            fix = get_cached_fix()
            status = get_status()
            track = get_track_points(500)
        except Exception as exc:
            fix = None
            status = str(exc)[:80]
            track = []

        json_row = None
        if os.path.isfile(GPS_LATEST_JSON):
            try:
                with open(GPS_LATEST_JSON, encoding="utf-8") as f:
                    json_row = json.load(f)
                if fix is None and json_row.get("latitude") is not None:
                    fix = json_row
            except (OSError, json.JSONDecodeError):
                json_row = None

        try:
            stats = get_nmea_stats()
            sats = max(
                int(stats.get("satellites") or 0),
                int(stats.get("in_view") or 0),
            )
            if sats != self._satellites:
                changed = True
            self._satellites = sats
        except Exception:
            pass

        if json_row:
            js = int(json_row.get("satellites") or 0)
            if js > self._satellites:
                self._satellites = js
                changed = True
            jst = json_row.get("status")
            if jst and jst != status:
                status = str(jst)
            rec = str(json_row.get("recorded_at") or "")
            if rec != self._save_local_at:
                self._save_local_at = rec
                changed = True
            backend = json_row.get("backend") or {}
            if isinstance(backend, dict):
                ok_srv = bool(backend.get("ok_gps") or backend.get("ok_pi"))
                if ok_srv != self._save_server_ok:
                    self._save_server_ok = ok_srv
                    changed = True
                if ok_srv:
                    srv_line = "Cloud sync: OK"
                elif backend.get("gps_status") == 404:
                    srv_line = "Cloud sync: API 404 (saved on device)"
                elif backend.get("errors"):
                    srv_line = "Cloud sync: pending (local file OK)"
                else:
                    srv_line = "Cloud sync: pending"
                if srv_line != self._save_server_line:
                    self._save_server_line = srv_line
                    changed = True

        if os.path.isfile(GPS_TRACK_JSON):
            try:
                with open(GPS_TRACK_JSON, encoding="utf-8") as f:
                    tr = json.load(f)
                upd = str(tr.get("updated_at") or "")
                if upd != self._save_track_file_at:
                    self._save_track_file_at = upd
                    changed = True
            except (OSError, json.JSONDecodeError):
                pass

        if fix:
            lat = float(fix.get("latitude") or 0)
            lon = float(fix.get("longitude") or 0)
            if lat != self._latitude or lon != self._longitude:
                changed = True
            self._latitude = lat
            self._longitude = lon
            self._speed_kmh = float(fix.get("speed_kmh") or 0)
            self._altitude = float(fix.get("altitude") or 0)
            if fix.get("satellites") is not None:
                self._satellites = int(fix.get("satellites") or 0)
            self._course = float(fix.get("course") or 0)
            fix_v = bool(fix.get("fix_valid", True))
            if (
                not fix_v
                and abs(lat) > 0.0001
                and abs(lon) > 0.0001
                and self._satellites >= 4
            ):
                fix_v = True
            self._fix_valid = fix_v
            self._last_time = str(fix.get("timestamp") or fix.get("recorded_at") or "")
        else:
            self._fix_valid = False

        new_status = status or ("Fix OK" if self._fix_valid else "No fix")
        if new_status != self._status:
            changed = True
        self._status = new_status
        tc = len(track)
        if tc != self._track_count:
            self._track_count = tc
            changed = True

        if changed:
            self.fixChanged.emit()

    @pyqtProperty(bool, notify=fixChanged)
    def hasCoordinates(self):
        return abs(self._latitude) > 0.0001 and abs(self._longitude) > 0.0001

    @pyqtProperty(bool, notify=fixChanged)
    def fixValid(self):
        return self._fix_valid

    @pyqtProperty(float, notify=fixChanged)
    def latitude(self):
        return self._latitude

    @pyqtProperty(float, notify=fixChanged)
    def longitude(self):
        return self._longitude

    @pyqtProperty(float, notify=fixChanged)
    def speedKmh(self):
        return self._speed_kmh

    @pyqtProperty(float, notify=fixChanged)
    def altitude(self):
        return self._altitude

    @pyqtProperty(int, notify=fixChanged)
    def satellites(self):
        return self._satellites

    @pyqtProperty(float, notify=fixChanged)
    def course(self):
        return self._course

    @pyqtProperty(str, notify=fixChanged)
    def statusText(self):
        return self._status

    @pyqtProperty(str, constant=True)
    def serialPortHint(self):
        nmea = os.environ.get("GPS_SERIAL_PORT", "/dev/ttyUSB1")
        at = os.environ.get("GPS_AT_PORT", "/dev/ttyUSB3")
        return f"NMEA {nmea} · AT {at} (Quectel GPS on ttyUSB1)"

    @pyqtProperty(str, notify=fixChanged)
    def lastTimestamp(self):
        return self._last_time

    @pyqtProperty(int, notify=fixChanged)
    def trackPointCount(self):
        return self._track_count

    @pyqtProperty(str, notify=fixChanged)
    def lastSavedAt(self):
        return _short_iso(self._save_local_at)

    @pyqtProperty(str, notify=fixChanged)
    def trackFileSavedAt(self):
        return _short_iso(self._save_track_file_at)

    @pyqtProperty(str, notify=fixChanged)
    def saveLocalLine(self):
        if not self._save_local_at:
            return "Local save: waiting for fix…"
        return (
            "Local save: data/gps_latest.json · updated "
            + _short_iso(self._save_local_at)
        )

    @pyqtProperty(str, notify=fixChanged)
    def saveTrackLine(self):
        n = self._track_count
        if self._save_track_file_at:
            return (
                f"Route history: {n} points · gps_track.json · "
                + _short_iso(self._save_track_file_at)
            )
        if n > 0:
            return f"Route history: {n} points (in memory, file every 10 points)"
        return "Route history: no points yet"

    @pyqtProperty(str, notify=fixChanged)
    def saveServerLine(self):
        return self._save_server_line

    @pyqtProperty(bool, notify=fixChanged)
    def saveServerOk(self):
        return self._save_server_ok

    @pyqtSlot(result=str)
    def trackPointsJson(self):
        try:
            from logic.gps_tracker import get_track_points

            return json.dumps(get_track_points(300))
        except Exception:
            return "[]"

    @pyqtSlot(result=str)
    def mapsUrl(self):
        if not self._fix_valid or abs(self._latitude) < 0.0001:
            return ""
        return (
            "https://www.openstreetmap.org/?mlat="
            f"{self._latitude:.6f}&mlon={self._longitude:.6f}#map=17/"
            f"{self._latitude:.6f}/{self._longitude:.6f}"
        )
