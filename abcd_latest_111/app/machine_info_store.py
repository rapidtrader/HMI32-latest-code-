import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

from app.config import MACHINE_INFO_FILE, log
from logic.backend_clinet import get_backend_base
from logic.machine_identity import read_or_create_machine_id

_CONFIG_404_BACKOFF_SEC = 600
_config_404_until = 0.0
_auto_register_tried = False


def _read_file() -> dict:
    try:
        if os.path.exists(MACHINE_INFO_FILE):
            with open(MACHINE_INFO_FILE, encoding="utf-8") as f:
                data = json.load(f)
            return data if isinstance(data, dict) else {}
    except Exception:
        pass
    return {}


def has_password() -> bool:
    data = _read_file()
    print(f"[DEBUG] has_password: data = {data}")
    res = bool(str(data.get("password", "") or "").strip())
    print(f"[DEBUG] has_password returned: {res}")
    return res


def verify_password(entered: str) -> bool:
    data = _read_file()
    stored = (data.get("password") or "")
    print(f"[DEBUG] verify_password: entered = '{entered}', stored = '{stored}'")
    return (entered or "") == stored


def save_local(data: dict) -> None:
    os.makedirs(os.path.dirname(MACHINE_INFO_FILE), exist_ok=True)
    with open(MACHINE_INFO_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def load_local() -> dict:
    read_or_create_machine_id()
    return _read_file()


def _try_auto_register_local(local: dict, machine_id: str) -> None:
    """After 404, PUT upsert once when operator already saved Machine Info on the Pi."""
    global _auto_register_tried
    if _auto_register_tried or not has_password():
        return
    _auto_register_tried = True
    client = str(local.get("clientName") or local.get("client_name") or "HMI").strip() or "HMI"
    loc = str(local.get("location") or "").strip()
    plate = str(local.get("vehiclePlateNo") or local.get("vehicle_plate_no") or "").strip()
    pwd = str(local.get("password") or "").strip()
    if not pwd:
        return
    res = update_on_api(machine_id, client, loc, plate, pwd)
    if res == "success":
        log("Machine info registered on server (was 404)")
    else:
        log("Machine auto-register failed — save Machine Info on HMI manually")


def sync_from_api() -> None:
    global _config_404_until
    if time.time() < _config_404_until:
        return
    local = _read_file()
    machine_id = (local.get("machineId") or local.get("machine_id") or "").strip()
    if not machine_id:
        machine_id = read_or_create_machine_id()
        local = {**local, "machineId": machine_id}
    if not machine_id:
        return
    base = get_backend_base()
    if not base:
        log("sync_from_api skipped: BACKEND URL not set (data/backend.json)")
        return
    try:
        url = f"{base}/api/machines/machine/{urllib.parse.quote(machine_id)}/config"
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=5) as resp:
            if not (200 <= resp.status < 300):
                return
            api_data = json.loads(resp.read().decode("utf-8"))
            data = api_data
            if isinstance(api_data, dict):
                data = (
                    api_data.get("data")
                    or api_data.get("machine")
                    or api_data.get("config")
                    or api_data
                )
            if not isinstance(data, dict):
                data = {}

            merged = {
                "machineId": data.get("machineId") or data.get("machine_id") or machine_id,
                "clientName": data.get("clientName") or data.get("client_name") or "",
                "location": data.get("location") or "",
                "vehiclePlateNo": data.get("vehiclePlateNo") or data.get("vehicle_plate_no") or "",
                "password": data.get("password") or local.get("password", ""),
                "confirmPassword": data.get("confirmPassword")
                or data.get("password")
                or local.get("password", ""),
            }
            save_local(merged)
            log("Machine info synced from API")
            _config_404_until = 0.0
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            _config_404_until = time.time() + _CONFIG_404_BACKOFF_SEC
            _try_auto_register_local(local, machine_id)
            if not _auto_register_tried or not has_password():
                log(
                    "sync_from_api: machine not on server — open Machine Info on HMI and Save (404, retry in 10 min)"
                )
            return
        log(f"sync_from_api failed: HTTP Error {exc.code}: {exc.reason}")
    except Exception as exc:
        log(f"sync_from_api failed: {exc}")


def submit_to_api(machine_id, client_name, location, plate, password) -> str:
    api_data = {
        "machineId": machine_id.strip(),
        "clientName": client_name.strip(),
        "location": location.strip(),
        "vehiclePlateNo": plate.strip(),
        "password": password,
    }
    local_data = {
        **api_data,
        "confirmPassword": password,
    }
    url = f"{get_backend_base()}/api/machines"
    req = urllib.request.Request(
        url,
        data=json.dumps(api_data).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            if 200 <= resp.status < 300:
                save_local(local_data)
                return "success"
        return "error"
    except urllib.error.HTTPError as e:
        if e.code == 400:
            try:
                body = e.read().decode("utf-8", errors="replace") if e.fp else ""
                if "already" in body.lower() and "exist" in body.lower():
                    return "duplicate"
            except Exception:
                pass
        return "error"
    except Exception as exc:
        log(f"submitMachineInfo: {exc}")
        return "error"


def update_on_api(machine_id, client_name, location, plate, password) -> str:
    api_data = {
        "clientName": client_name.strip(),
        "location": location.strip(),
        "vehiclePlateNo": plate.strip(),
        "password": password,
    }
    local_data = {
        "machineId": machine_id.strip(),
        **api_data,
        "confirmPassword": password,
    }
    url = f"{get_backend_base()}/api/machines/machine/{urllib.parse.quote(str(machine_id))}"
    req = urllib.request.Request(
        url,
        data=json.dumps(api_data).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="PUT",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            if 200 <= resp.status < 300:
                save_local(local_data)
                return "success"
        return "error"
    except Exception as exc:
        log(f"updateMachineInfo: {exc}")
        return "error"
