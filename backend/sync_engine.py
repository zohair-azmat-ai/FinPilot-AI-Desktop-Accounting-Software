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

# FK column → parent table for each child table.
# Used during pull to remap Supabase parent ids to local SQLite ids.
_FK_REMAP: dict = {
    "quotation_items":              [("quotation_id",    "quotations")],
    "invoice_items":                [("invoice_id",      "invoices")],
    "payment_allocations":          [("payment_id",      "payments"),
                                     ("invoice_id",      "invoices")],
    "ledger_entries":               [("customer_id",     "customers"),
                                     ("supplier_id",     "suppliers"),
                                     ("invoice_id",      "invoices"),
                                     ("payment_id",      "payments")],
    "bank_transactions":            [("bank_account_id", "bank_accounts"),
                                     ("customer_id",     "customers"),
                                     ("supplier_id",     "suppliers"),
                                     ("invoice_id",      "invoices"),
                                     ("cheque_id",       "cheques")],
    "cheques":                      [("bank_account_id", "bank_accounts"),
                                     ("customer_id",     "customers"),
                                     ("supplier_id",     "suppliers")],
    "delivery_note_items":          [("dn_id",           "delivery_notes")],
    "purchase_order_items":         [("po_id",           "purchase_orders")],
    "supplier_bill_items":          [("bill_id",         "supplier_bills")],
    "supplier_payment_allocations": [("payment_id",      "supplier_payments"),
                                     ("bill_id",         "supplier_bills")],
    "expenses":                     [("bank_account_id", "bank_accounts"),
                                     ("supplier_id",     "suppliers")],
    "payments":                     [("customer_id",     "customers"),
                                     ("supplier_id",     "suppliers"),
                                     ("bank_account_id", "bank_accounts"),
                                     ("invoice_id",      "invoices")],
    "supplier_bills":               [("supplier_id",     "suppliers")],
    "supplier_payments":            [("supplier_id",     "suppliers")],
    "invoices":                     [("customer_id",     "customers"),
                                     ("quotation_id",    "quotations")],
    "quotations":                   [("customer_id",     "customers")],
    "delivery_notes":               [("customer_id",     "customers")],
    "purchase_orders":              [("supplier_id",     "suppliers")],
}

_status: dict = {
    "state": "offline",
    "last_sync": None,
    "last_pull_log": None,
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
            con = sqlite3.connect(self.db_path)
            con.row_factory = sqlite3.Row
            try:
                pull_log = self._pull_mobile_rows(con, client)
            finally:
                con.close()
            self._push_all(client)
            _status.update(
                state="synced",
                last_sync=datetime.now(timezone.utc).isoformat(),
                last_pull_log=pull_log,
                error=None,
            )
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

    def _pull_mobile_rows(self, con: sqlite3.Connection, client: "SupabaseClient") -> dict:
        """Merge Supabase → local SQLite.

        Key behaviours:
        - Strips 'id' from new rows and lets SQLite auto-assign to avoid PK conflicts
          when Supabase id (possibly a large timestamp from mobile) collides with a
          desktop-created row's id.
        - Builds id_map {table: {supabase_id: local_id}} as parent tables are processed
          so child-table FK columns are remapped to correct local ids before insert.
        - Returns a per-table sync log {table: {pulled,inserted,updated,deleted,errors}}.
        """
        id_map: dict = {}      # {table: {supabase_id: local_id}}
        sync_log: dict = {}

        for table in SYNC_TABLES:
            pulled = inserted = updated = deleted = errors = 0
            id_map.setdefault(table, {})
            try:
                cur = con.cursor()
                cur.execute(f"PRAGMA table_info({table})")
                col_infos = cur.fetchall()
                if not col_infos:
                    continue
                local_cols = {r[1] for r in col_infos}
                if "sync_uuid" not in local_cols:
                    continue

                # Build col_defaults map: for non-nullable TEXT/BOOLEAN/NUMERIC columns,
                # store their default so we can coerce None from Supabase to a safe value.
                col_defaults: dict = {}
                for ci in col_infos:
                    col_name = ci[1]
                    col_type = (ci[2] or "").upper()
                    notnull = ci[3]
                    dflt = ci[4]
                    if notnull and dflt is None:
                        if "TEXT" in col_type or "CHAR" in col_type or "CLOB" in col_type:
                            col_defaults[col_name] = ""
                        elif "BOOL" in col_type:
                            col_defaults[col_name] = 0
                        elif any(t in col_type for t in ("INT", "REAL", "FLOA", "DOUB", "NUMER")):
                            col_defaults[col_name] = 0

                # Local rows that have been synced at least once
                cur.execute(
                    f"SELECT id, sync_uuid, updated_at FROM {table} WHERE sync_uuid IS NOT NULL"
                )
                local_synced = {
                    r[1]: {"id": r[0], "updated_at": r[2] or ""}
                    for r in cur.fetchall()
                }

                # Fetch from Supabase
                try:
                    cloud_rows = client.fetch_all(table)
                    pulled = len(cloud_rows)
                except Exception as e:
                    log.warning("Pull fetch [%s]: %s", table, e)
                    sync_log[table] = {"pulled": 0, "inserted": 0, "updated": 0, "deleted": 0, "errors": 1}
                    continue

                cloud_by_uuid = {
                    r["sync_uuid"]: r for r in cloud_rows if r.get("sync_uuid")
                }

                # Pre-populate id_map for rows already in local (desktop-origin).
                # Their Supabase 'id' was pushed from desktop so it equals local 'id'.
                for sync_uuid, cloud_row in cloud_by_uuid.items():
                    if sync_uuid in local_synced:
                        sb_id = cloud_row.get("id")
                        local_id = local_synced[sync_uuid]["id"]
                        if sb_id is not None:
                            id_map[table][sb_id] = local_id

                # NOTE: No deletion — pull is UPSERT-only.
                # Local rows that are absent from Supabase were either created
                # on desktop and not yet pushed, or belong to a different workspace.
                # Deletion is intentionally skipped to prevent data loss.

                fk_remaps = _FK_REMAP.get(table, [])

                for sync_uuid, cloud_row in cloud_by_uuid.items():
                    filtered = {
                        k: v for k, v in cloud_row.items()
                        if k in local_cols and k != "workspace_id"
                    }
                    if not filtered:
                        continue

                    sb_id = cloud_row.get("id")

                    # Remap FK columns so child rows link to local parent ids, not Supabase ids
                    for fk_col, parent_table in fk_remaps:
                        if fk_col in filtered and filtered[fk_col] is not None:
                            sb_parent_id = filtered[fk_col]
                            local_parent_id = id_map.get(parent_table, {}).get(sb_parent_id)
                            if local_parent_id is not None and local_parent_id != sb_parent_id:
                                filtered[fk_col] = local_parent_id

                    if sync_uuid not in local_synced:
                        # New row from cloud — strip 'id' to avoid PK conflicts;
                        # SQLite auto-assigns a safe local id via rowid.
                        # Also coerce None to column defaults for non-nullable columns so
                        # mobile-created rows (with missing optional fields) don't break
                        # Pydantic serialisation on the desktop.
                        new_row = {
                            k: (col_defaults[k] if v is None and k in col_defaults else v)
                            for k, v in filtered.items() if k != "id"
                        }
                        cols = list(new_row.keys())
                        if not cols:
                            continue
                        try:
                            cur2 = con.cursor()
                            cur2.execute(
                                f"INSERT OR IGNORE INTO {table} ({','.join(cols)}) "
                                f"VALUES ({','.join('?' * len(cols))})",
                                [new_row[c] for c in cols],
                            )
                            if cur2.rowcount > 0:
                                local_id = cur2.lastrowid
                                if sb_id is not None:
                                    id_map[table][sb_id] = local_id
                                inserted += 1
                                log.info("Pull ins [%s] sb=%s → local=%s num=%s",
                                         table, sb_id, local_id,
                                         filtered.get("invoice_number") or
                                         filtered.get("quotation_number") or
                                         filtered.get("dn_number") or
                                         filtered.get("po_number") or "")
                            else:
                                # IGNORE triggered (unique constraint on doc number?)
                                # Try to find it and still track the id
                                existing = con.execute(
                                    f"SELECT id FROM {table} WHERE sync_uuid = ?", (sync_uuid,)
                                ).fetchone()
                                if existing:
                                    local_id = existing[0]
                                    if sb_id is not None:
                                        id_map[table][sb_id] = local_id
                                log.warning("Pull ins [%s] IGNORED sync_uuid=%s (unique constraint?)", table, sync_uuid)
                                errors += 1
                        except Exception as e:
                            log.warning("Pull ins [%s] sync_uuid=%s: %s", table, sync_uuid, e)
                            errors += 1
                    else:
                        # Existing row — update if cloud version is newer
                        local_id = local_synced[sync_uuid]["id"]
                        if sb_id is not None:
                            id_map[table][sb_id] = local_id
                        cloud_ts = cloud_row.get("updated_at") or ""
                        local_ts = local_synced[sync_uuid]["updated_at"]
                        if cloud_ts > local_ts:
                            sets = {k: v for k, v in filtered.items() if k != "id"}
                            if sets:
                                set_clause = ", ".join(f"{k}=?" for k in sets)
                                try:
                                    con.execute(
                                        f"UPDATE {table} SET {set_clause} WHERE id=?",
                                        list(sets.values()) + [local_id],
                                    )
                                    updated += 1
                                except Exception as e:
                                    log.warning("Pull upd [%s] id=%s: %s", table, local_id, e)
                                    errors += 1

            except Exception as e:
                log.warning("Pull [%s] fatal: %s", table, e)
                errors += 1
            finally:
                sync_log[table] = {
                    "pulled": pulled, "inserted": inserted,
                    "updated": updated, "deleted": deleted, "errors": errors,
                }

        con.commit()
        # Log summary for non-zero tables
        for tbl, s in sync_log.items():
            if any(v > 0 for v in s.values()):
                log.info("Sync pull [%s]: %s", tbl, s)
        return sync_log

    def _backup_db(self) -> str:
        import shutil
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        bak = self.db_path + f".backup_{ts}"
        shutil.copy2(self.db_path, bak)
        log.info("DB backup created: %s", bak)
        return bak

    def push_now(self) -> dict:
        creds = _read_creds()
        if not creds:
            return {"ok": False, "error": "Not connected to cloud."}
        try:
            bak = self._backup_db()
            client = SupabaseClient(creds["url"], creds["anon_key"], creds["workspace_id"])
            _status["state"] = "syncing"
            con = sqlite3.connect(self.db_path)
            con.row_factory = sqlite3.Row
            try:
                pull_log = self._pull_mobile_rows(con, client)
            finally:
                con.close()
            self._push_all(client)
            _status.update(
                state="synced",
                last_sync=datetime.now(timezone.utc).isoformat(),
                last_pull_log=pull_log,
                error=None,
            )
            return {"ok": True, "backup_path": bak, "pull_log": pull_log}
        except Exception as e:
            _status.update(state="error", error=str(e)[:300])
            return {"ok": False, "error": str(e)[:300]}

    def restore_from_cloud(self) -> dict:
        """Non-destructive UPSERT restore: inserts missing rows, updates stale rows,
        never deletes local data. Safe to run at any time."""
        creds = _read_creds()
        if not creds:
            return {"ok": False, "error": "Not connected to cloud."}

        bak = self._backup_db()

        try:
            client = SupabaseClient(creds["url"], creds["anon_key"], creds["workspace_id"])
            con = sqlite3.connect(self.db_path)
            con.row_factory = sqlite3.Row
            try:
                pull_log = self._pull_mobile_rows(con, client)
            finally:
                con.close()
            return {"ok": True, "backup_path": bak, "pull_log": pull_log}
        except Exception as e:
            return {"ok": False, "error": str(e)[:300]}


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
