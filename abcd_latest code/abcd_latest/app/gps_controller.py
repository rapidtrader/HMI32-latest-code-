"""QML bridge for live GPS + track (gps-code parser)."""
import json
import os

from PyQt5.QtCore import QObject, QTimer, pyqtProperty, pyqtSignal, pyqtSlot

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GPS_LATEST_JSON = os.path.join(BASE_DIR, "data", "gps_latest.json")


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

        self._timer = QTimer(self)
        self._timer.setInterval(int(os.environ.get("GPS_UI_REFRESH_MS", "1000")))
        self._timer.timeout.connect(self._refresh)
        self._timer.start()
        self._refresh()

    def _refresh(self) -> None:
        changed = False
        try:
            from logic.gps_tracker import get_cached_fix, get_status, get_track_points, start_gps_tracker

            start_gps_tracker()
            fix = get_cached_fix()
            status = get_status()
            track = get_track_points(500)
        except Exception as exc:
            fix = None
            status = str(exc)[:80]
            track = []

        if fix is None and os.path.isfile(GPS_LATEST_JSON):
            try:
                with open(GPS_LATEST_JSON, encoding="utf-8") as f:
                    row = json.load(f)
                if row.get("latitude") is not None:
                    fix = row
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
            self._satellites = int(fix.get("satellites") or 0)
            self._course = float(fix.get("course") or 0)
            self._fix_valid = bool(fix.get("fix_valid", True))
            self._last_time = str(fix.get("timestamp") or fix.get("recorded_at") or "")
        else:
            self._fix_valid = False
            if status != self._status:
                changed = True

        self._status = status or ("Fix OK" if self._fix_valid else "No fix")
        tc = len(track)
        if tc != self._track_count:
            self._track_count = tc
            changed = True

        if changed:
            self.fixChanged.emit()

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

    @pyqtProperty(str, notify=fixChanged)
    def lastTimestamp(self):
        return self._last_time

    @pyqtProperty(int, notify=fixChanged)
    def trackPointCount(self):
        return self._track_count

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
