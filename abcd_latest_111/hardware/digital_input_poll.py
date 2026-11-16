"""Active CAN poll for F_IN01–F_IN16 (0x31–0x40) so UI updates quickly."""

import threading
import time

from hardware.can_sender import can_send
from hardware.digital_inputs import DIGITAL_INPUTS

_POLL_INTERVAL_S = 0.05
_enabled = False
_lock = threading.Lock()
_thread = None


def _poll_loop() -> None:
    idx = 0
    n = len(DIGITAL_INPUTS)
    while True:
        with _lock:
            active = _enabled
        if not active:
            time.sleep(0.1)
            continue
        row = DIGITAL_INPUTS[idx]
        can_send(int(row["cmd"]), 0, force=True)
        idx = (idx + 1) % n
        time.sleep(_POLL_INTERVAL_S)


def set_pcb_plate_polling(enabled: bool) -> None:
    global _enabled, _thread
    with _lock:
        _enabled = bool(enabled)
        if _enabled and (_thread is None or not _thread.is_alive()):
            _thread = threading.Thread(target=_poll_loop, name="fin_can_poll", daemon=True)
            _thread.start()