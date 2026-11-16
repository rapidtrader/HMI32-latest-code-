"""QML bridge: MDVR page start/stop and channel metadata."""
import os
import threading

from PyQt5.QtCore import QObject, Qt, QTimer, pyqtProperty, pyqtSignal, pyqtSlot

from mdvr.network import check_mdvr_reachable, local_ipv4_hint
from mdvr.probe import (
    any_channel_probe_ok,
    channel_probe_ok,
    reset_probe_session,
    run_all_probes_sync,
)
from mdvr.rtsp_urls import default_channel_count, mdvr_host, rtsp_url, stream_enabled, stream_index


class MdvrController(QObject):
    statusChanged = pyqtSignal(str, arguments=["message"])
    runningChanged = pyqtSignal()
    busyChanged = pyqtSignal()
    probeChanged = pyqtSignal()
    _workerDone = pyqtSignal()
    _workerFailed = pyqtSignal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._running = False
        self._busy = False
        self._workerDone.connect(self._on_worker_done, Qt.QueuedConnection)
        self._workerFailed.connect(self._on_worker_failed, Qt.QueuedConnection)
        self._busy_watch = QTimer(self)
        self._busy_watch.setSingleShot(True)
        self._busy_watch.setInterval(90_000)
        self._busy_watch.timeout.connect(self._on_start_timeout)

    @pyqtProperty(bool, notify=runningChanged)
    def isActive(self):
        return self._running

    @pyqtProperty(bool, notify=busyChanged)
    def isBusy(self):
        return self._busy

    @pyqtProperty(str, constant=True)
    def mdvrHost(self):
        return mdvr_host()

    @pyqtProperty(str, constant=True)
    def streamProfile(self):
        return "substream (_1)" if stream_index() == "1" else "main (_0)"

    @pyqtProperty(int, constant=True)
    def mdvrPortCount(self):
        return default_channel_count()

    @pyqtSlot(result=int)
    def channelCount(self):
        return default_channel_count()

    @pyqtSlot(int, result=str)
    def streamUrl(self, channel_id: int) -> str:
        return rtsp_url(int(channel_id))

    @pyqtSlot(int, result=bool)
    def streamEnabled(self, channel_id: int) -> bool:
        return stream_enabled(int(channel_id))

    @pyqtSlot(int, result=bool)
    def channelProbeOk(self, channel_id: int) -> bool:
        return channel_probe_ok(int(channel_id))

    def _set_busy(self, on: bool):
        if self._busy != on:
            self._busy = on
            self.busyChanged.emit()

    def _set_running(self, on: bool):
        if self._running != on:
            self._running = on
            self.runningChanged.emit()

    def _emit(self, msg: str):
        print(f"[MDVR] {msg}")
        self.statusChanged.emit(msg)

    def _on_worker_done(self):
        self._busy_watch.stop()
        self._set_busy(False)
        self.probeChanged.emit()
        self._set_running(True)
        if any_channel_probe_ok():
            self._set_running(True)
            self._emit("MDVR live — sub-stream preview")
            try:
                from logic.mdvr_auto_save import start_mdvr_archive_save

                ok, msg = start_mdvr_archive_save()
                if ok:
                    self._emit(f"MDVR archive: {msg}")
                else:
                    self._emit(f"MDVR archive skipped: {msg}")
            except Exception as exc:
                print(f"[MDVR-SAVE] start error: {exc}")
        else:
            self._set_running(True)
            self._emit(
                "MDVR started but no channel responded — check Ethernet / MDVR power"
            )
            try:
                from logic.mdvr_auto_save import start_mdvr_archive_save

                if os.environ.get("MDVR_SAVE_WITHOUT_PROBE", "").strip().lower() in (
                    "1",
                    "true",
                    "yes",
                    "on",
                ):
                    ok, msg = start_mdvr_archive_save()
                    if ok:
                        self._emit(f"MDVR archive (no probe): {msg}")
                    else:
                        self._emit(f"MDVR archive failed: {msg}")
            except Exception as exc:
                print(f"[MDVR-SAVE] start error: {exc}")

    def _on_worker_failed(self, message: str):
        self._busy_watch.stop()
        self._set_busy(False)
        self._set_running(False)
        reset_probe_session()
        ips = local_ipv4_hint()
        if ips:
            message = f"{message}\nBoard IP: {ips}"
        self._emit(message)

    def _on_start_timeout(self):
        if self._busy:
            print("[MDVR] start timed out")
            self._on_worker_failed(
                "MDVR start timed out — check Ethernet cable and ping 192.168.31.156"
            )

    @pyqtSlot()
    def startAll(self):
        if self._running or self._busy:
            return
        self._set_busy(True)
        self._busy_watch.start()
        reset_probe_session()
        self._emit("Checking MDVR network…")

        def work():
            try:
                print("[MDVR] start worker")
                ok, err = check_mdvr_reachable()
                if not ok:
                    self._workerFailed.emit(err)
                    return
                self._emit("Probing MDVR channels…")
                run_all_probes_sync()
                self._workerDone.emit()
            except Exception as exc:
                print(f"[MDVR] start worker error: {exc}")
                self._workerFailed.emit(str(exc))

        threading.Thread(target=work, daemon=True, name="mdvr-probe").start()

    @pyqtSlot()
    def stopAll(self):
        try:
            from logic.mdvr_auto_save import stop_mdvr_archive_save

            stop_mdvr_archive_save()
        except Exception as exc:
            print(f"[MDVR-SAVE] stop error: {exc}")
        self._set_busy(False)
        self._set_running(False)
        reset_probe_session()
        self._emit("MDVR stopped")
