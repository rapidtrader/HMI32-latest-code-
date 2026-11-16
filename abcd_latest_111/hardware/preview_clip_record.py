"""Live preview → continuous segments (default 10 min) → server while cameras ON."""
import os
import queue
import subprocess
import threading
import time
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from PyQt5.QtCore import Qt
from PyQt5.QtGui import QImage

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLIP_DIR = os.path.join(BASE_DIR, "data", "video_clips")

_lock = threading.Lock()
_recorders: Dict[int, "PreviewClipRecorder"] = {}
_rolling: Optional["RollingCaptureManager"] = None
_local_capture_lock = threading.RLock()
_local_capture: Optional["LocalPreviewCaptureManager"] = None


def _clip_fps() -> int:
    try:
        return max(4, min(15, int(os.environ.get("CAMERA_PREVIEW_CLIP_FPS", "8"))))
    except ValueError:
        return 8


def _segment_sec() -> float:
    try:
        sec = float(os.environ.get("CAMERA_AUTO_SAVE_CLIP_SEC", "1"))
        return max(1.0, min(3600.0, sec))
    except ValueError:
        return 1.0


def _ffmpeg_encode_cmd(out_path: str, w: int, h: int, fps: int) -> List[str]:
    codec = os.environ.get("CAMERA_PREVIEW_CLIP_CODEC", "auto").strip().lower()
    base = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s",
        f"{w}x{h}",
        "-r",
        str(fps),
        "-i",
        "pipe:0",
        "-an",
    ]
    if codec == "webm":
        return base + ["-c:v", "libvpx", "-b:v", "800k", out_path]
    return base + [
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "28",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        out_path,
    ]


def _ffmpeg_available() -> bool:
    import shutil

    return bool(shutil.which("ffmpeg"))


def _qimage_to_rgb24(img: QImage, width: int, height: int) -> Optional[bytes]:
    """Pack QImage to tight RGB24 (handles bytesPerLine padding on ARM/PyQt5)."""
    img = img.convertToFormat(QImage.Format_RGB888)
    if img.width() != width or img.height() != height:
        img = img.scaled(
            width,
            height,
            Qt.IgnoreAspectRatio,
            Qt.FastTransformation,
        )
        img = img.convertToFormat(QImage.Format_RGB888)
    if img.width() != width or img.height() != height:
        return None
    need = width * height * 3
    out = bytearray(need)
    for y in range(height):
        line = img.scanLine(y)
        if line is None:
            return None
        try:
            line.setsize(width * 3)
            row = bytes(line)
        except Exception:
            return None
        if len(row) < width * 3:
            return None
        off = y * width * 3
        out[off : off + width * 3] = row[: width * 3]
    return bytes(out)



class PreviewClipRecorder:
    def __init__(self, channel_id: int, width: int, height: int, fps: int):
        self.channel_id = int(channel_id)
        self.width = int(width)
        self.height = int(height)
        self.fps = int(fps)

        self._proc: Optional[subprocess.Popen] = None
        self._active = False
        self._done = False
        self._start = 0.0
        self._duration = 0.0
        self._last_write = 0.0
        self._min_interval = 1.0 / max(1, self.fps)
        self._out_path = ""

        self._frame_lock = threading.Lock()
        self._frame_queue = None
        self._writer_thread = None
        self._writer_done = threading.Event()

        self._frames_written = 0
        self._error = ""
        self._logged_first_write = False

    def start(self, duration_sec: float, out_path: Optional[str] = None) -> bool:
        os.makedirs(CLIP_DIR, exist_ok=True)

        if not out_path:
            out_path = os.path.join(
                CLIP_DIR,
                f"preview_ch{self.channel_id}_{uuid.uuid4().hex[:10]}.mp4",
            )

        self._out_path = out_path
        self._duration = max(3.0, float(duration_sec))
        self._start = time.time()
        self._last_write = 0.0
        self._frames_written = 0
        self._error = ""
        self._logged_first_write = False
        self._done = False
        self._writer_done.clear()

        try:
            cmd = _ffmpeg_encode_cmd(
                out_path, self.width, self.height, self.fps
            )

            proc = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                bufsize=0,
            )

            if proc.stdin is None:
                proc.kill()
                proc.wait(timeout=5)
                self._error = "FFmpeg stdin unavailable"
                return False

            self._proc = proc
            self._frame_queue = queue.Queue(maxsize=2)
            self._active = True

            self._writer_thread = threading.Thread(
                target=self._writer_loop,
                args=(proc, self._frame_queue),
                daemon=True,
                name=f"cam-ffmpeg-writer-{self.channel_id}",
            )
            self._writer_thread.start()

            return True

        except Exception as exc:
            self._active = False
            self._error = str(exc)

            proc = self._proc
            self._proc = None

            if proc is not None:
                try:
                    proc.kill()
                    proc.wait(timeout=5)
                except Exception:
                    pass

            return False

    def segment_elapsed(self) -> bool:
        return (
            self._active
            and not self._done
            and (time.time() - self._start) >= self._duration
        )

    def feed_frame(self, image: QImage) -> None:
        if image is None or image.isNull():
            return

        if not self._active or self._done:
            return

        if self.segment_elapsed():
            return

        now = time.time()

        # Shallow QImage copy: actual RGB conversion happens in writer thread.
        frame = QImage(image)

        with self._frame_lock:
            if self._done or not self._active:
                return

            if self._frame_queue is None:
                return

            if now - self._last_write < self._min_interval:
                return

            try:
                self._frame_queue.put_nowait(frame)

            except queue.Full:
                # Prefer the newest frame over stale pending frames.
                try:
                    self._frame_queue.get_nowait()
                except queue.Empty:
                    pass

                try:
                    self._frame_queue.put_nowait(frame)
                except queue.Full:
                    return

            self._last_write = now

    def _writer_loop(self, proc, frame_queue) -> None:
        try:
            while True:
                frame = frame_queue.get()

                if frame is None:
                    break

                if proc.poll() is not None:
                    raise BrokenPipeError(
                        "FFmpeg exited before frame write"
                    )

                raw = _qimage_to_rgb24(
                    frame, self.width, self.height
                )

                if not raw:
                    continue

                if proc.stdin is None:
                    raise BrokenPipeError("FFmpeg stdin unavailable")

                written = proc.stdin.write(raw)

                if written != len(raw):
                    raise OSError("Incomplete FFmpeg frame write")

                with self._frame_lock:
                    self._frames_written += 1

                    if not self._logged_first_write:
                        self._logged_first_write = True
                        print(
                            f"[CAMERA-VIDEO] CH{self.channel_id} "
                            f"segment encoding {self.width}x{self.height} "
                            f"@ {self.fps}fps"
                        )

        except Exception as exc:
            with self._frame_lock:
                self._error = str(exc)
                self._active = False

            print(
                f"[CAMERA-VIDEO] CH{self.channel_id} "
                f"writer error: {exc}"
            )

        finally:
            try:
                if proc.stdin is not None:
                    proc.stdin.close()
            except Exception:
                pass

            self._writer_done.set()

    def is_recording(self) -> bool:
        if self._done or not self._active:
            return False

        return (time.time() - self._start) < self._duration

    def finish(self) -> Tuple[Optional[str], float, str]:
        with self._frame_lock:
            if self._done:
                dur = (
                    self._duration
                    if self._frames_written > 0 else 0.0
                )
                return (
                    self._out_path if self._frames_written else None,
                    dur,
                    self._error,
                )

            self._done = True
            self._active = False

            dur = min(
                self._duration,
                max(0.0, time.time() - self._start),
            )

            proc = self._proc
            self._proc = None

            frame_queue = self._frame_queue
            writer = self._writer_thread

        # Stop accepting frames before draining the queue.
        if frame_queue is not None and writer is not None:
            try:
                frame_queue.put(None, timeout=2.0)
            except queue.Full:
                # A blocked FFmpeg write must not block finalization forever.
                if proc is not None:
                    try:
                        proc.kill()
                    except Exception:
                        pass

        if writer is not None and writer.is_alive():
            writer.join(timeout=5.0)

        if writer is not None and writer.is_alive():
            if proc is not None:
                try:
                    proc.kill()
                except Exception:
                    pass

            writer.join(timeout=5.0)

        err = self._error

        if writer is not None and writer.is_alive():
            err = err or "FFmpeg writer thread did not stop"

        if proc is not None:
            try:
                proc.wait(timeout=5.0)

            except subprocess.TimeoutExpired:
                try:
                    proc.kill()
                except Exception:
                    pass

                try:
                    proc.wait(timeout=5.0)
                except subprocess.TimeoutExpired:
                    err = err or "FFmpeg process did not exit"

        path = None

        if (
            writer is not None
            and not writer.is_alive()
            and self._writer_done.is_set()
            and proc is not None
            and proc.returncode == 0
            and self._frames_written > 0
            and os.path.isfile(self._out_path)
        ):
            try:
                if os.path.getsize(self._out_path) > 500:
                    path = self._out_path
                else:
                    err = err or "FFmpeg output incomplete"
            except OSError:
                err = err or "Cannot inspect FFmpeg output"

        elif self._frames_written == 0:
            err = err or "no preview frames"

        elif not err:
            err = "FFmpeg output incomplete"

        return path, dur, err or ""

def _resolve_tile_size(channel_id: int) -> Tuple[int, int]:
    from app.gstreamer_preview_registry import get_preview_item

    default_w = int(os.environ.get("CAMERA_PREVIEW_WIDTH", "480"))
    default_h = int(os.environ.get("CAMERA_PREVIEW_HEIGHT", "270"))
    w, h = default_w, default_h
    item = get_preview_item(int(channel_id))
    if item is not None:
        try:
            fw = int(item.width())
            fh = int(item.height())
            if fw >= 160 and fh >= 90:
                w, h = fw, fh
        except Exception:
            pass
        frame = getattr(item, "_frame", None) or getattr(item, "_pending_frame", None)
        if frame is not None and not frame.isNull():
            w, h = frame.width(), frame.height()
    return max(160, min(960, w)), max(90, min(540, h))


def is_preview_live(channel_id: int) -> bool:
    from app.gstreamer_preview_registry import get_preview_item

    item = get_preview_item(int(channel_id))
    if item is None:
        return False
    if not getattr(item, "_active", False):
        return False
    return getattr(item, "_pipeline", None) is not None

def _segment_ok_for_upload(
    rec: "PreviewClipRecorder", path: str, duration: float
) -> bool:
    """Skip near-empty segments (~11 KB) when preview barely feeds frames (CH1/3/4)."""
    frames = int(getattr(rec, "_frames_written", 0) or 0)
    fps = max(1, int(getattr(rec, "fps", 8) or 8))
    need_frames = max(24, int(duration * fps * 0.12))
    if frames < need_frames:
        print(
            f"[CAMERA-VIDEO] CH{rec.channel_id} skip upload: "
            f"{frames} frames (need ~{need_frames} for {duration:.0f}s)"
        )
        return False
    try:
        sz = os.path.getsize(path)
    except OSError:
        return False
    min_bytes = max(50_000, int(duration * 400))
    if sz < min_bytes:
        print(
            f"[CAMERA-VIDEO] CH{rec.channel_id} skip upload: "
            f"{sz} B (need ~{min_bytes} B)"
        )
        return False
    return True


def _publish_clip(channel_id: int, path: str, duration: float) -> None:
    from logic.camera_auto_save import kick_sync_background, push_clip_to_server

    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    title = f"CH{channel_id} {stamp}"
    uploaded, queued = push_clip_to_server(
        path, int(channel_id), duration_sec=duration, title=title
    )
    if uploaded:
        return
    if queued:
        print(
            f"[CAMERA-VIDEO] CH{channel_id} segment ({duration:.1f}s) "
            f"→ JSON retry queue"
        )
        kick_sync_background(limit=2)


class RollingCaptureManager:
    """Per channel: continuous segments (e.g. 10 min); encode+upload in background."""

    def __init__(self):
        self._halt = threading.Event()
        self._channels: List[int] = []
        self._finalize_threads = set()
        self._finalize_lock = threading.Lock()
        self._segment_sec = 10.0
        self._fps = 8
        self._sizes: Dict[int, Tuple[int, int]] = {}
        self._active: Dict[int, PreviewClipRecorder] = {}
        self._seg_num: Dict[int, int] = {}
        self._feed_lock = threading.Lock()
        self._watchdog_thread: Optional[threading.Thread] = None

    @property
    def active(self) -> bool:
        return not self._halt.is_set() and bool(self._channels)

    def start(self, channel_ids: List[int], segment_sec: Optional[float] = None) -> None:
        if not _ffmpeg_available():
            print("[CAMERA-VIDEO] ffmpeg missing — run: sudo apt install -y ffmpeg")
            self._channels = []
            return
        self._halt.clear()
        self._segment_sec = segment_sec if segment_sec is not None else _segment_sec()
        self._fps = _clip_fps()
        self._channels = [int(c) for c in channel_ids if is_preview_live(int(c))]
        self._sizes = {}
        self._active = {}
        self._seg_num = {c: 0 for c in self._channels}
        for cid in self._channels:
            self._sizes[cid] = _resolve_tile_size(cid)
        print(
            f"[CAMERA-VIDEO] Continuous rolling CH{self._channels} "
            f"every {self._segment_sec}s (live preview ON)"
        )
        self._watchdog_thread = threading.Thread(
            target=self._watchdog_loop, daemon=True, name="cam-roll-watchdog"
        )
        self._watchdog_thread.start()

    def _launch_finalizer(
        self,
        rec: PreviewClipRecorder,
        channel_id: int,
        publish: bool = True,
    ) -> None:
        def runner():
            try:
                self._finalize_recorder(rec, channel_id, publish)
            finally:
                with self._finalize_lock:
                    self._finalize_threads.discard(
                        threading.current_thread()
                    )

        thread = threading.Thread(
            target=runner,
            daemon=False,
            name=f"cam-roll-{channel_id}",
        )

        with self._finalize_lock:
            self._finalize_threads.add(thread)

        thread.start()


    def _watchdog_loop(self) -> None:
        while not self._halt.is_set():
            time.sleep(0.4)
            with self._feed_lock:
                for cid in list(self._channels):
                    rec = self._active.get(cid)
                    if rec is None:
                        continue
                    if rec.segment_elapsed():
                        self._rotate_segment(cid)

    def stop(self) -> None:
        self._halt.set()

        wt = self._watchdog_thread
        self._watchdog_thread = None

        # Watchdog must exit before collecting finalizers.
        if wt is not None and wt.is_alive():
            wt.join()

        with self._feed_lock:
            finishing = list(self._active.values())
            self._active.clear()

            for rec in finishing:
                self._launch_finalizer(
                    rec,
                    rec.channel_id,
                    False,
                )

        # Wait for all active and previously rotating finalizers.
        with self._finalize_lock:
            pending = list(self._finalize_threads)

        for thread in pending:
            thread.join()

        self._channels = []

    def _start_segment(self, channel_id: int) -> Optional[PreviewClipRecorder]:
        w, h = self._sizes.get(channel_id) or _resolve_tile_size(channel_id)
        self._sizes[channel_id] = (w, h)
        rec = PreviewClipRecorder(channel_id, w, h, self._fps)
        if not rec.start(self._segment_sec):
            print(f"[CAMERA-VIDEO] CH{channel_id} segment start failed: {rec._error}")
            return None
        self._seg_num[channel_id] = self._seg_num.get(channel_id, 0) + 1
        return rec

    def _finalize_recorder(
        self,
        rec: PreviewClipRecorder,
        channel_id: int,
        publish: bool = True,
    ) -> None:
        path, duration, err = rec.finish()

        if path and publish:
            if _segment_ok_for_upload(rec, path, duration):
                _publish_clip(channel_id, path, duration)
            else:
                try:
                    os.remove(path)
                except OSError:
                    pass
        elif path:
            print(
                f"[CAMERA-VIDEO] CH{channel_id} recording finalized "
                f"(upload skipped)"
            )
        elif err:
            print(f"[CAMERA-VIDEO] CH{channel_id} segment finalize: {err}")
    def _rotate_segment(self, channel_id: int) -> None:
        old = self._active.pop(channel_id, None)

        if old is not None:
            self._launch_finalizer(old, channel_id, True)

        if not self._halt.is_set():
            nrec = self._start_segment(channel_id)
            if nrec:
                self._active[channel_id] = nrec

    def feed(self, channel_id: int, image: QImage) -> None:
        with self._feed_lock:
            if self._halt.is_set() or channel_id not in self._channels:
                return

            rec = self._active.get(channel_id)
            if rec is None:
                rec = self._start_segment(channel_id)
                if rec is None:
                    return
                self._active[channel_id] = rec
            if rec.segment_elapsed():
                self._rotate_segment(channel_id)
                rec = self._active.get(channel_id)
                if rec is None:
                    return
            rec.feed_frame(image)


def start_rolling_capture(
    channel_ids: List[int], segment_sec: Optional[float] = None
) -> bool:
    global _rolling
    with _local_capture_lock:
        if _local_capture is not None and _local_capture.active:
            print("[CAMERA-VIDEO] Local recording active — rolling start refused")
            return False
    if not _ffmpeg_available():
        print("[CAMERA-VIDEO] Cannot start rolling capture — install ffmpeg")
        return False
    stop_rolling_capture()
    mgr = RollingCaptureManager()
    mgr.start(channel_ids, segment_sec=segment_sec)
    if not mgr._channels:
        return False
    _rolling = mgr
    return True


def stop_rolling_capture() -> None:
    global _rolling
    if _rolling is not None:
        _rolling.stop()
        _rolling = None


def rolling_capture_active() -> bool:
    return _rolling is not None and _rolling.active



class LocalPreviewCaptureManager:
    """Local-only preview recording. Never publishes or indexes clips."""

    def __init__(self, channel_ids: List[int], output_dir: str):
        self._channels = [int(c) for c in channel_ids]
        self.output_dir = output_dir
        self._fps = _clip_fps()
        self._lock = threading.RLock()
        self._active = False
        self._recorders: Dict[int, PreviewClipRecorder] = {}

    @property
    def active(self) -> bool:
        with self._lock:
            return self._active

    def start(self) -> bool:
        os.makedirs(self.output_dir, exist_ok=False)

        with self._lock:
            self._active = True

        for cid in self._channels:
            if not is_preview_live(cid):
                continue

            w, h = _resolve_tile_size(cid)
            out_path = os.path.join(self.output_dir, f"CH{cid}.mp4")
            rec = PreviewClipRecorder(cid, w, h, self._fps)

            # Long-running single file; no segment rotation or upload.
            if rec.start(24 * 60 * 60, out_path=out_path):
                with self._lock:
                    self._recorders[cid] = rec
                print(
                    f"[LOCAL-RECORD] CH{cid} started "
                    f"{w}x{h} @ {self._fps}fps -> {out_path}"
                )
            else:
                print(
                    f"[LOCAL-RECORD] CH{cid} start failed: {rec._error}"
                )

        with self._lock:
            if not self._recorders:
                self._active = False
                return False

        return True

    def feed(self, channel_id: int, image: QImage) -> None:
        with self._lock:
            if not self._active:
                return
            rec = self._recorders.get(int(channel_id))
            if rec is not None:
                rec.feed_frame(image)

    def stop(self) -> Dict[int, Tuple[Optional[str], float, str]]:
        with self._lock:
            self._active = False
            recorders = dict(self._recorders)
            self._recorders.clear()

        results = {}
        results_lock = threading.Lock()
        threads = []

        def finalize(cid, rec):
            try:
                result = rec.finish()
            except Exception as exc:
                result = (None, 0.0, str(exc))
            with results_lock:
                results[cid] = result

        for cid, rec in recorders.items():
            thread = threading.Thread(
                target=finalize,
                args=(cid, rec),
                daemon=False,
                name=f"local-record-finalize-{cid}",
            )
            threads.append(thread)
            thread.start()

        for thread in threads:
            thread.join()

        for cid, (path, duration, error) in sorted(results.items()):
            if path:
                print(
                    f"[LOCAL-RECORD] CH{cid} finalized "
                    f"({duration:.1f}s): {path}"
                )
            else:
                print(f"[LOCAL-RECORD] CH{cid} failed: {error}")

        return results


def start_local_preview_capture(channel_ids: List[int]) -> Tuple[bool, str]:
    """Start independent local MP4 files for currently live preview channels."""
    global _local_capture

    if not _ffmpeg_available():
        return False, "FFmpeg is not available"

    with _local_capture_lock:
        if _local_capture is not None and _local_capture.active:
            return False, "Local recording is already active"

        if _rolling is not None and _rolling.active:
            return False, "Website rolling capture is active; local start refused"

        with _lock:
            legacy_active = any(
                recorder.is_recording()
                for recorder in _recorders.values()
            )

        if legacy_active:
            return False, "Another preview recorder is active; local start refused"

        live_channels = sorted({
            int(cid) for cid in channel_ids
            if is_preview_live(int(cid))
        })

        if not live_channels:
            return False, "No live preview channels found"

        session = (
            datetime.now().strftime("%Y%m%d_%H%M%S")
            + "_"
            + uuid.uuid4().hex[:8]
        )
        output_dir = os.path.join("/tmp/hmi_local_capture", session)
        manager = LocalPreviewCaptureManager(live_channels, output_dir)

        try:
            if not manager.start():
                return False, "Could not start a recorder for any live channel"
        except Exception as exc:
            manager.stop()
            return False, f"Local recorder start failed: {exc}"

        _local_capture = manager
        print(f"[LOCAL-RECORD] Local-only session started: {output_dir}")
        return True, output_dir


def stop_local_preview_capture():
    """Stop local capture and finalize files. This function never uploads."""
    global _local_capture

    with _local_capture_lock:
        manager = _local_capture
        _local_capture = None

    if manager is None:
        return {}

    return manager.stop()


def feed_clip_frame(channel_id: int, image: QImage) -> None:
    global _rolling

    with _local_capture_lock:
        local_manager = _local_capture

    if local_manager is not None and local_manager.active:
        local_manager.feed(int(channel_id), image)
        return

    if _rolling is not None and _rolling.active:
        _rolling.feed(int(channel_id), image)
        return

    with _lock:
        rec = _recorders.get(int(channel_id))
    if rec is not None:
        rec.feed_frame(image)


# --- legacy one-shot batch (unused when rolling ON) ---

def start_batch_clip_capture(
    channel_ids: List[int], duration_sec: float
) -> Dict[int, PreviewClipRecorder]:
    with _local_capture_lock:
        if _local_capture is not None and _local_capture.active:
            print("[CAMERA-VIDEO] Local recording active — batch start refused")
            return {}
    fps = _clip_fps()
    started: Dict[int, PreviewClipRecorder] = {}
    with _lock:
        _recorders.clear()
        for cid in channel_ids:
            if not is_preview_live(int(cid)):
                continue
            w, h = _resolve_tile_size(cid)
            rec = PreviewClipRecorder(cid, w, h, fps)
            if rec.start(duration_sec):
                _recorders[cid] = rec
                started[cid] = rec
    return started


def wait_batch_complete(
    recorders: Dict[int, PreviewClipRecorder],
    duration_sec: float,
    extra_wait: float = 12.0,
) -> Dict[int, Tuple[Optional[str], float, str]]:
    if not recorders:
        return {}
    deadline = time.time() + float(duration_sec) + extra_wait
    while time.time() < deadline:
        if all(not r.is_recording() for r in recorders.values()):
            break
        time.sleep(0.15)
    time.sleep(0.3)
    out: Dict[int, Tuple[Optional[str], float, str]] = {}
    for cid, rec in recorders.items():
        out[cid] = rec.finish()
    with _lock:
        for cid in list(recorders.keys()):
            _recorders.pop(cid, None)
    return out


def any_batch_active() -> bool:
    if rolling_capture_active():
        return True
    with _lock:
        return any(r.is_recording() for r in _recorders.values())
