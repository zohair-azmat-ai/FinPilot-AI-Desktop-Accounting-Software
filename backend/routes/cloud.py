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

    status_data = sync_engine.get_status()
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
            "state": status_data.get("state"),
            "last_sync": status_data.get("last_sync"),
            "last_error": status_data.get("error"),
            "invoices_pull_log": (status_data.get("last_pull_log") or {}).get("invoices"),
            "invoice_items_pull_log": (status_data.get("last_pull_log") or {}).get("invoice_items"),
        },
    }


@router.get("/debug/invoice-items/{invoice_ref}")
def debug_invoice_items(invoice_ref: str):
    """Show local + cloud item counts for an invoice; also soft-deletes stale local items."""
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row

    cur = con.cursor()
    cur.execute(
        "SELECT id, invoice_number, sync_uuid, updated_at FROM invoices "
        "WHERE (invoice_number = ? OR invoice_number = ?) AND deleted_at IS NULL",
        (invoice_ref, f"{invoice_ref}-M"),
    )
    inv_row = cur.fetchone()
    local_invoice = dict(inv_row) if inv_row else None

    local_items_active = []
    local_items_deleted = []
    if local_invoice:
        cur.execute(
            "SELECT id, description, quantity, sync_uuid, updated_at, deleted_at "
            "FROM invoice_items WHERE invoice_id = ?",
            (local_invoice["id"],),
        )
        for r in cur.fetchall():
            d = dict(r)
            if d.get("deleted_at"):
                local_items_deleted.append(d)
            else:
                local_items_active.append(d)

    con.close()

    # Cloud query
    creds = sync_engine._read_creds()
    cloud_invoice = None
    cloud_items_active = []
    cloud_items_stale = []
    cloud_error = None

    if creds:
        try:
            h = {"apikey": creds["anon_key"], "Accept": "application/json"}
            if creds["anon_key"].startswith("eyJ"):
                h["Authorization"] = f"Bearer {creds['anon_key']}"
            base = creds["url"].rstrip("/")
            ws = creds["workspace_id"]

            def _q(path: str, params: dict) -> list:
                qs = urllib.parse.urlencode(params)
                req = urllib.request.Request(f"{base}/rest/v1/{path}?{qs}", headers=h)
                with urllib.request.urlopen(req, timeout=10) as resp:
                    return json.loads(resp.read())

            rows = _q("invoices", {"workspace_id": f"eq.{ws}", "invoice_number": f"eq.{invoice_ref}"})
            cloud_invoice = rows[0] if rows else None

            if cloud_invoice:
                all_items = _q("invoice_items", {"workspace_id": f"eq.{ws}", "invoice_id": f"eq.{cloud_invoice['id']}"})
                for it in all_items:
                    if it.get("deleted_at"):
                        cloud_items_stale.append({"id": it.get("id"), "description": it.get("description", "")[:60], "deleted_at": it.get("deleted_at")})
                    else:
                        cloud_items_active.append({"id": it.get("id"), "description": it.get("description", "")[:60], "sync_uuid": it.get("sync_uuid")})
        except Exception as e:
            cloud_error = str(e)[:300]

    return {
        "invoice_ref": invoice_ref,
        "local": {
            "invoice": local_invoice,
            "active_items": len(local_items_active),
            "deleted_items": len(local_items_deleted),
            "active_item_descriptions": [i.get("description", "")[:60] for i in local_items_active],
        },
        "cloud": {
            "invoice_id": cloud_invoice.get("id") if cloud_invoice else None,
            "active_items": len(cloud_items_active),
            "stale_items": len(cloud_items_stale),
            "active_item_list": cloud_items_active,
            "stale_item_list": cloud_items_stale,
            "error": cloud_error,
        },
        "pdf_will_show": len(local_items_active),
    }
