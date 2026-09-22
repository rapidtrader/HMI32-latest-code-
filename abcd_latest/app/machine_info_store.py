import json
import os
import urllib.error
import urllib.parse
import urllib.request

from app.config import MACHINE_INFO_FILE, log
from logic.backend_clinet import get_backend_base
from logic.machine_identity import read_or_create_machine_id


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


def sync_from_api() -> None:
    local = _read_file()
    machine_id = (local.get("machineId") or local.get("machine_id") or "").strip()
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
