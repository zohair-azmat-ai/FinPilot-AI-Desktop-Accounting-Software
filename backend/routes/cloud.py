from fastapi import APIRouter
from pydantic import BaseModel
import sqlite3, json, urllib.request, urllib.parse
import sync_engine
from database import DB_PATH

router = APIRouter(prefix="/api/cloud", tags=["cloud"])


class ConnectRequest(BaseModel):
    url: str
    anon_key: str
    workspace_id: str


@router.get("/status")
def status():
    return sync_engine.get_status()


@router.post("/connect")
def connect(body: ConnectRequest):
    return sync_engine.connect(body.url.strip(), body.anon_key.strip(), body.workspace_id.strip())


@router.post("/disconnect")
def disconnect():
    return sync_engine.disconnect()


@router.post("/sync/now")
def sync_now():
    return sync_engine.sync_now()


@router.post("/restore")
def restore():
    return sync_engine.restore_from_cloud(DB_PATH)


@router.get("/restore-from-supabase")
def restore_from_supabase():
    """Non-destructive UPSERT restore from Supabase. Never deletes local data."""
    return sync_engine.restore_from_cloud(DB_PATH)


@router.get("/sync/log")
def sync_log():
    """Return the per-table pull log from the last sync run."""
    status = sync_engine.get_status()
    return {"pull_log": status.get("last_pull_log") or {}}


@router.get("/schema")
def schema():
    return {"sql": sync_engine.get_schema_sql(DB_PATH)}


@router.get("/debug/invoice-sync/{invoice_ref}")
def debug_invoice_sync(invoice_ref: str):
    """Diagnose why a mobile-created invoice may not appear on desktop.
    Pass the invoice_number (e.g. 8864) or any string to search by invoice_number.
    """
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row

    # ── Local SQLite (bypass _active filter to see deleted rows too) ───────────
    cur = con.cursor()
    cur.execute(
        "SELECT id, invoice_number, sync_uuid, deleted_at, updated_at, customer_id "
        "FROM invoices WHERE invoice_number = ? OR invoice_number = ?",
        (invoice_ref, f"{invoice_ref}-M"),
    )
    local_rows = [dict(r) for r in cur.fetchall()]

    cur.execute(
        "SELECT COUNT(*) FROM invoice_items WHERE invoice_id IN "
        "(SELECT id FROM invoices WHERE invoice_number = ? OR invoice_number = ?)",
        (invoice_ref, f"{invoice_ref}-M"),
    )
    local_items_count = cur.fetchone()[0]

    # Orphaned items (unmapped Supabase IDs)
    cur.execute("SELECT COUNT(*) FROM invoice_items WHERE invoice_id > 1000000")
    orphaned_items = cur.fetchone()[0]

    # Customer check
    customer_info = None
    for row in local_rows:
        if row.get("customer_id"):
            cur.execute("SELECT id, name, deleted_at FROM customers WHERE id = ?", (row["customer_id"],))
            c = cur.fetchone()
            customer_info = dict(c) if c else None
            break

    con.close()

    # ── Supabase (live query) ─────────────────────────────────────────────────
    creds = sync_engine._read_creds()
    cloud_rows: list = []
    cloud_items_count = 0
    cloud_error = None

    if creds:
        try:
            h = {"apikey": creds["anon_key"], "Accept": "application/json"}
            if creds["anon_key"].startswith("eyJ"):
                h["Authorization"] = f"Bearer {creds['anon_key']}"
            base = creds["url"].rstrip("/")
            ws = creds["workspace_id"]

            def _sb_get(path: str, params: dict) -> list:
                qs = urllib.parse.urlencode(params)
                req = urllib.request.Request(f"{base}/rest/v1/{path}?{qs}", headers=h)
                with urllib.request.urlopen(req, timeout=10) as resp:
                    return json.loads(resp.read())

            cloud_rows = _sb_get("invoices", {"workspace_id": f"eq.{ws}", "invoice_number": f"eq.{invoice_ref}"})
            for ci in cloud_rows:
                items = _sb_get("invoice_items", {"workspace_id": f"eq.{ws}", "invoice_id": f"eq.{ci['id']}"})
                cloud_items_count += len(items)
        except Exception as e:
            cloud_error = str(e)[:300]

    status = sync_engine.get_status()
    return {
        "invoice_ref": invoice_ref,
        "local": {
            "rows_found": len(local_rows),
            "rows": local_rows,
            "items_count": local_items_count,
            "customer": customer_info,
            "orphaned_items_in_db": orphaned_items,
        },
        "cloud": {
            "rows_found": len(cloud_rows),
            "rows": [
                {
                    "id": r.get("id"), "invoice_number": r.get("invoice_number"),
                    "sync_uuid": r.get("sync_uuid"), "deleted_at": r.get("deleted_at"),
                    "updated_at": r.get("updated_at"), "customer_id": r.get("customer_id"),
                }
                for r in cloud_rows
            ],
            "items_count": cloud_items_count,
            "error": cloud_error,
        },
        "sync_status": {
            "state": status.get("state"),
            "last_sync": status.get("last_sync"),
            "last_error": status.get("error"),
            "invoices_pull_log": (status.get("last_pull_log") or {}).get("invoices"),
            "invoice_items_pull_log": (status.get("last_pull_log") or {}).get("invoice_items"),
        },
    }
