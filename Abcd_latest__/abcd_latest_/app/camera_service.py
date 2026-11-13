"""Camera: inline preview on Cameras page (GStreamer xv overlay), optional external viewer."""
import os
import subprocess
import threading
import time
from datetime import datetime

from PyQt5.QtCore import QObject, QProcess, QTimer, pyqtProperty, pyqtSignal, pyqtSlot, Qt
from app.native_camera_demo import (
    VIDEO_CAPTURE_ROOT,
    build_env,
    ensure_executable,
    resolve_vendor_demo_binary,
    resolve_vendor_demo_executable,
    vendor_demo_available,
    viewer_log_path,
)
from hardware.camera_capture import resolve_video_device


from hardware.camera_stream_ids import stream_enabled
from hardware.camera_probe import channel_probe_ok


def _default_camera_count() -> int:
    try:
        return max(1, min(8, int(os.environ.get("CAMERA_COUNT", "4"))))
    except ValueError:
        return 4


def _use_external_viewer() -> bool:
    return os.environ.get("CAMERA_VIEWER", "inline").strip().lower() in (
        "external",
        "window",
        "gst",
        "single",
    )


def _auto_save_enabled() -> bool:
    return os.environ.get("CAMERA_AUTO_SAVE", "1").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def _auto_save_channel() -> int:
    try:
        return max(1, min(8, int(os.environ.get("CAMERA_AUTO_SAVE_CHANNEL", "1"))))
    except ValueError:
        return 1


def _auto_save_interval_ms() -> int:
    """Backup watchdog if upload loop stalls."""
    try:
        sec = float(os.environ.get("CAMERA_AUTO_SAVE_WATCHDOG_SEC", "600"))
        return max(120_000, int(sec * 1000))
    except ValueError:
        return 600_000


def _auto_save_start_delay_ms() -> int:
    try:
        sec = float(os.environ.get("CAMERA_AUTO_SAVE_START_DELAY_SEC", "15"))
        return max(5_000, int(sec * 1000))
    except ValueError:
        return 15_000


def _auto_save_min_live_sec() -> float:
    try:
        return max(3.0, float(os.environ.get("CAMERA_AUTO_SAVE_MIN_LIVE_SEC", "8")))
    except ValueError:
        return 8.0


def _auto_save_gap_ms() -> int:
    """Pause between parallel batch cycles (not between channels)."""
    try:
        sec = float(os.environ.get("CAMERA_AUTO_SAVE_GAP_SEC", "30"))
        return max(5_000, int(sec * 1000))
    except ValueError:
        return 30_000


def _auto_save_continuous() -> bool:
    return os.environ.get("CAMERA_AUTO_SAVE_CONTINUOUS", "1").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def _auto_save_clip_sec() -> float:
    try:
        return max(5.0, float(os.environ.get("CAMERA_AUTO_SAVE_CLIP_SEC", "600")))
    except ValueError:
        return 600.0


def _auto_save_rotate_channels() -> bool:
    return os.environ.get("CAMERA_AUTO_SAVE_ROTATE", "1").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def _auto_save_require_probe() -> bool:
    return os.environ.get("CAMERA_AUTO_SAVE_REQUIRE_PROBE", "0").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


class CameraController(QObject):
    statusChanged = pyqtSignal(str, arguments=["message"])
    runningChanged = pyqtSignal()
    busyChanged = pyqtSignal()
    recordingChanged = pyqtSignal()
    previewPausedChanged = pyqtSignal()
    previewGlobalHoldChanged = pyqtSignal()
    uploadBusyChanged = pyqtSignal()
    gstBlockedChanged = pyqtSignal()
    _inlineWorkerDone = pyqtSignal(int)
    _inlineWorkerFailed = pyqtSignal(int, str)
    _uploadDone = pyqtSignal(bool, str)
    _autoSaveWorkerDone = pyqtSignal(bool, str)
    _autoSavePrepareChannel = pyqtSignal(int)
    _autoSaveReleasePreview = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self._camera_count = _default_camera_count()
        self._process = None
        self._running = False
        self._launching = False
        self._inline_preview = False
        self._start_generation = 0
        self._poll_timer = QTimer(self)
        self._poll_timer.setInterval(2000)
        self._poll_timer.timeout.connect(self._poll_external_viewer)
        self._inlineWorkerDone.connect(self._on_inline_worker_done)
        self._inlineWorkerFailed.connect(self._on_inline_worker_failed)
        self._uploadDone.connect(self._on_upload_done)
        self._autoSaveWorkerDone.connect(self._on_auto_save_worker_done)
        self._recorder = None
        self._recording_camera_id = 0
        self._preview_paused_channel = 0
        self._preview_global_hold = False
        self._record_pipeline_running = False
        self._record_gen = 0
        self._upload_busy = False
        self._upload_title_override = None
        self._auto_save_mode = False
        self._auto_save_rotate = 0
        self._auto_save_loop_pending = False
        self._auto_save_worker_running = False
        self._continuous_save_started = False
        self._live_started_at = 0.0
        self._auto_save_pause_event = threading.Event()
        self._auto_save_hold_channel = 0
        self._autoSavePrepareChannel.connect(
            self._on_auto_save_prepare_channel, Qt.QueuedConnection
        )
        self._autoSaveReleasePreview.connect(
            self._auto_save_release_preview, Qt.QueuedConnection
        )
        self._auto_save_timer = QTimer(self)
        self._auto_save_timer.timeout.connect(self._on_auto_save_timer)
        self._auto_save_stop_timer = QTimer(self)
        self._auto_save_stop_timer.setSingleShot(True)
        self._auto_save_stop_timer.timeout.connect(self._on_auto_save_clip_timeout)
        self._gst_recover_tried = False
        self._gst_blocked = False
        self._gst_block_message = ""
        self._refresh_gst_block_state()
        self._start_busy_timer = QTimer(self)
        self._start_busy_timer.setSingleShot(True)
        self._start_busy_timer.setInterval(90_000)
        self._start_busy_timer.timeout.connect(self._on_camera_start_timeout)

    def _refresh_gst_block_state(self) -> None:
        from hardware.gst_health import gst_health_message, stuck_gst_plugin_scanners

        stuck = stuck_gst_plugin_scanners()
        blocked = stuck > 0
        msg = gst_health_message(stuck) if blocked else ""
        if blocked != self._gst_blocked or msg != self._gst_block_message:
            self._gst_blocked = blocked
            self._gst_block_message = msg
            self.gstBlockedChanged.emit()
        if blocked:
            print(f"[CAMERA] {msg}")

    @pyqtProperty(bool, notify=gstBlockedChanged)
    def gstBlocked(self):
        return self._gst_blocked

    @pyqtProperty(str, notify=gstBlockedChanged)
    def gstBlockHint(self):
        return self._gst_block_message

    def _on_camera_start_timeout(self):
        if not self._launching:
            return
        print("[CAMERA] start timed out — unblocking UI (reboot if frozen)")
        self._set_busy(False)
        self._inline_preview = False
        self._emit(
            "Camera start timed out. Use MDVR page, or reboot if the HMI froze "
            "(stuck GStreamer). export CAMERA_PROBE=0 to skip probe."
        )

    @pyqtSlot()
    def refreshGstHealth(self):
        """Re-check after reboot (optional)."""
        self._gst_recover_tried = False
        from hardware.gst_health import kill_orphan_gst_processes

        kill_orphan_gst_processes()
        self._refresh_gst_block_state()

    @pyqtProperty(bool, notify=runningChanged)
    def isActive(self):
        if self._process is not None and self._process.state() == QProcess.NotRunning:
            self._process = None
            if self._running and not self._inline_preview:
                self._set_running(False)
        return self._running

    @pyqtProperty(bool, notify=busyChanged)
    def isBusy(self):
        return self._launching

    @pyqtProperty(bool, notify=recordingChanged)
    def isRecording(self):
        return self._recording_camera_id > 0

    @pyqtProperty(bool, notify=recordingChanged)
    def isRecordPipelineRunning(self):
        return self._record_pipeline_running

    @pyqtProperty(int, notify=recordingChanged)
    def recordingCameraId(self):
        return int(self._recording_camera_id or 0)

    @pyqtProperty(bool, notify=uploadBusyChanged)
    def isUploadBusy(self):
        return self._upload_busy

    def _set_busy(self, on: bool):
        if self._launching != on:
            self._launching = on
            self.busyChanged.emit()

    @pyqtProperty(int, constant=True)
    def maxCameras(self):
        return 8

    @pyqtProperty(int, constant=True)
    def inlineCameraId(self):
        try:
            return int(os.environ.get("CAMERA_INLINE_ID", "1"))
        except ValueError:
            return 1

    @pyqtSlot(result=int)
    def cameraCount(self):
        return self._camera_count

    @pyqtSlot(int, result=str)
    def devicePath(self, camera_id: int):
        return resolve_video_device(camera_id)

    @pyqtSlot(int, result=bool)
    def streamEnabled(self, camera_id: int) -> bool:
        return stream_enabled(camera_id)

    @pyqtSlot(int, result=bool)
    def channelProbeOk(self, camera_id: int) -> bool:
        return channel_probe_ok(camera_id)

    @pyqtSlot(result=bool)
    def vendorDemoAvailable(self):
        return True

    @pyqtSlot(result=str)
    def vendorDemoPath(self):
        return resolve_video_device(self.inlineCameraId)

    def _emit(self, msg: str):
        print(f"[CAMERA] {msg}")
        self.statusChanged.emit(msg)

    def _set_running(self, on: bool):
        if self._running != on:
            self._running = on
            self.runningChanged.emit()

    def _kill_viewer_processes(self):
        subprocess.run(
            ["pkill", "-f", "/yolov5Demo"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        subprocess.run(
            ["pkill", "-f", "run_single_camera_viewer.sh"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    def _kill_external_gst(self):
        self._kill_viewer_processes()
        subprocess.run(
            ["pkill", "-9", "gst-launch-1.0"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    def _poll_external_viewer(self):
        if not self._running or self._inline_preview:
            return
        r = subprocess.run(
            ["pgrep", "-f", "gst-launch-1.0.*v4l2src"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if r.returncode != 0:
            self._poll_timer.stop()
            self._process = None
            self._set_running(False)
            self._emit("Viewer closed")

    def _start_inline(self):
        from hardware.camera_probe import reset_probe_session
        from hardware.gst_health import kill_orphan_gst_processes, stuck_gst_plugin_scanners

        if self._gst_blocked:
            self._set_busy(False)
            self._emit(self._gst_block_message or "Local cameras unavailable — reboot required")
            return

        self._refresh_gst_block_state()
        if self._gst_blocked:
            self._set_busy(False)
            self._emit(self._gst_block_message)
            return

        if not self._gst_recover_tried:
            self._gst_recover_tried = True
            if stuck_gst_plugin_scanners() == 0:
                kill_orphan_gst_processes()

        self._kill_viewer_processes()
        reset_probe_session()
        self._inline_preview = True
        self._process = None
        self._start_generation += 1
        gen = self._start_generation

        use_probe = os.environ.get("CAMERA_PROBE", "1").strip().lower() not in (
            "0",
            "false",
            "no",
            "off",
        )
        if use_probe:
            self._emit("Probing cameras… (please wait, do not tap Start again)")
        else:
            self._emit("Starting cameras…")

        def worker():
            try:
                # Gst.init in worker + parallel probes can hang whole HMI; init lazily per tile.
                if use_probe:
                    from hardware.camera_probe import run_all_probes_sync

                    run_all_probes_sync()
            except Exception as exc:
                print(f"[CAMERA] start worker error: {exc}")
                self._inlineWorkerFailed.emit(gen, str(exc))
                return
            self._inlineWorkerDone.emit(gen)

        self._start_busy_timer.start()
        threading.Thread(target=worker, daemon=True, name="camera-probe").start()

    @pyqtSlot(int)
    def _on_inline_worker_done(self, gen: int):
        if gen != self._start_generation:
            return
        self._finish_inline_start()

    @pyqtSlot(int, str)
    def _on_inline_worker_failed(self, gen: int, message: str):
        if gen != self._start_generation:
            return
        self._start_busy_timer.stop()
        self._set_busy(False)
        self._inline_preview = False
        self._emit(f"Camera start failed: {message}")

    def _finish_inline_start(self):
        self._start_busy_timer.stop()
        self._set_busy(False)
        self._live_started_at = time.time()
        self._set_running(True)
        self._emit(f"Live — {self._camera_count} channels (NV12)")
        self._start_server_auto_save()

    def _start_external_script(self, exec_path: str, display_bin: str) -> bool:
        from app.native_camera_demo import build_env_dict

        env = build_env_dict()
        env.setdefault("CAMERA_DEVICE_0", os.environ.get("CAMERA_DEVICE_0", "/dev/video1"))
        try:
            subprocess.Popen(
                ["/bin/bash", exec_path],
                cwd=VIDEO_CAPTURE_ROOT,
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
        except OSError as e:
            self._emit(f"Could not start: {e}")
            return False
        self._inline_preview = False
        self._set_running(True)
        self._poll_timer.start()
        self._emit(f"External window — {display_bin}")
        return True

    @pyqtSlot()
    def launchVendorDemo(self):
        if self._launching:
            self._emit("Camera start already in progress…")
            return
        if self._gst_blocked and not _use_external_viewer():
            self._emit(self._gst_block_message or "Local cameras unavailable — reboot required")
            return
        if self._running:
            self.stopVendorDemo()
            return
        self._set_busy(True)
        if not _use_external_viewer():
            self._start_inline()
            return

        display_bin = resolve_vendor_demo_binary()
        exec_path = resolve_vendor_demo_executable()
        if not os.path.isfile(exec_path) or not ensure_executable(exec_path):
            self._emit(f"Missing viewer: {exec_path}")
            self._set_busy(False)
            return
        self._kill_external_gst()
        if exec_path.endswith("run_single_camera_viewer.sh"):
            self._start_external_script(exec_path, display_bin)
        else:
            self._emit("External yolov5Demo not recommended — set CAMERA_VIEWER=inline")
        self._set_busy(False)

    @pyqtSlot()
    def stopVendorDemo(self):
        from hardware.camera_probe import reset_probe_session

        if self.isRecording:
            self.stopVideoRecordAndUpload()

        self._stop_server_auto_save()
        self._set_preview_paused_channel(0)
        self._set_preview_global_hold(False)
        self._start_generation += 1
        self._set_busy(False)
        self._poll_timer.stop()
        reset_probe_session()
        was_inline = self._inline_preview
        self._inline_preview = False
        self._kill_external_gst()
        if self._process is not None and self._process.state() != QProcess.NotRunning:
            self._process.terminate()
            if not self._process.waitForFinished(2000):
                self._process.kill()
        self._process = None
        self._set_running(False)
        if was_inline:
            self._emit("Camera stopped")
        else:
            self._emit("Viewer stopped")

    @pyqtSlot()
    def startCapture(self):
        self.launchVendorDemo()

    @pyqtSlot()
    def stopCapture(self):
        self.stopVendorDemo()

    @pyqtSlot(bool)
    def setActive(self, on: bool):
        if on:
            self.launchVendorDemo()
        else:
            self.stopVendorDemo()

    def _start_server_auto_save(self):
        if not _auto_save_enabled() or not self._inline_preview:
            if self._inline_preview and not _auto_save_enabled():
                self._emit(
                    "Live preview only — website clips OFF "
                    "(export CAMERA_AUTO_SAVE=1 after stable)"
                )
            return
        from logic.backend_clinet import get_backend_base

        if not get_backend_base():
            self._emit("Auto-save off — set data/backend.json backendBaseUrl")
            return
        delay = _auto_save_start_delay_ms() // 1000
        chs = self._auto_save_channel_list()
        sec = int(_auto_save_clip_sec())
        if _auto_save_continuous():
            if not self._auto_save_timer.isActive():
                self._auto_save_timer.start(_auto_save_interval_ms())
            self._emit(
                f"Continuous save — CH{','.join(str(c) for c in chs)} "
                f"every {sec}s to website (live never stops, starts in {delay}s)"
            )
            self._schedule_auto_save_countdown(_auto_save_start_delay_ms())
            QTimer.singleShot(_auto_save_start_delay_ms(), self._start_continuous_auto_save)
            return
        if not self._auto_save_timer.isActive():
            self._auto_save_timer.start(_auto_save_interval_ms())
        self._emit(
            f"Auto-save ON — all CH{','.join(str(c) for c in chs)} together "
            f"(live preview stays on, first batch in {delay}s)"
        )
        self._schedule_auto_save_countdown(_auto_save_start_delay_ms())
        QTimer.singleShot(_auto_save_start_delay_ms(), self._try_auto_save_batch)

    def _start_continuous_auto_save(self):
        if not self._running or not _auto_save_enabled() or self._continuous_save_started:
            return
        from logic.backend_clinet import get_backend_base
        from logic.camera_auto_save import start_continuous_preview_upload

        if not get_backend_base():
            return
        channels = self._auto_save_channel_list()
        if not channels:
            QTimer.singleShot(5000, self._start_continuous_auto_save)
            return
        ok, msg = start_continuous_preview_upload(channels)
        if ok:
            self._continuous_save_started = True
            self._emit(msg)
        else:
            self._emit(f"Continuous save: {msg}")
            if "ffmpeg" in msg.lower():
                self._emit("Run on Pi: sudo apt install -y ffmpeg")
            QTimer.singleShot(5000, self._start_continuous_auto_save)

    def _schedule_auto_save_countdown(self, delay_ms: int):
        for sec, label in ((30, "30s"), (10, "10s")):
            ms = delay_ms - sec * 1000
            if ms > 500:

                def _tick(l=label):
                    if self._running and _auto_save_enabled():
                        self._emit(f"Auto-save in ~{l}…")

                QTimer.singleShot(ms, _tick)

    def _stop_server_auto_save(self):
        self._auto_save_timer.stop()
        self._auto_save_stop_timer.stop()
        self._auto_save_mode = False
        self._auto_save_loop_pending = False
        if self._continuous_save_started:
            from logic.camera_auto_save import stop_continuous_preview_upload

            stop_continuous_preview_upload()
            self._continuous_save_started = False

    def _schedule_next_auto_save(self):
        if not self._running or not _auto_save_enabled() or not self._inline_preview:
            return
        if self._auto_save_loop_pending:
            return
        self._auto_save_loop_pending = True
        QTimer.singleShot(_auto_save_gap_ms(), self._auto_save_loop_tick)

    def _auto_save_loop_tick(self):
        self._auto_save_loop_pending = False
        self._try_auto_save_batch()

    def _auto_save_channel_list(self):
        if not _auto_save_rotate_channels():
            return [_auto_save_channel()]
        require_probe = _auto_save_require_probe()
        out = []
        for cid in range(1, self._camera_count + 1):
            if not stream_enabled(cid):
                continue
            if require_probe and not channel_probe_ok(cid):
                continue
            out.append(cid)
        return out or [_auto_save_channel()]

    def _on_auto_save_timer(self):
        if not self._running or not _auto_save_enabled():
            return
        if _auto_save_continuous():
            if not self._continuous_save_started:
                self._start_continuous_auto_save()
            return
        if (
            not self._upload_busy
            and not self.isRecording
            and not self._auto_save_worker_running
        ):
            self._try_auto_save_batch()

    def _try_auto_save_batch(self):
        if _auto_save_continuous() and self._continuous_save_started:
            return
        if (
            not self._running
            or self._upload_busy
            or self.isRecording
            or self._launching
        ):
            return
        if self._auto_save_worker_running:
            return
        if self._live_started_at and (time.time() - self._live_started_at) < _auto_save_min_live_sec():
            self._schedule_next_auto_save()
            return
        if not _auto_save_enabled():
            return
        from logic.backend_clinet import get_backend_base

        if not get_backend_base():
            return

        channels = self._auto_save_channel_list()
        if not channels:
            self._schedule_next_auto_save()
            return

        clip_sec = _auto_save_clip_sec()
        stamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        self._auto_save_worker_running = True

        def title_for(ch: int) -> str:
            return f"CH{ch} {stamp}"

        def worker():
            ok = False
            msg = "Auto-save skipped"
            try:
                from logic.camera_auto_save import record_all_channels_from_preview

                ok_n, _fail_n, summary = record_all_channels_from_preview(
                    channels,
                    clip_sec=clip_sec,
                    title_for_channel=title_for,
                )
                ok = ok_n > 0
                msg = summary
            except Exception as exc:
                msg = f"Auto-save error: {exc}"
                ok = False
            self._autoSaveWorkerDone.emit(ok, msg)

        threading.Thread(target=worker, daemon=True, name="cam-auto-save-batch").start()

    def _try_auto_save_clip(self):
        self._try_auto_save_batch()

    def _on_auto_save_worker_done(self, ok: bool, message: str):
        self._auto_save_worker_running = False
        if message:
            self._emit(message)
        self._schedule_next_auto_save()

    def _on_auto_save_prepare_channel(self, channel: int):
        if self._record_pipeline_running or self.isRecording:
            return
        if _auto_save_continuous() and _auto_save_enabled():
            return
        ch = int(channel)
        self._auto_save_hold_channel = ch
        from app.gstreamer_preview_registry import request_stop_sync

        stopped = request_stop_sync(ch, timeout=6.0)
        print(f"[CAMERA-VIDEO] Record: CH{ch} preview stop={stopped}")
        self._set_preview_global_hold(False)
        self._set_preview_paused_channel(ch)
        release_ms = int(
            float(os.environ.get("CAMERA_VIDEO_PREVIEW_RELEASE_SEC", "1.2")) * 1000
        )
        QTimer.singleShot(max(400, release_ms), self._auto_save_pause_event.set)

    def _auto_save_release_preview(self):
        if self._record_pipeline_running:
            return
        self._set_preview_global_hold(False)
        self._set_preview_paused_channel(0)
        self._auto_save_hold_channel = 0

    def _on_auto_save_clip_timeout(self):
        if not self._auto_save_mode:
            return
        if self.isRecording and self._record_pipeline_running:
            self.stopVideoRecordAndUpload()
        else:
            self._auto_save_mode = False
            self._upload_title_override = None
            self._schedule_next_auto_save()

    def _begin_record(self, camera_id: int, announce: bool = True) -> bool:
        from logic.backend_clinet import get_backend_base
        from hardware.camera_video_record import CameraVideoRecorder

        if not get_backend_base():
            if announce:
                self._emit("Backend URL missing — edit data/backend.json (backendBaseUrl)")
            return False
        if not stream_enabled(int(camera_id)):
            if announce:
                self._emit(f"CH{camera_id} streaming disabled (CAMERA_STREAM_IDS)")
            return False
        try:
            self._record_gen += 1
            gen = self._record_gen
            self._record_pipeline_running = False
            self.recordingChanged.emit()
            self._recorder = CameraVideoRecorder(int(camera_id))
            self._set_recording(int(camera_id))
            if announce:
                self._emit(f"Opening CH{camera_id} for record (preview pauses on this channel)…")
            delay_ms = int(
                float(os.environ.get("CAMERA_VIDEO_PREVIEW_RELEASE_SEC", "0.8")) * 1000
            )
            QTimer.singleShot(max(200, delay_ms), lambda: self._start_recorder_after_pause(gen))
            return True
        except Exception as exc:
            self._recorder = None
            self._set_recording(0)
            self._record_pipeline_running = False
            self.recordingChanged.emit()
            if announce:
                self._emit(f"Record failed: {exc}")
            return False

    def _set_recording(self, camera_id: int):
        cid = int(camera_id or 0)
        if self._recording_camera_id != cid:
            self._recording_camera_id = cid
            self.recordingChanged.emit()

    def _set_preview_paused_channel(self, channel: int):
        ch = int(channel or 0)
        if self._preview_paused_channel != ch:
            self._preview_paused_channel = ch
            self.previewPausedChanged.emit()

    def _set_preview_global_hold(self, held: bool):
        held = bool(held)
        if self._preview_global_hold != held:
            self._preview_global_hold = held
            self.previewGlobalHoldChanged.emit()

    @pyqtProperty(bool, notify=previewGlobalHoldChanged)
    def previewGlobalHold(self):
        return self._preview_global_hold

    def _set_upload_busy(self, on: bool):
        if self._upload_busy != on:
            self._upload_busy = on
            self.uploadBusyChanged.emit()

    @pyqtSlot(int, result=bool)
    def isRecordingChannel(self, camera_id: int) -> bool:
        return self.isRecording and int(camera_id) == self.recordingCameraId

    @pyqtSlot(int, result=bool)
    def isChannelPreviewPaused(self, camera_id: int) -> bool:
        return int(camera_id) == int(self._preview_paused_channel or 0)

    @pyqtSlot(int, result=str)
    def recordButtonLabel(self, camera_id: int) -> str:
        if not self.isRecordingChannel(int(camera_id)):
            return "Record clip"
        if self._record_pipeline_running:
            return "Stop & upload"
        return "Cancel…"

    @pyqtSlot(int)
    def startVideoRecord(self, camera_id: int):
        if self._upload_busy:
            self._emit("Upload in progress…")
            return
        if self.isRecording:
            if self.recordingCameraId == int(camera_id):
                self.stopVideoRecordAndUpload()
            else:
                self._emit(f"Already recording CH{self.recordingCameraId}")
            return
        if not stream_enabled(int(camera_id)):
            self._emit(f"CH{camera_id} streaming disabled (CAMERA_STREAM_IDS)")
            return

        self._auto_save_stop_timer.stop()
        self._auto_save_mode = False
        self._upload_title_override = None

        from logic.backend_clinet import get_backend_base

        if not get_backend_base():
            self._emit("Backend URL missing — edit data/backend.json (backendBaseUrl)")
            return

        if not self._begin_record(int(camera_id), announce=True):
            return

    def _start_recorder_after_pause(self, gen: int):
        if gen != self._record_gen or not self._recorder or not self.isRecording:
            return
        cam_id = self.recordingCameraId
        try:
            self._recorder.start()
            self._record_pipeline_running = True
            self.recordingChanged.emit()
            if self._auto_save_mode:
                clip_sec = _auto_save_clip_sec()
                self._auto_save_stop_timer.start(int(clip_sec * 1000))
            else:
                self._emit(f"Recording CH{cam_id}… tap Stop & upload when done")
        except Exception as exc:
            self._recorder = None
            self._set_recording(0)
            self._record_pipeline_running = False
            self.recordingChanged.emit()
            if not self._auto_save_mode:
                self._emit(f"Record failed: {exc}")
            else:
                self._auto_save_mode = False
                self._upload_title_override = None
                self._schedule_next_auto_save()

    @pyqtSlot()
    def stopVideoRecordAndUpload(self):
        if not self.isRecording or self._recorder is None:
            return
        if self._upload_busy:
            return

        self._record_gen += 1
        recorder = self._recorder
        cam_id = self.recordingCameraId
        pipeline_running = self._record_pipeline_running and recorder.is_running()
        self._recorder = None
        self._set_recording(0)
        self._record_pipeline_running = False
        self.recordingChanged.emit()

        if not pipeline_running:
            if not self._auto_save_mode:
                self._emit("Recording cancelled")
            self._auto_save_mode = False
            self._upload_title_override = None
            self._schedule_next_auto_save()
            return

        self._set_upload_busy(True)
        if not self._auto_save_mode:
            self._emit(f"Finishing CH{cam_id} clip…")
        title_override = self._upload_title_override
        auto_mode = self._auto_save_mode
        self._auto_save_mode = False

        def worker():
            ok = False
            msg = "Upload failed"
            try:
                path, duration = recorder.stop()
                from logic.camera_video_upload import upload_clip

                ok, _code, body = upload_clip(
                    path,
                    cam_id,
                    duration_sec=duration,
                    title=title_override,
                )
                if ok:
                    if auto_mode:
                        msg = f"CH{cam_id} saved on server (website Camera Videos)"
                    else:
                        msg = f"CH{cam_id} video uploaded — check website Camera Videos"
                else:
                    if _code == 404:
                        msg = "Upload failed: server has no /api/camera-videos — deploy latest backend"
                    else:
                        msg = f"Upload failed: {body[:120]}"
            except Exception as exc:
                msg = f"Record/upload error: {exc}"
                ok = False
            self._upload_title_override = None
            self._uploadDone.emit(ok, msg)

        threading.Thread(target=worker, daemon=True, name="cam-video-upload").start()

    @pyqtSlot(bool, str)
    def _on_upload_done(self, ok: bool, message: str):
        self._set_upload_busy(False)
        self._emit(message)
        self._schedule_next_auto_save()
