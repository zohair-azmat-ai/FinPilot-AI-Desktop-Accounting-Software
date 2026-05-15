from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import sqlite3, json, urllib.request, urllib.parse, os
import sync_engine
from database import DB_PATH

router = APIRouter(prefix="/api/cloud", tags=["cloud"])

_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND_DIR = os.path.dirname(_HERE)  # backend/routes/../ = backend/
_USER_ASSETS = os.path.join(os.path.expanduser("~"), "FinPilot", "assets")


class ConnectRequest(BaseModel):
    url: str
    anon_key: str
    workspace_id: str


class PushAssetsRequest(BaseModel):
    hf_url: str


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


@router.get("/debug/pdf-runtime")
def debug_pdf_runtime():
    """Return actual runtime paths used by the backend process — for diagnosing asset issues."""
    import sys
    import pdf_generator as pg

    here_routes  = _HERE          # routes/ dir
    backend_dir  = _BACKEND_DIR   # _internal/ or backend/
    user_assets  = _USER_ASSETS   # ~/FinPilot/assets/

    lh_path      = pg.LETTERHEAD_PATH
    stamp_bundle = os.path.join(backend_dir, "assets", "stamp.png")
    stamp_user   = os.path.join(user_assets, "stamp.png")
    stamp_found  = pg._get_stamp_path()

    log_path     = pg._DBG_LOG
    try:
        with open(log_path, encoding="utf-8") as _f:
            last_log = _f.readlines()[-20:]
    except Exception as _e:
        last_log = [f"log read error: {_e}"]

    return {
        "build": "FP_BLUE_V9",
        "python_exe": sys.executable,
        "cwd": os.getcwd(),
        "routes_here": here_routes,
        "backend_dir": backend_dir,
        "letterhead": {
            "path": lh_path,
            "exists": os.path.exists(lh_path),
        },
        "stamp": {
            "bundle_path": stamp_bundle,
            "bundle_exists": os.path.exists(stamp_bundle),
            "user_path": stamp_user,
            "user_exists": os.path.exists(stamp_user),
            "resolved_path": stamp_found,
        },
        "last_log_lines": last_log,
    }


@router.get("/debug/pdf-flags/{doc_type}/{doc_no}")
def debug_pdf_flags(doc_type: str, doc_no: str):
    """Return DB branding flags + resolved asset paths for an invoice or quotation.
    doc_type: 'invoice' or 'quotation'
    doc_no:   invoice_number (e.g. '8865') or quotation_number (e.g. 'QUO-2723')
    """
    import pdf_generator as pg
    from database import DB_PATH as _db_path

    con = sqlite3.connect(_db_path)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    doc_type = doc_type.lower()
    row = None
    if doc_type == "invoice":
        cur.execute(
            "SELECT id, invoice_number, letterhead, include_stamp FROM invoices "
            "WHERE invoice_number = ? OR id = ? LIMIT 1",
            (doc_no, doc_no if doc_no.isdigit() else -1),
        )
        row = cur.fetchone()
    elif doc_type == "quotation":
        cur.execute(
            "SELECT id, quotation_number, letterhead, include_stamp FROM quotations "
            "WHERE quotation_number = ? OR id = ? LIMIT 1",
            (doc_no, doc_no if doc_no.isdigit() else -1),
        )
        row = cur.fetchone()
    con.close()

    if not row:
        return {"error": f"{doc_type} '{doc_no}' not found in local DB"}

    raw = dict(row)
    # Apply the same defaulting logic as the PDF route
    resolved_letterhead = raw["letterhead"] if raw["letterhead"] is not None else True
    resolved_stamp = raw["include_stamp"] if raw["include_stamp"] is not None else False

    lh_path = pg.LETTERHEAD_PATH
    stamp_path = pg._get_stamp_path()

    return {
        "doc_type": doc_type,
        "doc_no": doc_no,
        "db_flags_raw": {
            "letterhead": raw["letterhead"],
            "include_stamp": raw["include_stamp"],
        },
        "resolved_flags": {
            "letterhead": resolved_letterhead,
            "include_stamp": resolved_stamp,
        },
        "assets": {
            "letterhead_path": lh_path,
            "letterhead_exists": os.path.exists(lh_path),
            "stamp_path": stamp_path,
            "stamp_exists": os.path.exists(stamp_path) if stamp_path else False,
        },
        "will_render": {
            "use_letterhead": resolved_letterhead and os.path.exists(lh_path),
            "use_stamp": resolved_stamp and bool(stamp_path) and os.path.exists(stamp_path or ""),
        },
    }


@router.post("/push-assets")
def push_assets(body: PushAssetsRequest):
    """Read local letterhead/stamp and POST them to the HF Space asset upload endpoint."""
    hf_url = body.hf_url.rstrip("/")
    if not hf_url:
        raise HTTPException(400, "hf_url is required")

    results = {}

    # Letterhead: user dir first (matches pdf_generator priority), then bundle assets
    lh_paths = [
        os.path.join(_USER_ASSETS, "letterhead.jpg"),
        os.path.join(_BACKEND_DIR, "assets", "letterhead.jpg"),
        os.path.join(_HERE, "..", "assets", "letterhead.jpg"),
    ]
    lh_path = next((p for p in lh_paths if os.path.exists(p)), None)
    if lh_path:
        try:
            with open(lh_path, "rb") as f:
                data = f.read()
            boundary = b"----FinPilotBoundary"
            body_parts = (
                b"--" + boundary + b"\r\n"
                b'Content-Disposition: form-data; name="asset_type"\r\n\r\nletterhead\r\n'
                b"--" + boundary + b"\r\n"
                b'Content-Disposition: form-data; name="file"; filename="letterhead.jpg"\r\n'
                b"Content-Type: image/jpeg\r\n\r\n" + data + b"\r\n"
                b"--" + boundary + b"--\r\n"
            )
            req = urllib.request.Request(
                f"{hf_url}/api/assets/upload",
                data=body_parts,
                headers={"Content-Type": f"multipart/form-data; boundary={boundary.decode()}"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as r:
                results["letterhead"] = {"ok": True, "size": len(data), "response": json.loads(r.read())}
        except Exception as e:
            results["letterhead"] = {"ok": False, "error": str(e)[:200]}
    else:
        results["letterhead"] = {"ok": False, "error": "letterhead.jpg not found in backend/assets/"}

    # Stamp: look in user FinPilot/assets/ first, then backend/assets/
    stamp_paths = [
        os.path.join(_USER_ASSETS, "stamp.png"),
        os.path.join(_BACKEND_DIR, "assets", "stamp.png"),
    ]
    stamp_path = next((p for p in stamp_paths if os.path.exists(p)), None)
    if stamp_path:
        try:
            with open(stamp_path, "rb") as f:
                data = f.read()
            boundary = b"----FinPilotBoundary2"
            body_parts = (
                b"--" + boundary + b"\r\n"
                b'Content-Disposition: form-data; name="asset_type"\r\n\r\nstamp\r\n'
                b"--" + boundary + b"\r\n"
                b'Content-Disposition: form-data; name="file"; filename="stamp.png"\r\n'
                b"Content-Type: image/png\r\n\r\n" + data + b"\r\n"
                b"--" + boundary + b"--\r\n"
            )
            req = urllib.request.Request(
                f"{hf_url}/api/assets/upload",
                data=body_parts,
                headers={"Content-Type": f"multipart/form-data; boundary={boundary.decode()}"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as r:
                results["stamp"] = {"ok": True, "size": len(data), "response": json.loads(r.read())}
        except Exception as e:
            results["stamp"] = {"ok": False, "error": str(e)[:200]}
    else:
        results["stamp"] = {"ok": False, "error": "stamp.png not found"}

    return {"hf_url": hf_url, "results": results}
