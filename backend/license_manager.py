"""
License manager — hardware-locked, HMAC-signed keys, XOR-encrypted license.dat
Key format: FPAI-UAE-YYYY-XXXX-XXXX  (e.g. FPAI-UAE-2026-A1B2-C3D4)
"""

import os, hashlib, hmac, base64, json, winreg, datetime

_SECRET = b"FinPilotAI-UAE-2026-SecretKey-Zentro"
_DAT    = os.path.join(os.environ.get("APPDATA", ""), "FinPilot AI", "license.dat")
_TRIAL_DAYS = 7


# ── Hardware fingerprint ──────────────────────────────────────────────────────

def get_hw_id() -> str:
    try:
        key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
                             r"SOFTWARE\Microsoft\Cryptography")
        guid, _ = winreg.QueryValueEx(key, "MachineGuid")
        winreg.CloseKey(key)
    except Exception:
        guid = os.environ.get("COMPUTERNAME", "UNKNOWN")
    return hashlib.sha256(guid.encode()).hexdigest()[:16].upper()


# ── Key generation (admin use) ────────────────────────────────────────────────

def generate_key(hw_id: str, year: int) -> str:
    payload = f"{hw_id}:{year}:FPAI".encode()
    sig = hmac.new(_SECRET, payload, hashlib.sha256).hexdigest()[:8].upper()
    return f"FPAI-UAE-{year}-{sig[:4]}-{sig[4:]}"


# ── Key validation ────────────────────────────────────────────────────────────

def validate_key(key: str, hw_id: str) -> bool:
    parts = key.strip().upper().split("-")
    if len(parts) != 5 or parts[0] != "FPAI" or parts[1] != "UAE":
        return False
    try:
        year = int(parts[2])
    except ValueError:
        return False
    if year < 2024 or year > 2040:
        return False
    expected = generate_key(hw_id, year)
    return hmac.compare_digest(key.strip().upper(), expected)


# ── License file (XOR + base64) ──────────────────────────────────────────────

def _xor(data: bytes) -> bytes:
    key = _SECRET
    return bytes(b ^ key[i % len(key)] for i, b in enumerate(data))


def _write_license(payload: dict) -> None:
    os.makedirs(os.path.dirname(_DAT), exist_ok=True)
    raw = json.dumps(payload).encode()
    with open(_DAT, "wb") as f:
        f.write(base64.b64encode(_xor(raw)))


def _read_license() -> dict | None:
    if not os.path.exists(_DAT):
        return None
    try:
        with open(_DAT, "rb") as f:
            raw = _xor(base64.b64decode(f.read()))
        return json.loads(raw.decode())
    except Exception:
        return None


# ── Trial management ──────────────────────────────────────────────────────────

def _today_str() -> str:
    return datetime.date.today().isoformat()


def _ensure_trial() -> dict:
    payload = _read_license()
    if payload is None:
        payload = {"type": "trial", "start": _today_str(), "key": "", "hw_id": ""}
        _write_license(payload)
    return payload


def _trial_days_left(start: str) -> int:
    try:
        d = datetime.date.fromisoformat(start)
        elapsed = (datetime.date.today() - d).days
        return max(0, _TRIAL_DAYS - elapsed)
    except Exception:
        return 0


# ── Public API ────────────────────────────────────────────────────────────────

def get_status() -> dict:
    """Return current license status. Always call this on startup."""
    payload = _ensure_trial()
    hw = get_hw_id()

    if payload.get("type") == "licensed":
        key = payload.get("key", "")
        if validate_key(key, hw):
            return {"status": "licensed", "key": key, "hw_id": hw, "days_left": None}
        # Key no longer matches this hardware
        return {"status": "invalid", "hw_id": hw, "days_left": 0}

    days = _trial_days_left(payload.get("start", _today_str()))
    if days > 0:
        return {"status": "trial", "hw_id": hw, "days_left": days}
    return {"status": "expired", "hw_id": hw, "days_left": 0}


def activate(key: str) -> dict:
    hw = get_hw_id()
    if not validate_key(key, hw):
        return {"success": False, "error": "Invalid license key for this machine."}
    _write_license({"type": "licensed", "key": key.strip().upper(), "hw_id": hw})
    return {"success": True}


def is_active() -> bool:
    s = get_status()
    return s["status"] in ("licensed", "trial")
