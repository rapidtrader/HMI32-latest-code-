import traceback
from concurrent.futures import ThreadPoolExecutor

from app.config import log, show_error

_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="hmi")


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
