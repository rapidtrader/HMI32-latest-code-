import traceback
from concurrent.futures import ThreadPoolExecutor

from app.config import log, show_error

_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="hmi")
# CAN/GPIO machine actions must run in order (parallel pool caused OFF then ON race).
_machine_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="hmi-machine")


def run_background(label: str, fn, *args, **kwargs) -> None:
    print(f"[DEBUG] run_background called with label: {label}")
    def task():
        print(f"[DEBUG] Executing task for label: {label}")
        try:
            fn(*args, **kwargs)
        except Exception:
            error_msg = f"{label}: Run Code Issue - {traceback.format_exc().splitlines()[-1]}"
            log(f"[{label}] failed:\n{traceback.format_exc()}")
            print(f"[DEBUG] {label} failed:\n{traceback.format_exc()}")
            show_error(error_msg, "error")

    _pool.submit(task)


def run_machine_background(label: str, fn, *args, **kwargs) -> None:
    """Serial queue for brush/CAN machine_logic (avoid concurrent ON/OFF)."""
    print(f"[DEBUG] run_machine_background called with label: {label}")

    def task():
        print(f"[DEBUG] Executing machine task for label: {label}")
        try:
            fn(*args, **kwargs)
        except Exception:
            error_msg = f"{label}: Run Code Issue - {traceback.format_exc().splitlines()[-1]}"
            log(f"[{label}] failed:\n{traceback.format_exc()}")
            print(f"[DEBUG] {label} failed:\n{traceback.format_exc()}")
            show_error(error_msg, "error")

    _machine_pool.submit(task)
