"""
Cloud Sync Engine — local-first, push-only background sync to Supabase.
Credentials stored XOR-encrypted at %APPDATA%\\FinPilot AI\\sync.dat
"""

import os, json, base64, threading, time, sqlite3, uuid, logging
from datetime import datetime, timezone

log = logging.getLogger("sync_engine")

_SECRET = b"FinPilotAI-UAE-2026-SecretKey-Zentro"
_DAT = os.path.join(os.environ.get("APPDATA", ""), "FinPilot AI", "sync.dat")

# Parent tables listed before child tables — order matters for restore
SYNC_TABLES = [
    "companies", "bank_accounts", "customers", "suppliers", "items",
    "quotations", "quotation_items",
    "invoices", "invoice_items",
    "payments", "payment_allocations", "ledger_entries",
    "bank_transactions", "cheques",
    "delivery_notes", "delivery_note_items",
    "purchase_orders", "purchase_order_items",
    "supplier_bills", "supplier_bill_items",
    "supplier_payments", "supplier_payment_allocations",
    "expenses",
]

_status: dict = {
    "state": "offline",
    "last_sync": None,
    "error": None,
    "connected": False,
    "workspace_id": None,
}
_engine_ref: "SyncEngine | None" = None


# ── XOR credential storage ────────────────────────────────────────────────────

def _xor(data: bytes) -> bytes:
    key = _SECRET
    return bytes(b ^ key[i % len(key)] for i, b in enumerate(data))


def _write_creds(payload: dict) -> None:
    os.makedirs(os.path.dirname(_DAT), exist_ok=True)
    with open(_DAT, "wb") as f:
        f.write(base64.b64encode(_xor(json.dumps(payload).encode())))


def _read_creds() -> dict | None:
    if not os.path.exists(_DAT):
        return None
    try:
        with open(_DAT, "rb") as f:
            return json.loads(_xor(base64.b64decode(f.read())).decode())
    except Exception:
        return None


def _clear_creds() -> None:
    try:
        if os.path.exists(_DAT):
            os.remove(_DAT)
    except Exception:
        pass


# ── Supabase REST client ──────────────────────────────────────────────────────

class SupabaseClient:
    def __init__(self, url: str, anon_key: str, workspace_id: str):
        import requests
        self.url = url.rstrip("/")
        self.anon_key = anon_key
        self.workspace_id = workspace_id
        self._s = requests.Session()
        self._s.headers.update({
            "apikey": anon_key,
            "Content-Type": "application/json",
        })
        # Old JWT anon keys (eyJ...) are valid Bearer tokens.
        # New publishable keys (sb_publishable_...) work ONLY as apikey header —
        # PostgREST rejects them as Bearer tokens because they aren't JWTs.
        if anon_key.startswith("eyJ"):
            self._s.headers["Authorization"] = f"Bearer {anon_key}"

    def test_connection(self) -> None:
        """Raises on auth failure. 404 is acceptable — table may not exist in schema yet."""
        # Test against an actual table endpoint, not /rest/v1/ root.
        # Root endpoint may 401 for new publishable keys even when credentials are valid.
        r = self._s.get(
            f"{self.url}/rest/v1/companies",
            params={"select": "sync_uuid", "limit": "1"},
            timeout=10,
        )
        if r.status_code == 401:
            raise ConnectionError(
                "Authentication failed — check your Supabase URL and API key."
            )
        if r.status_code not in (200, 206, 404, 400):
            raise ConnectionError(
                f"Cannot reach Supabase ({r.status_code}): {r.text[:200]}"
            )

    def upsert(self, table: str, rows: list[dict]) -> None:
        if not rows:
            return
        for i in range(0, len(rows), 200):
            r = self._s.post(
                f"{self.url}/rest/v1/{table}",
                json=rows[i:i + 200],
                headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
                timeout=30,
            )
            if r.status_code not in (200, 201, 204):
                raise IOError(f"Supabase upsert [{table}] HTTP {r.status_code}: {r.text[:300]}")

    def fetch_all(self, table: str) -> list[dict]:
        results, offset, limit = [], 0, 500
        while True:
            r = self._s.get(
                f"{self.url}/rest/v1/{table}",
                params={"workspace_id": f"eq.{self.workspace_id}", "limit": limit, "offset": offset},
                timeout=30,
            )
            if r.status_code not in (200, 206):
                raise IOError(f"Supabase fetch [{table}] HTTP {r.status_code}: {r.text[:300]}")
            batch = r.json()
            results.extend(batch)
            if len(batch) < limit:
                break
            offset += limit
        return results


# ── Sync engine (background daemon thread) ───────────────────────────────────

class SyncEngine(threading.Thread):
    INTERVAL = 120  # push every 2 minutes

    def __init__(self, db_path: str):
        super().__init__(daemon=True, name="FinPilotSync")
        self.db_path = db_path

    def run(self) -> None:
        time.sleep(15)  # let app fully start first
        while True:
            self._tick()
            time.sleep(self.INTERVAL)

    def _tick(self) -> None:
        creds = _read_creds()
        if not creds:
            _status["state"] = "offline"
            _status["connected"] = False
            return
        _status["connected"] = True
        _status["workspace_id"] = creds.get("workspace_id")
        try:
            client = SupabaseClient(creds["url"], creds["anon_key"], creds["workspace_id"])
            _status["state"] = "syncing"
            # Pull first so mobile deletes are reflected before we push back
            con = sqlite3.connect(self.db_path)
            con.row_factory = sqlite3.Row
            try:
                self._pull_mobile_rows(con, client)
            finally:
                con.close()
            self._push_all(client)
            _status.update(state="synced", last_sync=datetime.now(timezone.utc).isoformat(), error=None)
        except Exception as e:
            _status.update(state="error", error=str(e)[:300])
            log.warning("Sync tick error: %s", e)

    def _push_all(self, client: SupabaseClient) -> None:
        con = sqlite3.connect(self.db_path)
        con.row_factory = sqlite3.Row
        try:
            for table in SYNC_TABLES:
                self._push_table(con, client, table)
        finally:
            con.close()

    def _push_table(self, con: sqlite3.Connection, client: SupabaseClient, table: str) -> None:
        cur = con.cursor()
        cur.execute(f"PRAGMA table_info({table})")
        cols = {r["name"] for r in cur.fetchall()}
        if "sync_uuid" not in cols:
            return

        # Assign UUIDs to any new rows that don't have one yet
        cur.execute(f"SELECT id FROM {table} WHERE sync_uuid IS NULL LIMIT 1000")
        null_ids = [r[0] for r in cur.fetchall()]
        for row_id in null_ids:
            con.execute(
                f"UPDATE {table} SET sync_uuid = ?, updated_at = ? WHERE id = ?",
                (str(uuid.uuid4()), datetime.utcnow().isoformat(), row_id),
            )
        if null_ids:
            con.commit()

        cur.execute(f"SELECT * FROM {table}")
        rows = [dict(r) for r in cur.fetchall()]
        if not rows:
            return

        for row in rows:
            row["workspace_id"] = client.workspace_id

        client.upsert(table, rows)

    def _pull_mobile_rows(self, con: sqlite3.Connection, client: "SupabaseClient") -> None:
        """Merge Supabase → local SQLite: insert mobile-created, update mobile-edited,
        delete mobile-deleted rows.  Must run BEFORE _push_all so deleted rows are not
        re-pushed.  Only touches rows that already have a sync_uuid (i.e. were synced
        at least once); new local rows (sync_uuid IS NULL) are left to the push step.
        Guard: skips deletions for a table if Supabase returned 0 rows — this prevents
        a network failure from wiping local data.
        """
        for table in SYNC_TABLES:
            try:
                cur = con.cursor()
                cur.execute(f"PRAGMA table_info({table})")
                col_infos = cur.fetchall()
                if not col_infos:
                    continue
                local_cols = {r[1] for r in col_infos}
                if "sync_uuid" not in local_cols:
                    continue

                # Local rows already synced at least once
                cur.execute(
                    f"SELECT id, sync_uuid, updated_at FROM {table} WHERE sync_uuid IS NOT NULL"
                )
                local_synced = {
                    r[1]: {"id": r[0], "updated_at": r[2] or ""}
                    for r in cur.fetchall()
                }

                # Fetch this workspace's rows from Supabase
                try:
                    cloud_rows = client.fetch_all(table)
                except Exception as e:
                    log.warning("Pull fetch [%s]: %s", table, e)
                    continue

                cloud_by_uuid = {
                    r["sync_uuid"]: r for r in cloud_rows if r.get("sync_uuid")
                }

                # Deletion diff — only run when Supabase has rows (non-empty guard)
                if cloud_by_uuid:
                    for sync_uuid, local in list(local_synced.items()):
                        if sync_uuid not in cloud_by_uuid:
                            con.execute(
                                f"DELETE FROM {table} WHERE id = ?", (local["id"],)
                            )
                            log.debug("Pull del [%s] uuid=%s", table, sync_uuid)

                # Insert new / update stale rows from cloud
                for sync_uuid, cloud_row in cloud_by_uuid.items():
                    filtered = {
                        k: v for k, v in cloud_row.items()
                        if k in local_cols and k != "workspace_id"
                    }
                    if not filtered:
                        continue
                    if sync_uuid not in local_synced:
                        cols = list(filtered.keys())
                        try:
                            con.execute(
                                f"INSERT OR IGNORE INTO {table} ({','.join(cols)}) "
                                f"VALUES ({','.join('?' * len(cols))})",
                                [filtered[c] for c in cols],
                            )
                        except Exception as e:
                            log.warning("Pull ins [%s]: %s", table, e)
                    else:
                        cloud_ts = cloud_row.get("updated_at") or ""
                        local_ts = local_synced[sync_uuid]["updated_at"]
                        if cloud_ts > local_ts:
                            sets = {k: v for k, v in filtered.items() if k != "id"}
                            if sets:
                                set_clause = ", ".join(f"{k}=?" for k in sets)
                                try:
                                    con.execute(
                                        f"UPDATE {table} SET {set_clause} WHERE id=?",
                                        list(sets.values()) + [local_synced[sync_uuid]["id"]],
                                    )
                                except Exception as e:
                                    log.warning("Pull upd [%s]: %s", table, e)
            except Exception as e:
                log.warning("Pull [%s]: %s", table, e)
                continue
        con.commit()

    def push_now(self) -> dict:
        creds = _read_creds()
        if not creds:
            return {"ok": False, "error": "Not connected to cloud."}
        try:
            client = SupabaseClient(creds["url"], creds["anon_key"], creds["workspace_id"])
            _status["state"] = "syncing"
            con = sqlite3.connect(self.db_path)
            con.row_factory = sqlite3.Row
            try:
                self._pull_mobile_rows(con, client)
            finally:
                con.close()
            self._push_all(client)
            _status.update(state="synced", last_sync=datetime.now(timezone.utc).isoformat(), error=None)
            return {"ok": True}
        except Exception as e:
            _status.update(state="error", error=str(e)[:300])
            return {"ok": False, "error": str(e)[:300]}

    def restore_from_cloud(self) -> dict:
        import shutil
        creds = _read_creds()
        if not creds:
            return {"ok": False, "error": "Not connected to cloud."}

        ts = datetime.now().strftime("%Y%m%d%H%M%S")
        bak = self.db_path + f".cloud_bak_{ts}"
        shutil.copy2(self.db_path, bak)

        try:
            client = SupabaseClient(creds["url"], creds["anon_key"], creds["workspace_id"])
            con = sqlite3.connect(self.db_path)
            try:
                con.execute("PRAGMA foreign_keys = OFF")
                con.commit()
                for table in reversed(SYNC_TABLES):
                    self._clear_table(con, table)
                con.commit()
                for table in SYNC_TABLES:
                    self._restore_table(con, client, table)
                con.commit()
                con.execute("PRAGMA foreign_keys = ON")
                con.commit()
            finally:
                con.close()
            return {"ok": True, "backup_path": bak}
        except Exception as e:
            import shutil as _s
            _s.copy2(bak, self.db_path)
            return {"ok": False, "error": str(e)[:300]}

    def _clear_table(self, con: sqlite3.Connection, table: str) -> None:
        cur = con.cursor()
        cur.execute(f"PRAGMA table_info({table})")
        if cur.fetchall():
            con.execute(f"DELETE FROM {table}")

    def _restore_table(self, con: sqlite3.Connection, client: SupabaseClient, table: str) -> None:
        cur = con.cursor()
        cur.execute(f"PRAGMA table_info({table})")
        local_cols = {r[1] for r in cur.fetchall()}
        if "sync_uuid" not in local_cols:
            return
        remote_rows = client.fetch_all(table)
        for row in remote_rows:
            row.pop("workspace_id", None)
            filtered = {k: v for k, v in row.items() if k in local_cols}
            if not filtered:
                continue
            col_names = ",".join(filtered.keys())
            placeholders = ",".join("?" * len(filtered))
            try:
                con.execute(
                    f"INSERT OR IGNORE INTO {table} ({col_names}) VALUES ({placeholders})",
                    list(filtered.values()),
                )
            except Exception:
                pass


# ── Schema SQL generator ──────────────────────────────────────────────────────

def get_schema_sql(db_path: str) -> str:
    con = sqlite3.connect(db_path)
    cur = con.cursor()
    parts = [
        "-- FinPilot AI — Supabase Cloud Sync Schema",
        "-- Paste this into your Supabase project → SQL Editor → Run",
        "",
    ]
    type_map = {
        "INTEGER": "BIGINT", "REAL": "DOUBLE PRECISION", "FLOAT": "DOUBLE PRECISION",
        "DOUBLE": "DOUBLE PRECISION", "TEXT": "TEXT", "BOOLEAN": "BOOLEAN",
        "BLOB": "TEXT", "NUMERIC": "DOUBLE PRECISION",
    }
    for table in SYNC_TABLES:
        cur.execute(f"PRAGMA table_info({table})")
        col_infos = cur.fetchall()
        if not col_infos:
            continue
        col_defs = ["sync_uuid TEXT PRIMARY KEY", "workspace_id TEXT NOT NULL DEFAULT ''"]
        for ci in col_infos:
            name, raw_type = ci[1], ci[2].upper()
            if name in ("sync_uuid", "workspace_id"):
                continue
            pg_type = "TEXT"
            for k, v in type_map.items():
                if k in raw_type:
                    pg_type = v
                    break
            col_defs.append(f"  {name} {pg_type}")
        parts += [
            f"CREATE TABLE IF NOT EXISTS {table} (",
            f"  {col_defs[0]},",
            f"  {col_defs[1]}" + ("," if len(col_defs) > 2 else ""),
        ]
        for idx, cd in enumerate(col_defs[2:], 2):
            comma = "," if idx < len(col_defs) - 1 else ""
            parts.append(f"{cd}{comma}")
        parts += [");", f"CREATE INDEX IF NOT EXISTS idx_{table}_ws ON {table}(workspace_id);", ""]
    con.close()
    return "\n".join(parts)


# ── Public API ────────────────────────────────────────────────────────────────

def get_status() -> dict:
    return dict(_status)


def connect(url: str, anon_key: str, workspace_id: str) -> dict:
    try:
        SupabaseClient(url, anon_key, workspace_id).test_connection()
    except Exception as e:
        return {"ok": False, "error": str(e)}
    _write_creds({"url": url, "anon_key": anon_key, "workspace_id": workspace_id})
    _status.update(connected=True, workspace_id=workspace_id, state="synced", error=None)
    if _engine_ref:
        threading.Thread(target=_engine_ref.push_now, daemon=True).start()
    return {"ok": True}


def disconnect() -> dict:
    _clear_creds()
    _status.update(state="offline", connected=False, workspace_id=None, last_sync=None, error=None)
    return {"ok": True}


def sync_now() -> dict:
    if not _engine_ref:
        return {"ok": False, "error": "Sync engine not running."}
    return _engine_ref.push_now()


def restore_from_cloud(db_path: str) -> dict:
    if not _engine_ref:
        return {"ok": False, "error": "Sync engine not running."}
    return _engine_ref.restore_from_cloud()


def start(db_path: str) -> None:
    global _engine_ref
    if _engine_ref and _engine_ref.is_alive():
        return
    _engine_ref = SyncEngine(db_path)
    _engine_ref.start()
    creds = _read_creds()
    if creds:
        _status.update(connected=True, workspace_id=creds.get("workspace_id"))
    else:
        _status.update(state="offline", connected=False)
