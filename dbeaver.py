"""
dbeaver.py — Lê/escreve credenciais e conexões do DBeaver.
Suporta macOS, Linux e Windows. Nunca loga senhas.
"""

import json
import base64
import platform
import sys
import uuid
from pathlib import Path

_DBEAVER_KEY = bytes([
    0x75, 0x73, 0x65, 0x72, 0x2e, 0x70, 0x61, 0x73,
    0x73, 0x77, 0x6f, 0x72, 0x64, 0x2e, 0x65, 0x6e,
    0x63, 0x72, 0x79, 0x70, 0x74, 0x69, 0x6f, 0x6e,
    0x2e, 0x6b, 0x65, 0x79,
])
_DBEAVER_IV = b'\x00' * 16


def _workspace_candidates():
    home = Path.home()
    system = platform.system()
    if system == "Darwin":
        return [
            home / "Library" / "DBeaverData" / "workspace6" / "General" / ".dbeaver",
            home / "Library" / "Application Support" / "DBeaverData" / "workspace6" / "General" / ".dbeaver",
            home / ".local" / "share" / "DBeaverData" / "workspace6" / "General" / ".dbeaver",
        ]
    elif system == "Linux":
        return [
            home / ".local" / "share" / "DBeaverData" / "workspace6" / "General" / ".dbeaver",
            home / "snap" / "dbeaver-ce" / "current" / ".local" / "share" / "DBeaverData" / "workspace6" / "General" / ".dbeaver",
        ]
    else:
        import os
        appdata = Path(os.environ.get("APPDATA", home / "AppData" / "Roaming"))
        return [
            appdata / "DBeaverData" / "workspace6" / "General" / ".dbeaver",
            home / "AppData" / "Roaming" / "DBeaverData" / "workspace6" / "General" / ".dbeaver",
        ]


def find_workspace():
    for p in _workspace_candidates():
        if p.exists():
            return p
    raise FileNotFoundError(
        "Workspace do DBeaver não encontrado.\nCaminhos verificados:\n"
        + "\n".join(f"  {p}" for p in _workspace_candidates())
    )


def _load_json(path):
    raw = path.read_text(encoding="utf-8")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return json.loads(base64.b64decode(raw).decode("utf-8"))


def _decrypt(enc_b64):
    from Crypto.Cipher import AES
    from Crypto.Util.Padding import unpad
    data = base64.b64decode(enc_b64)
    return unpad(AES.new(_DBEAVER_KEY, AES.MODE_CBC, _DBEAVER_IV).decrypt(data), 16).decode("utf-8")


def _encrypt(plaintext):
    from Crypto.Cipher import AES
    from Crypto.Util.Padding import pad
    return base64.b64encode(
        AES.new(_DBEAVER_KEY, AES.MODE_CBC, _DBEAVER_IV).encrypt(
            pad(plaintext.encode("utf-8"), 16)
        )
    ).decode("utf-8")


def _load_datasources(ws):
    p = ws / "data-sources.json"
    return _load_json(p).get("connections", {}) if p.exists() else {}


def _save_datasources(ws, connections):
    p = ws / "data-sources.json"
    existing = _load_json(p) if p.exists() else {}
    existing["connections"] = connections
    p.write_text(json.dumps(existing, indent=2), encoding="utf-8")


def _load_credentials(ws):
    p = ws / "credentials-config.json"
    if not p.exists():
        return {}
    raw = _load_json(p)
    result = {}
    for conn_id, data in raw.items():
        inner = data.get("#connection", {})
        user = inner.get("user", "")
        enc = inner.get("password", "")
        password = ""
        if enc:
            try:
                password = _decrypt(enc)
            except Exception:
                pass
        result[conn_id] = {"user": user, "password": password}
    return result


def _save_credentials(ws, conn_id, user, password):
    p = ws / "credentials-config.json"
    raw = _load_json(p) if p.exists() else {}
    raw[conn_id] = {"#connection": {"user": user, "password": _encrypt(password) if password else ""}}
    p.write_text(json.dumps(raw, indent=2), encoding="utf-8")


def _find_id(name_or_id, datasources):
    for cid, c in datasources.items():
        if cid == name_or_id or c.get("name") == name_or_id:
            return cid
    for cid, c in datasources.items():
        if name_or_id.lower() in c.get("name", "").lower():
            return cid
    return None


# ── API pública ──────────────────────────────────────────────────────────────


def list_connections_safe(workspace=None):
    """Lista conexões sem expor senhas. Seguro para exibir ao usuário."""
    ws = workspace or find_workspace()
    result = []
    for cid, c in _load_datasources(ws).items():
        cfg = c.get("configuration", {})
        result.append({
            "id": cid,
            "name": c.get("name", cid),
            "driver": c.get("driver", ""),
            "host": cfg.get("host", ""),
            "port": cfg.get("port", ""),
            "database": cfg.get("database", ""),
        })
    return sorted(result, key=lambda x: x["name"])


def get_connection_info(name_or_id, workspace=None):
    """Retorna metadados + credenciais. NUNCA logar o retorno."""
    ws = workspace or find_workspace()
    ds = _load_datasources(ws)
    creds = _load_credentials(ws)
    match_id = _find_id(name_or_id, ds)
    if not match_id:
        return None
    c = ds[match_id]
    cfg = c.get("configuration", {})
    cr = creds.get(match_id, {})
    return {
        "id": match_id,
        "name": c.get("name", match_id),
        "driver": c.get("driver", ""),
        "host": cfg.get("host", "localhost"),
        "port": int(cfg.get("port", 3306)),
        "database": cfg.get("database", ""),
        "user": cr.get("user") or cfg.get("user", ""),
        "password": cr.get("password", ""),
    }


def add_connection(name, host, port, database, user, password, driver="mysql8", workspace=None):
    """Adiciona nova conexão. Retorna o ID criado."""
    ws = workspace or find_workspace()
    ds = _load_datasources(ws)
    conn_id = f"mysql-{uuid.uuid4().hex[:8]}"
    ds[conn_id] = {
        "name": name,
        "driver": driver,
        "configuration": {"host": host, "port": str(port), "database": database, "user": user},
    }
    _save_datasources(ws, ds)
    _save_credentials(ws, conn_id, user, password)
    return conn_id


def edit_connection(name_or_id, host=None, port=None, database=None, user=None, password=None, workspace=None):
    """Edita campos de uma conexão. Retorna True se encontrou."""
    ws = workspace or find_workspace()
    ds = _load_datasources(ws)
    match_id = _find_id(name_or_id, ds)
    if not match_id:
        return False
    cfg = ds[match_id].setdefault("configuration", {})
    if host is not None:
        cfg["host"] = host
    if port is not None:
        cfg["port"] = str(port)
    if database is not None:
        cfg["database"] = database
    if user is not None:
        cfg["user"] = user
    _save_datasources(ws, ds)
    if user is not None or password is not None:
        creds = _load_credentials(ws)
        existing = creds.get(match_id, {})
        _save_credentials(ws, match_id, user or existing.get("user", ""), password or existing.get("password", ""))
    return True


def remove_connection(name_or_id, workspace=None):
    """Remove uma conexão. Retorna True se encontrou e removeu."""
    ws = workspace or find_workspace()
    ds = _load_datasources(ws)
    match_id = _find_id(name_or_id, ds)
    if not match_id:
        return False
    del ds[match_id]
    _save_datasources(ws, ds)
    p = ws / "credentials-config.json"
    if p.exists():
        raw = _load_json(p)
        raw.pop(match_id, None)
        p.write_text(json.dumps(raw, indent=2), encoding="utf-8")
    return True
