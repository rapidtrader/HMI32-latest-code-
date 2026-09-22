"""
Node/Mongo backend par data bhejne ke helpers (urllib — extra dependency nahi).
Environment:
  BACKEND_BASE_URL — override
  data/backend.json — { "backendBaseUrl": "https://hmi.dynacleanindustries.com" }
  Local dev example: "http://<pc-ip>:4002"
"""
import json
import os
import urllib.error
import urllib.request
from datetime import datetime
from urllib.parse import quote, urlencode


def get_backend_base():
    try:
        from app.config import get_backend_base_url
        return get_backend_base_url()
    except Exception:
        return os.environ.get("BACKEND_BASE_URL", "").strip().rstrip("/")


def _get_json(path, query=None, timeout=10):
    """GET {base}{path}?... — returns (ok, status_code|None, parsed dict|None, raw str)."""
    url = f"{get_backend_base()}{path}"
    if query:
        q = {k: v for k, v in query.items() if v is not None}
        if q:
            url = f"{url}?{urlencode(q)}"
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            text = resp.read().decode("utf-8", errors="replace")
            try:
                return True, resp.status, json.loads(text), text
            except json.JSONDecodeError:
                return False, resp.status, None, text
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace") if e.fp else ""
        try:
            return False, e.code, json.loads(raw) if raw else None, raw
        except json.JSONDecodeError:
            return False, e.code, None, raw
    except urllib.error.URLError as e:
        return False, None, None, str(e.reason)


def get_gps_locations(device_id=None, limit=100, skip=0, timeout=10):
    """
    GET /api/gps — saari points (optional filter by deviceId).

    Returns:
        (ok, status_code, body_dict) — body_dict is API JSON e.g. { success, data, total, ... }
    """
    query = {"limit": limit, "skip": skip}
    if device_id:
        query["deviceId"] = device_id
    ok, code, parsed, _ = _get_json("/api/gps", query=query, timeout=timeout)
    return ok, code, parsed


def get_gps_latest(device_id, timeout=10):
    """
    GET /api/gps/latest/:deviceId — ek device ka sabse naya point.
    """
    did = str(device_id or "").strip()
    if not did:
        return False, None, {"success": False, "error": "device_id is empty"}
    ok, code, parsed, _ = _get_json(f"/api/gps/latest/{quote(did, safe='')}", timeout=timeout)
    return ok, code, parsed


def get_gps_device_ids(timeout=10):
    """GET /api/gps/devices — jitne bhi deviceId DB mein hain."""
    ok, code, parsed, _ = _get_json("/api/gps/devices", timeout=timeout)
    return ok, code, parsed


def post_gps(
    device_id,
    latitude,
    longitude,
    speed=0.0,
    altitude=0.0,
    extra=None,
    timeout=10,
):
    """
    POST /api/gps — location row (Mongo GPS collection / map).

    Body: deviceId, latitude, longitude, speed, altitude; optional extra fields merged in
    (e.g. timestamp) if your Node route stores them.
    Returns:
        (ok: bool, status_code: int|None, body_text: str)
    """
    mid = str(device_id or "").strip()
    if not mid:
        return False, None, "device_id is empty"
    body = {
        "deviceId": mid,
        "latitude": float(latitude),
        "longitude": float(longitude),
        "speed": float(speed),
        "altitude": float(altitude),
    }
    if extra and isinstance(extra, dict):
        body.update(extra)

    url = f"{get_backend_base()}/api/gps"
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            text = resp.read().decode("utf-8", errors="replace")
            return 200 <= resp.status < 300, resp.status, text
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace") if e.fp else ""
        return False, e.code, raw
    except urllib.error.URLError as e:
        return False, None, str(e.reason)


def push_gps_reading(
    machine_id,
    reading,
    post_api_gps=True,
    post_pi_data_doc=True,
    timeout=10,
):
    """
    One GPS fix ko do jagah bhejo (optional):

    1) POST /api/gps — deviceId + lat/lon/speed/alt (+ timestamp extra agar ho)
    2) POST /api/pi-data — type=gps, poora reading dict Mongo `payload` mein (saara JSON)
    3) Socket.IO emit `machine:gps` — realtime website dashboards ke liye

    reading: get_gps_data() jaisa dict — latitude, longitude, timestamp
    Returns:
        dict with keys ok_gps, ok_pi, errors (list)
    """
    mid = str(machine_id or "").strip()
    out = {"ok_gps": True, "ok_pi": True, "errors": []}
    if not mid:
        out["ok_gps"] = out["ok_pi"] = False
        out["errors"].append("machine_id is empty")
        return out
    if not isinstance(reading, dict):
        out["ok_gps"] = out["ok_pi"] = False
        out["errors"].append("reading must be a dict")
        return out
    lat = reading.get("latitude")
    lon = reading.get("longitude")
    if lat is None or lon is None:
        out["ok_gps"] = out["ok_pi"] = False
        out["errors"].append("latitude/longitude missing")
        return out

    try:
        from logic.socket_client import emit_gps
        emit_gps(reading)
    except Exception:
        pass

    ts = reading.get("timestamp")
    extra = {"timestamp": ts} if ts else None

    if post_api_gps:
        ok, code, text = post_gps(mid, lat, lon, extra=extra, timeout=timeout)
        out["ok_gps"] = ok
        out["gps_status"] = code
        out["gps_body"] = text[:500] if text else ""
        if not ok:
            out["errors"].append(f"/api/gps failed: {code} {text[:200]}")

    if post_pi_data_doc:
        # Poora snapshot JSON — same keys as reading + deviceId copy for queries inside payload
        payload = dict(reading)
        payload["deviceId"] = mid
        ok2, code2, text2 = post_pi_data(mid, payload, doc_type="gps", timeout=timeout)
        out["ok_pi"] = ok2
        out["pi_status"] = code2
        out["pi_body"] = text2[:500] if text2 else ""
        if not ok2:
            out["errors"].append(f"/api/pi-data failed: {code2} {text2[:200]}")

    return out


def post_hmi32_state(
    machine_id,
    states,
    adc=None,
    distance=None,
    runtime=None,
    timeout=10,
):
    """
    POST /api/hmi32/history — machine state snapshot (HTTP fallback when Socket.IO unavailable).
    Returns (ok: bool, status_code: int|None, body_text: str)
    """
    base = get_backend_base()
    if not base:
        return False, None, "BACKEND_BASE_URL not configured"

    mid = str(machine_id or "").strip()
    if not mid:
        return False, None, "machine_id is empty"

    body = {
        "machineId": mid,
        "state": states if isinstance(states, dict) else {},
        "adc": adc if isinstance(adc, dict) else {},
        "distance": distance if isinstance(distance, dict) else {},
        "runtime": runtime if isinstance(runtime, dict) else {},
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }

    url = f"{base}/api/hmi32/history"
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            text = resp.read().decode("utf-8", errors="replace")
            return 200 <= resp.status < 300, resp.status, text
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace") if e.fp else ""
        return False, e.code, raw
    except urllib.error.URLError as e:
        return False, None, str(e.reason)


def post_pi_data(machine_id, payload, doc_type=None, timeout=10):
    """
    POST /api/pi-data — arbitrary JSON MongoDB mein save.

    Args:
        machine_id: machineId / device id (string)
        payload: dict — jo DB mein `payload` field mein jayega
        doc_type: optional category string (`type` field)
    Returns:
        (ok: bool, status_code: int|None, body_text: str)
    """
    if not isinstance(payload, dict):
        raise TypeError("payload must be a dict")
    mid = str(machine_id or "").strip()
    if not mid:
        return False, None, "machine_id is empty"

    body = {"machineId": mid, "payload": payload}
    if doc_type is not None and str(doc_type).strip():
        body["type"] = str(doc_type).strip()

    url = f"{get_backend_base()}/api/pi-data"
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            text = resp.read().decode("utf-8", errors="replace")
            return 200 <= resp.status < 300, resp.status, text
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace") if e.fp else ""
        return False, e.code, raw
    except urllib.error.URLError as e:
        return False, None, str(e.reason)


def _response_is_duplicate_machine_id(body):
    """True when POST /api/machines rejects because machineId already exists."""
    if not body:
        return False
    low = body.lower()
    if "already" in low and "exist" in low:
        return True
    try:
        o = json.loads(body)
        err = (o.get("error") or o.get("message") or "").lower()
        return "already" in err and "exist" in err
    except Exception:
        return False


def upsert_machine_info(
    machine_id,
    client_name,
    location,
    vehicle_plate_no,
    password,
    timeout=15,
):
    """
    Register or update machine on backend (Mongo via Node API).
    POST /api/machines; if machineId exists, PUT /api/machines/machine/:id — same as Machine Info UI.

    Returns:
        (ok: bool, status_code: int | None, body_snippet: str, action: str)
        action is 'POST', 'PUT', or 'error'.
    """
    mid = str(machine_id or "").strip()
    if not mid:
        return False, None, "machine_id is empty", "error"

    api_data = {
        "machineId": mid,
        "clientName": str(client_name or "").strip(),
        "location": str(location or "").strip(),
        "vehiclePlateNo": str(vehicle_plate_no or "").strip(),
        "password": str(password or ""),
    }

    url_post = f"{get_backend_base()}/api/machines"
    data = json.dumps(api_data).encode("utf-8")
    req = urllib.request.Request(
        url_post,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            text = resp.read().decode("utf-8", errors="replace")
            ok = 200 <= resp.status < 300
            return ok, resp.status, text[:2000], "POST"
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace") if e.fp else ""
        if e.code == 400 and _response_is_duplicate_machine_id(raw):
            put_payload = {
                "clientName": api_data["clientName"],
                "location": api_data["location"],
                "vehiclePlateNo": api_data["vehiclePlateNo"],
                "password": api_data["password"],
            }
            url_put = f"{get_backend_base()}/api/machines/machine/{quote(str(mid), safe='')}"
            req_put = urllib.request.Request(
                url_put,
                data=json.dumps(put_payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="PUT",
            )
            try:
                with urllib.request.urlopen(req_put, timeout=timeout) as resp2:
                    text2 = resp2.read().decode("utf-8", errors="replace")
                    ok2 = 200 <= resp2.status < 300
                    return ok2, resp2.status, text2[:2000], "PUT"
            except urllib.error.HTTPError as e2:
                raw2 = e2.read().decode("utf-8", errors="replace") if e2.fp else ""
                return False, e2.code, raw2[:2000], "error"
            except urllib.error.URLError as e2:
                return False, None, str(e2.reason), "error"
        return False, e.code, raw[:2000], "error"
    except urllib.error.URLError as e:
        return False, None, str(e.reason), "error"
