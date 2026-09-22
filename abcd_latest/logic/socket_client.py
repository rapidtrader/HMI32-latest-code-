"""
Socket.IO client — Raspberry Pi se website ko real-time data bhejne ke liye.

Events emitted (with namespace default '/'):
  - machine:connect         { machineId, ts }
  - machine:heartbeat       { machineId, ts, uptimeSec }
  - machine:state           { machineId, ts, states: {...}, adc: {...}, distance: {...} }
  - machine:gps             { machineId, ts, latitude, longitude, speed, altitude, ... }
  - machine:suction:start   { machineId, ts, date, start }
  - machine:suction:stop    { machineId, ts, date, start, stop, durationSec, formatted }
  - machine:can:cmd         { machineId, ts, cmd, cmdName, state }
  - machine:can:gpio        { machineId, ts, cmd, state }
  - machine:error           { machineId, ts, message, severity }
  - machine:a25             { machineId, ts, distance, status, rawData }

Env vars (see app.config):
  SOCKET_IO_ENABLED=1         set to "0"/"false" to disable
  SOCKET_IO_URL=...           optional override
  data/backend.json           { "backendBaseUrl": "http://<pc-ip>:4002" }
  SOCKET_IO_PATH=/socket.io   optional override if server uses custom path
"""
import json
import os
import queue
import threading
import time
import traceback
from datetime import datetime
from typing import Any, Dict, Optional

try:
    import socketio
    _HAS_SOCKETIO = True
except Exception:
    _HAS_SOCKETIO = False
    socketio = None

from app.config import get_socket_io_enabled, get_socket_io_url, log

_sio: Optional["socketio.Client"] = None
_sio_thread: Optional[threading.Thread] = None
_sio_stop = threading.Event()
_sio_connected = threading.Event()
_sio_init_done = False
_sio_lock = threading.Lock()

_machine_id_cache: Optional[str] = None
_started_at_monotonic = time.monotonic()

emit_queue: "queue.Queue[Dict[str, Any]]" = queue.Queue(maxsize=2000)

CMD_NAMES = {
    0x01: "SUCTION",
    0x02: "JET_SPRAY",
    0x03: "BRUSH_SPRAY",
    0x04: "DUMP_UP",
    0x05: "DUMP_DOWN",
    0x06: "GATE_OPEN",
    0x07: "GATE_CLOSE",
    0x08: "LEFT_EXTEND",
    0x09: "LEFT_RETRACT",
    0x0A: "RIGHT_EXTEND",
    0x0B: "RIGHT_RETRACT",
    0x0C: "REAR_UP",
    0x0D: "REAR_DOWN",
    0x0E: "FRONT_UP",
    0x0F: "FRONT_DOWN",
    0x10: "LITTER",
    0x11: "SWEEPING",
    0x12: "FCA_OPEN",
    0x13: "FCA_CLOSE",
    0x14: "FILTER_MOTOR",
    0x15: "SUCTION_SPEED",
    0x16: "EMERGENCY",
}


def cmd_name(cmd: int) -> str:
    if isinstance(cmd, str):
        try:
            cmd = int(cmd, 0)
        except Exception:
            return str(cmd)
    return CMD_NAMES.get(cmd, f"CMD_0x{cmd:02X}")


def _resolve_machine_id() -> str:
    global _machine_id_cache
    if _machine_id_cache:
        return _machine_id_cache
    try:
        from app.config import MACHINE_INFO_FILE
        if os.path.exists(MACHINE_INFO_FILE):
            try:
                with open(MACHINE_INFO_FILE, "r") as f:
                    d = json.load(f)
                    v = d.get("machineId") or d.get("machine_id", "") or ""
                    v = str(v).strip()
                    if v:
                        _machine_id_cache = v
                        return v
            except Exception:
                pass
        try:
            from logic.machine_identity import read_or_create_machine_id
            v = str(read_or_create_machine_id() or "").strip()
            if v:
                _machine_id_cache = v
                return v
        except Exception:
            pass
    except Exception:
        pass
    return "unknown"


def _envelope(data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    env: Dict[str, Any] = {
        "machineId": _resolve_machine_id(),
        "ts": datetime.utcnow().isoformat() + "Z",
        "tsEpoch": int(time.time() * 1000),
    }
    if data:
        env.update(data)
    return env


def is_available() -> bool:
    return _HAS_SOCKETIO and get_socket_io_enabled()


def is_connected() -> bool:
    return _sio_connected.is_set()


def _emit_or_queue(event: str, payload: Dict[str, Any]) -> None:
    if not is_available():
        return
    if is_connected() and _sio is not None:
        try:
            _sio.emit(event, payload)
            return
        except Exception:
            pass
    try:
        emit_queue.put_nowait({"event": event, "payload": payload})
    except queue.Full:
        try:
            emit_queue.get_nowait()
        except queue.Empty:
            pass
        try:
            emit_queue.put_nowait({"event": event, "payload": payload})
        except Exception:
            pass


def emit_gps(reading: Dict[str, Any]) -> None:
    if not isinstance(reading, dict):
        return
    data = {k: reading.get(k) for k in (
        "latitude", "longitude", "speed", "altitude", "timestamp",
        "satellites", "hdop", "fix_quality"
    ) if reading.get(k) is not None}
    _emit_or_queue("machine:gps", _envelope(data))


def emit_state(states: Dict[str, Any], adc: Optional[Dict[str, Any]] = None,
               distance: Optional[Dict[str, Any]] = None,
               runtime: Optional[Dict[str, Any]] = None) -> None:
    payload = _envelope({})
    if states:
        payload["states"] = states
    if adc:
        payload["adc"] = adc
    if distance:
        payload["distance"] = distance
    if runtime:
        payload["runtime"] = runtime
    _emit_or_queue("machine:state", payload)


def emit_suction_start(date: str, start: str) -> None:
    _emit_or_queue("machine:suction:start", _envelope({
        "date": date,
        "start": start,
    }))


def emit_suction_stop(date: str, start: str, stop: str,
                      duration_sec: float, formatted: str) -> None:
    _emit_or_queue("machine:suction:stop", _envelope({
        "date": date,
        "start": start,
        "stop": stop,
        "durationSec": float(duration_sec or 0),
        "formatted": formatted,
    }))


def emit_can_command(cmd: int, state: int) -> None:
    _emit_or_queue("machine:can:cmd", _envelope({
        "cmd": int(cmd),
        "cmdName": cmd_name(cmd),
        "state": int(state),
    }))


def emit_can_gpio(cmd: int, state: int) -> None:
    _emit_or_queue("machine:can:gpio", _envelope({
        "cmd": int(cmd),
        "cmdName": cmd_name(cmd),
        "state": int(state),
    }))


def emit_error(message: str, severity: str = "error") -> None:
    _emit_or_queue("machine:error", _envelope({
        "message": str(message or "")[:500],
        "severity": str(severity or "error"),
    }))


def emit_a25(distance: Any, raw_data: Any = None, status: Any = None) -> None:
    payload = {}
    if distance is not None:
        payload["distance"] = distance
    if raw_data is not None:
        payload["rawData"] = raw_data
    if status is not None:
        payload["status"] = status
    if payload:
        _emit_or_queue("machine:a25", _envelope(payload))


def _drain_queue() -> None:
    if not is_connected() or _sio is None:
        return
    drained = 0
    while drained < 200:
        try:
            item = emit_queue.get_nowait()
        except queue.Empty:
            break
        try:
            _sio.emit(item["event"], item["payload"])
            drained += 1
        except Exception:
            try:
                emit_queue.put_nowait(item)
            except Exception:
                pass
            break


def _build_client() -> "socketio.Client":
    assert socketio is not None
    sio = socketio.Client(
        reconnection=True,
        reconnection_attempts=0,
        reconnection_delay=2,
        reconnection_delay_max=30,
        request_timeout=15,
    )

    @sio.event
    def connect():
        log("[SOCKET.IO] connected")
        _sio_connected.set()
        try:
            sio.emit("machine:connect", _envelope({
                "uptimeSec": int(time.monotonic() - _started_at_monotonic),
                "pid": os.getpid(),
            }))
        except Exception:
            pass
        t = threading.Thread(target=_drain_queue, daemon=True)
        t.start()

    @sio.event
    def disconnect():
        log("[SOCKET.IO] disconnected")
        _sio_connected.clear()

    @sio.event
    def connect_error(data=None):
        log(f"[SOCKET.IO] connect_error: {data}")
        _sio_connected.clear()

    return sio


def _run_loop() -> None:
    global _sio
    url = get_socket_io_url()
    if not url:
        log("[SOCKET.IO] BACKEND URL not set — create data/backend.json or set BACKEND_BASE_URL")
        return
    path = os.environ.get("SOCKET_IO_PATH", "/socket.io")
    heartbeat_interval = max(5, int(os.environ.get("SOCKET_IO_HEARTBEAT_S", "30")))
    last_hb = 0.0

    while not _sio_stop.is_set():
        try:
            if _sio is None:
                _sio = _build_client()
            if not is_connected():
                try:
                    log(f"[SOCKET.IO] connecting to {url}{path}")
                    _sio.connect(url, transports=["websocket", "polling"], socketio_path=path, wait_timeout=10)
                except Exception as e:
                    log(f"[SOCKET.IO] connect failed: {e}")
                    _sio_connected.clear()
                    try:
                        _sio.disconnect()
                    except Exception:
                        pass
                    wait_s = 5
                    end = time.monotonic() + wait_s
                    while time.monotonic() < end and not _sio_stop.is_set():
                        time.sleep(0.2)
                    continue

            now = time.monotonic()
            if now - last_hb >= heartbeat_interval and is_connected():
                last_hb = now
                try:
                    _sio.emit("machine:heartbeat", _envelope({
                        "uptimeSec": int(now - _started_at_monotonic),
                        "queueDepth": emit_queue.qsize(),
                    }))
                except Exception:
                    _sio_connected.clear()

            if is_connected() and not emit_queue.empty():
                try:
                    _drain_queue()
                except Exception:
                    _sio_connected.clear()

        except Exception:
            log(f"[SOCKET.IO] loop error:\n{traceback.format_exc()}")
            _sio_connected.clear()
            try:
                if _sio:
                    _sio.disconnect()
            except Exception:
                pass
            _sio = None

        end = time.monotonic() + 0.5
        while time.monotonic() < end and not _sio_stop.is_set():
            time.sleep(0.1)

    try:
        if _sio:
            _sio.disconnect()
    except Exception:
        pass
    _sio_connected.clear()
    log("[SOCKET.IO] stopped")


def init_socket_client(blocking: bool = False) -> bool:
    global _sio_init_done, _sio_thread
    if not is_available():
        log("[SOCKET.IO] disabled or python-socketio not installed")
        return False
    if not get_socket_io_url():
        log("[SOCKET.IO] BACKEND URL not set — create data/backend.json or set BACKEND_BASE_URL")
        return False
    with _sio_lock:
        if _sio_init_done:
            return True
        _sio_stop.clear()
        _sio_thread = threading.Thread(target=_run_loop, name="socketio", daemon=True)
        _sio_thread.start()
        _sio_init_done = True
    if blocking:
        for _ in range(50):
            if is_connected():
                return True
            time.sleep(0.1)
    return True


def shutdown_socket_client() -> None:
    global _sio_init_done
    _sio_stop.set()
    with _sio_lock:
        _sio_init_done = False
    try:
        if _sio:
            _sio.disconnect()
    except Exception:
        pass
    _sio_connected.clear()
