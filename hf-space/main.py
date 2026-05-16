"""
FinPilot AI Cloud Backend — Hugging Face Space
Generates PDFs for invoices, quotations, delivery notes, purchase orders.
Data is fetched directly from Supabase — no SQLite required.
"""
import os
import json
import logging
import urllib.request
import urllib.parse
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("finpilot_hf")

# ── Env config ─────────────────────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
DEFAULT_WS   = os.environ.get("DEFAULT_WORKSPACE_ID", "")

# ── PDF export temp dir ────────────────────────────────────────────────────────
os.makedirs("/tmp/exports", exist_ok=True)
os.makedirs("/tmp/assets", exist_ok=True)

# ── Supabase REST helpers ──────────────────────────────────────────────────────
def _sb_headers() -> dict:
    h = {
        "apikey": SUPABASE_KEY,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if SUPABASE_KEY.startswith("eyJ"):
        h["Authorization"] = f"Bearer {SUPABASE_KEY}"
    return h


def _sb_get(table: str, params: dict, workspace_id: Optional[str] = None) -> list:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(503, "Supabase not configured — set SUPABASE_URL and SUPABASE_KEY env vars in Space settings.")
    ws = workspace_id or DEFAULT_WS
    if ws:
        params = {"workspace_id": f"eq.{ws}", **params}
    qs = urllib.parse.urlencode(params)
    url = f"{SUPABASE_URL}/rest/v1/{table}?{qs}"
    req = urllib.request.Request(url, headers=_sb_headers())
    try:
        with urllib.request.urlopen(req, timeout=12) as r:
            return json.loads(r.read())
    except Exception as e:
        log.error("Supabase [%s] error: %s", table, e)
        return []


def _fetch_doc(table: str, workspace_id: Optional[str], **col_filters) -> Optional[dict]:
    """Fetch one non-deleted document row by column equality."""
    params = {k: f"eq.{v}" for k, v in col_filters.items()}
    params["limit"] = "1"
    params["deleted_at"] = "is.null"
    rows = _sb_get(table, params, workspace_id)
    return rows[0] if rows else None


def _fetch_many(table: str, workspace_id: Optional[str], active_only: bool = False, **col_filters) -> list:
    params = {k: f"eq.{v}" for k, v in col_filters.items()}
    params["limit"] = "500"
    if active_only:
        params["deleted_at"] = "is.null"
    return _sb_get(table, params, workspace_id)


def _fmt_date(val) -> str:
    if not val:
        return ""
    s = str(val).strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S",
                "%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).strftime("%d %b %Y")
        except ValueError:
            continue
    # Last resort: try just the date prefix
    if len(s) >= 10:
        try:
            return datetime.strptime(s[:10], "%Y-%m-%d").strftime("%d %b %Y")
        except ValueError:
            pass
    return s


def _company_dict(workspace_id: Optional[str]) -> dict:
    rows = _fetch_many("companies", workspace_id)
    c = rows[0] if rows else {}
    return {
        "name": c.get("name", ""), "trn": c.get("trn", ""),
        "address": c.get("address", ""), "phone": c.get("phone", ""),
        "email": c.get("email", ""),
        "stamp_path": "",  # cloud PDF uses /tmp/assets/stamp.png via _get_stamp_path()
    }


def _customer_dict(customer_id, workspace_id: Optional[str], include_po_box=True) -> dict:
    if not customer_id:
        return {}
    cust = _fetch_doc("customers", workspace_id, id=customer_id)
    if not cust:
        cust = _fetch_many("customers", workspace_id, id=customer_id)
        cust = cust[0] if cust else None
    if not cust:
        return {}
    d = {
        "name": cust.get("name", ""), "trn": cust.get("trn", ""),
        "attn": cust.get("attn", ""), "phone": cust.get("phone", ""),
        "address": cust.get("address", ""),
        "payment_terms": cust.get("payment_terms", "") or "",
    }
    if include_po_box:
        d["po_box"] = cust.get("po_box", "")
    return d


def _supplier_dict(supplier_id, workspace_id: Optional[str]) -> dict:
    if not supplier_id:
        return {}
    rows = _fetch_many("suppliers", workspace_id, id=supplier_id)
    sup = rows[0] if rows else None
    if not sup:
        return {}
    return {
        "name": sup.get("name", ""), "trn": sup.get("trn", ""),
        "phone": sup.get("phone", ""), "address": sup.get("address", ""),
    }


def _resolve_invoice(lookup: str, workspace_id: Optional[str]) -> Optional[dict]:
    inv = _fetch_doc("invoices", workspace_id, invoice_number=lookup)
    if not inv:
        inv = _fetch_doc("invoices", workspace_id, sync_uuid=lookup)
    if not inv and lookup.isdigit():
        rows = _sb_get("invoices", {"id": f"eq.{lookup}", "deleted_at": "is.null", "limit": "1"}, workspace_id)
        inv = rows[0] if rows else None
    return inv


def _pdf_response(path: str, filename: str) -> Response:
    try:
        with open(path, "rb") as f:
            data = f.read()
    finally:
        try:
            os.unlink(path)
        except Exception:
            pass
    return Response(
        data,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"},
    )


# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(title="FinPilot AI Cloud Backend", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

from pdf_generator import (
    generate_invoice_pdf, generate_quotation_pdf,
    generate_delivery_note_pdf, generate_po_pdf,
)


@app.get("/")
@app.get("/health")
def health():
    return {
        "ok": True,
        "status": "running",
        "service": "FinPilot AI Cloud Backend",
        "supabase_configured": bool(SUPABASE_URL and SUPABASE_KEY),
        "default_workspace_id": DEFAULT_WS or "(not set)",
    }


@app.get("/api/invoices/{lookup}/pdf")
def invoice_pdf(lookup: str, workspace_id: Optional[str] = Query(None)):
    ws = workspace_id or DEFAULT_WS
    inv = _resolve_invoice(lookup, ws)
    if not inv:
        raise HTTPException(404, f"Invoice '{lookup}' not found in Supabase (workspace: {ws})")

    comp = _company_dict(ws)
    cust = _customer_dict(inv.get("customer_id"), ws, include_po_box=True)
    items_rows = _fetch_many("invoice_items", ws, active_only=True, invoice_id=inv["id"])
    items = [
        {
            "description": it.get("description", ""),
            "quantity": float(it.get("quantity", 0)),
            "unit_price": float(it.get("unit_price", 0)),
            "vat_applicable": bool(it.get("vat_applicable", False)),
            "vat_amount": float(it.get("vat_amount", 0)),
            "total": float(it.get("total", 0)),
        }
        for it in items_rows
        if not it.get("deleted_at") and it.get("description", "").strip()
    ]
    log.info("[invoice pdf] %s active_items=%s", inv.get("invoice_number"), len(items))
    data = {
        "invoice_number": inv.get("invoice_number", ""),
        "date": _fmt_date(inv.get("date")),
        "customer": cust, "items": items,
        "subtotal": float(inv.get("subtotal", 0)),
        "vat_amount": float(inv.get("vat_amount", 0)),
        "discount": float(inv.get("discount", 0)),
        "total": float(inv.get("total", 0)),
        "notes": inv.get("notes", "") or "",
        "payment_terms": inv.get("payment_terms", "") or "",
        "letterhead": inv.get("letterhead", 1),
        "lpo_no": inv.get("lpo_no", "") or "",
        "do_no": inv.get("do_no", "") or "",
        "is_cash": bool(inv.get("is_cash", False)),
        "include_stamp": bool(inv.get("include_stamp", False)),
        "require_customer_signature": bool(inv.get("require_customer_signature", False)),
    }
    path = generate_invoice_pdf(data, comp)
    return _pdf_response(path, f"Invoice_{data['invoice_number']}.pdf")


@app.get("/api/quotations/{lookup}/pdf")
def quotation_pdf(lookup: str, workspace_id: Optional[str] = Query(None)):
    ws = workspace_id or DEFAULT_WS
    q = (_fetch_doc("quotations", ws, quotation_number=lookup)
         or _fetch_doc("quotations", ws, sync_uuid=lookup))
    if not q and lookup.isdigit():
        rows = _sb_get("quotations", {"id": f"eq.{lookup}", "deleted_at": "is.null", "limit": "1"}, ws)
        q = rows[0] if rows else None
    if not q:
        raise HTTPException(404, f"Quotation '{lookup}' not found in Supabase (workspace: {ws})")

    comp = _company_dict(ws)
    cust = _customer_dict(q.get("customer_id"), ws, include_po_box=False)
    items_rows = _fetch_many("quotation_items", ws, active_only=True, quotation_id=q["id"])
    items = [
        {
            "description": it.get("description", ""),
            "quantity": float(it.get("quantity", 0)),
            "unit_price": float(it.get("unit_price", 0)),
            "vat_applicable": bool(it.get("vat_applicable", False)),
            "vat_amount": float(it.get("vat_amount", 0)),
            "total": float(it.get("total", 0)),
        }
        for it in items_rows
        if not it.get("deleted_at") and it.get("description", "").strip()
    ]
    log.info("[quotation pdf] %s active_items=%s", q.get("quotation_number"), len(items))
    data = {
        "quotation_number": q.get("quotation_number", ""),
        "date": _fmt_date(q.get("date")),
        "valid_until": _fmt_date(q.get("valid_until")),
        "customer": cust, "items": items,
        "subtotal": float(q.get("subtotal", 0)),
        "vat_amount": float(q.get("vat_amount", 0)),
        "discount": float(q.get("discount", 0)),
        "total": float(q.get("total", 0)),
        "notes": q.get("notes", "") or "",
        "payment_terms": q.get("payment_terms", "") or "",
        "delivery": q.get("delivery", "") or "",
        "include_stamp": bool(q.get("include_stamp", False)),
        "letterhead": q.get("letterhead", 1),
    }
    path = generate_quotation_pdf(data, comp)
    return _pdf_response(path, f"Quotation_{data['quotation_number']}.pdf")


@app.get("/api/delivery-notes/{lookup}/pdf")
def dn_pdf(lookup: str, workspace_id: Optional[str] = Query(None)):
    ws = workspace_id or DEFAULT_WS
    dn = (_fetch_doc("delivery_notes", ws, dn_number=lookup)
          or _fetch_doc("delivery_notes", ws, sync_uuid=lookup))
    if not dn and lookup.isdigit():
        rows = _sb_get("delivery_notes", {"id": f"eq.{lookup}", "deleted_at": "is.null", "limit": "1"}, ws)
        dn = rows[0] if rows else None
    if not dn:
        raise HTTPException(404, f"Delivery note '{lookup}' not found in Supabase (workspace: {ws})")

    comp = _company_dict(ws)
    comp_rows = _fetch_many("companies", ws)
    comp_row = comp_rows[0] if comp_rows else {}
    show_stamp = bool(comp_row.get("show_dn_stamp", False))

    cust_dict = {}
    if dn.get("customer_id"):
        rows = _fetch_many("customers", ws, id=dn["customer_id"])
        c = rows[0] if rows else None
        if c:
            cust_dict = {
                "name": c.get("name", ""), "address": c.get("address", ""),
                "phone": c.get("phone", ""), "trn": c.get("trn", ""),
            }

    items_rows = _fetch_many("delivery_note_items", ws, active_only=True, dn_id=dn["id"])
    items = [
        {
            "sno": i + 1,
            "description": it.get("description", ""),
            "quantity": float(it.get("quantity", 0)),
            "remarks": it.get("remarks", "") or "",
        }
        for i, it in enumerate(items_rows)
    ]
    data = {
        "dn_number": dn.get("dn_number", ""),
        "date": _fmt_date(dn.get("date")),
        "customer": cust_dict,
        "remarks": dn.get("remarks", "") or "",
        "letterhead": dn.get("letterhead", 1),
        "show_stamp": show_stamp,
        "items": items,
    }
    path = generate_delivery_note_pdf(data, comp)
    return _pdf_response(path, f"DeliveryNote_{data['dn_number']}.pdf")


@app.get("/api/purchase-orders/{lookup}/pdf")
def po_pdf(lookup: str, workspace_id: Optional[str] = Query(None)):
    ws = workspace_id or DEFAULT_WS
    po = (_fetch_doc("purchase_orders", ws, po_number=lookup)
          or _fetch_doc("purchase_orders", ws, sync_uuid=lookup))
    if not po and lookup.isdigit():
        rows = _sb_get("purchase_orders", {"id": f"eq.{lookup}", "deleted_at": "is.null", "limit": "1"}, ws)
        po = rows[0] if rows else None
    if not po:
        raise HTTPException(404, f"Purchase order '{lookup}' not found in Supabase (workspace: {ws})")

    comp = _company_dict(ws)
    sup = _supplier_dict(po.get("supplier_id"), ws)
    items_rows = _fetch_many("purchase_order_items", ws, active_only=True, po_id=po["id"])
    items = [
        {
            "description": it.get("description", ""),
            "quantity": float(it.get("quantity", 0)),
            "unit_price": float(it.get("unit_price", 0)),
            "vat_applicable": bool(it.get("vat_applicable", False)),
            "vat_amount": float(it.get("vat_amount", 0)),
            "total": float(it.get("total", 0)),
        }
        for it in items_rows
    ]
    data = {
        "po_number": po.get("po_number", ""),
        "date": _fmt_date(po.get("date")),
        "delivery_date": _fmt_date(po.get("delivery_date")),
        "payment_terms": po.get("payment_terms", "") or "",
        "delivery_terms": po.get("delivery_terms", "") or "",
        "notes": po.get("notes", "") or "",
        "subtotal": float(po.get("subtotal", 0)),
        "vat_amount": float(po.get("vat_amount", 0)),
        "total": float(po.get("total", 0)),
        "include_stamp": bool(po.get("include_stamp", False)),
        "letterhead": po.get("letterhead", 1),
        "supplier": sup, "items": items,
    }
    path = generate_po_pdf(data, comp)
    return _pdf_response(path, f"PO_{data['po_number']}.pdf")


@app.get("/api/cloud/debug/invoice-sync/{invoice_number}")
def debug_invoice(invoice_number: str, workspace_id: Optional[str] = Query(None)):
    ws = workspace_id or DEFAULT_WS
    rows = _sb_get("invoices", {"invoice_number": f"eq.{invoice_number}", "limit": "5"}, ws)
    items_count = 0
    for inv in rows:
        items = _sb_get("invoice_items", {"invoice_id": f"eq.{inv['id']}", "limit": "200"}, ws)
        items_count += len(items)
    return {
        "invoice_number": invoice_number,
        "workspace_id": ws,
        "supabase_rows": len(rows),
        "rows": [
            {
                "id": r.get("id"), "invoice_number": r.get("invoice_number"),
                "deleted_at": r.get("deleted_at"), "updated_at": r.get("updated_at"),
                "customer_id": r.get("customer_id"),
            }
            for r in rows
        ],
        "items_count": items_count,
    }


@app.get("/api/cloud/debug/invoice-items/{invoice_number}")
def debug_invoice_items(invoice_number: str, workspace_id: Optional[str] = Query(None)):
    """Show active/stale item counts for an invoice in Supabase + asset availability."""
    ws = workspace_id or DEFAULT_WS
    rows = _sb_get("invoices", {"invoice_number": f"eq.{invoice_number}", "limit": "5"}, ws)
    inv = rows[0] if rows else None

    active_items, stale_items = [], []
    if inv:
        all_items = _sb_get("invoice_items", {"invoice_id": f"eq.{inv['id']}", "limit": "200"}, ws)
        for it in all_items:
            entry = {
                "id": it.get("id"), "sync_uuid": it.get("sync_uuid"),
                "description": (it.get("description") or "")[:60],
                "deleted_at": it.get("deleted_at"),
            }
            if it.get("deleted_at"):
                stale_items.append(entry)
            else:
                active_items.append(entry)

    lh_tmp  = "/tmp/assets/letterhead.jpg"
    lh_repo = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "letterhead.jpg")
    st_tmp  = "/tmp/assets/stamp.png"
    st_repo = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "stamp.png")

    return {
        "invoice_number": invoice_number,
        "workspace_id": ws,
        "invoice": {
            "id": inv.get("id") if inv else None,
            "deleted_at": inv.get("deleted_at") if inv else None,
            "print_letterhead": inv.get("letterhead") if inv else None,
            "include_stamp": inv.get("include_stamp") if inv else None,
        } if inv else None,
        "items": {
            "active_count": len(active_items),
            "stale_count": len(stale_items),
            "active": active_items,
            "stale": stale_items,
        },
        "assets": {
            "letterhead_tmp": os.path.exists(lh_tmp),
            "letterhead_repo": os.path.exists(lh_repo),
            "stamp_tmp": os.path.exists(st_tmp),
            "stamp_repo": os.path.exists(st_repo),
        },
        "pdf_will_show_items": len(active_items),
    }


@app.post("/api/assets/upload")
async def upload_asset(
    asset_type: str = Form(...),
    file: UploadFile = File(...),
):
    """Upload letterhead or stamp asset to /tmp/assets/ for use in PDF generation.

    asset_type: 'letterhead' → saves as /tmp/assets/letterhead.jpg
                'stamp'      → saves as /tmp/assets/stamp.png
    """
    if asset_type not in ("letterhead", "stamp"):
        raise HTTPException(400, "asset_type must be 'letterhead' or 'stamp'")

    ext = "jpg" if asset_type == "letterhead" else "png"
    dest = f"/tmp/assets/{asset_type}.{ext}"
    os.makedirs("/tmp/assets", exist_ok=True)

    content = await file.read()
    if not content:
        raise HTTPException(400, "Uploaded file is empty")

    with open(dest, "wb") as f:
        f.write(content)

    return {
        "ok": True,
        "asset_type": asset_type,
        "saved_to": dest,
        "size_bytes": len(content),
    }
