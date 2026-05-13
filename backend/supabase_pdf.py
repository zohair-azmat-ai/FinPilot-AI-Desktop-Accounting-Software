"""
Supabase fallback PDF helper.

Fetches document + related data directly from Supabase when the local SQLite
database does not have the record (e.g. mobile-created documents not yet synced).
"""

import logging
from datetime import datetime
from sync_engine import _read_creds, SupabaseClient

log = logging.getLogger("supabase_pdf")


def _fmt_date(val) -> str:
    if not val:
        return ""
    if hasattr(val, "strftime"):
        return val.strftime("%d %b %Y")
    s = str(val)
    for fmt in ("%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(s[:len(fmt)], fmt).strftime("%d %b %Y")
        except ValueError:
            continue
    return s


def _get_client():
    creds = _read_creds()
    if not creds:
        return None
    return SupabaseClient(creds["url"], creds["anon_key"], creds["workspace_id"])


def _sb_get(client: SupabaseClient, table: str, params: dict) -> list:
    p = dict(params)
    p.setdefault("workspace_id", f"eq.{client.workspace_id}")
    try:
        r = client._s.get(f"{client.url}/rest/v1/{table}", params=p, timeout=10)
        if r.status_code not in (200, 206):
            log.warning("supabase_pdf [%s] HTTP %s: %s", table, r.status_code, r.text[:200])
            return []
        return r.json()
    except Exception as e:
        log.warning("supabase_pdf [%s] error: %s", table, e)
        return []


def _fetch_one(client: SupabaseClient, table: str, **col_filters):
    params = {k: f"eq.{v}" for k, v in col_filters.items()}
    params["limit"] = "1"
    rows = _sb_get(client, table, params)
    return rows[0] if rows else None


def _fetch_many(client: SupabaseClient, table: str, **col_filters) -> list:
    params = {k: f"eq.{v}" for k, v in col_filters.items()}
    params["limit"] = "500"
    return _sb_get(client, table, params)


def _company_dict(client: SupabaseClient) -> dict:
    rows = _fetch_many(client, "companies")
    c = rows[0] if rows else {}
    return {
        "name": c.get("name", ""), "trn": c.get("trn", ""),
        "address": c.get("address", ""), "phone": c.get("phone", ""),
        "email": c.get("email", ""),
    }


def _customer_dict(client: SupabaseClient, customer_id, include_po_box=True) -> dict:
    if not customer_id:
        return {}
    cust = _fetch_one(client, "customers", id=customer_id)
    if not cust:
        return {}
    d = {
        "name": cust.get("name", ""), "trn": cust.get("trn", ""),
        "attn": cust.get("attn", ""), "phone": cust.get("phone", ""),
        "address": cust.get("address", ""),
    }
    if include_po_box:
        d["po_box"] = cust.get("po_box", "")
    return d


def fetch_invoice_for_pdf(lookup: str):
    """
    Returns (invoice_data, comp_dict) ready for generate_invoice_pdf(), or (None, None).
    lookup: invoice_number or sync_uuid
    """
    client = _get_client()
    if not client:
        return None, None

    inv = _fetch_one(client, "invoices", invoice_number=lookup)
    if not inv:
        inv = _fetch_one(client, "invoices", sync_uuid=lookup)
    if not inv:
        return None, None

    comp_dict = _company_dict(client)
    cust_dict = _customer_dict(client, inv.get("customer_id"), include_po_box=True)

    # invoice_items.invoice_id is the FK column name
    items_rows = _fetch_many(client, "invoice_items", invoice_id=inv["id"])
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

    invoice_data = {
        "invoice_number": inv.get("invoice_number", ""),
        "date": _fmt_date(inv.get("date")),
        "customer": cust_dict,
        "items": items,
        "subtotal": float(inv.get("subtotal", 0)),
        "vat_amount": float(inv.get("vat_amount", 0)),
        "discount": float(inv.get("discount", 0)),
        "total": float(inv.get("total", 0)),
        "notes": inv.get("notes", "") or "",
        "letterhead": inv.get("letterhead", 1),
        "lpo_no": inv.get("lpo_no", "") or "",
        "do_no": inv.get("do_no", "") or "",
        "is_cash": bool(inv.get("is_cash", False)),
        "include_stamp": bool(inv.get("include_stamp", False)),
        "require_customer_signature": bool(inv.get("require_customer_signature", False)),
    }
    return invoice_data, comp_dict


def fetch_quotation_for_pdf(lookup: str):
    """Returns (q_data, comp_dict) for generate_quotation_pdf(), or (None, None)."""
    client = _get_client()
    if not client:
        return None, None

    q = _fetch_one(client, "quotations", quotation_number=lookup)
    if not q:
        q = _fetch_one(client, "quotations", sync_uuid=lookup)
    if not q:
        return None, None

    comp_dict = _company_dict(client)
    cust_dict = _customer_dict(client, q.get("customer_id"), include_po_box=False)

    # quotation_items.quotation_id is the FK column
    items_rows = _fetch_many(client, "quotation_items", quotation_id=q["id"])
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

    q_data = {
        "quotation_number": q.get("quotation_number", ""),
        "date": _fmt_date(q.get("date")),
        "valid_until": _fmt_date(q.get("valid_until")),
        "customer": cust_dict,
        "items": items,
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
    return q_data, comp_dict


def fetch_delivery_note_for_pdf(lookup: str):
    """Returns (dn_data, comp_dict) for generate_delivery_note_pdf(), or (None, None)."""
    client = _get_client()
    if not client:
        return None, None

    dn = _fetch_one(client, "delivery_notes", dn_number=lookup)
    if not dn:
        dn = _fetch_one(client, "delivery_notes", sync_uuid=lookup)
    if not dn:
        return None, None

    comp_rows = _fetch_many(client, "companies")
    comp_row = comp_rows[0] if comp_rows else {}
    comp_dict = {
        "name": comp_row.get("name", ""), "trn": comp_row.get("trn", ""),
        "address": comp_row.get("address", ""), "phone": comp_row.get("phone", ""),
        "email": comp_row.get("email", ""),
    }
    show_stamp = bool(comp_row.get("show_dn_stamp", False))

    cust_dict = {}
    if dn.get("customer_id"):
        cust = _fetch_one(client, "customers", id=dn["customer_id"])
        if cust:
            cust_dict = {
                "name": cust.get("name", ""),
                "address": cust.get("address", ""),
                "phone": cust.get("phone", ""),
                "trn": cust.get("trn", ""),
            }

    # delivery_note_items.dn_id is the FK column (NOT delivery_note_id)
    items_rows = _fetch_many(client, "delivery_note_items", dn_id=dn["id"])
    items = [
        {
            "sno": i + 1,
            "description": it.get("description", ""),
            "quantity": float(it.get("quantity", 0)),
            "remarks": it.get("remarks", "") or "",
        }
        for i, it in enumerate(items_rows)
    ]

    dn_data = {
        "dn_number": dn.get("dn_number", ""),
        "date": _fmt_date(dn.get("date")),
        "customer": cust_dict,
        "remarks": dn.get("remarks", "") or "",
        "letterhead": dn.get("letterhead", 1),
        "show_stamp": show_stamp,
        "items": items,
    }
    return dn_data, comp_dict


def fetch_po_for_pdf(lookup: str):
    """Returns (po_data, comp_dict) for generate_po_pdf(), or (None, None)."""
    client = _get_client()
    if not client:
        return None, None

    po = _fetch_one(client, "purchase_orders", po_number=lookup)
    if not po:
        po = _fetch_one(client, "purchase_orders", sync_uuid=lookup)
    if not po:
        return None, None

    comp_dict = _company_dict(client)

    sup_dict = {}
    if po.get("supplier_id"):
        sup = _fetch_one(client, "suppliers", id=po["supplier_id"])
        if sup:
            sup_dict = {
                "name": sup.get("name", ""), "trn": sup.get("trn", ""),
                "phone": sup.get("phone", ""), "address": sup.get("address", ""),
            }

    # purchase_order_items.po_id is the FK column (NOT purchase_order_id)
    items_rows = _fetch_many(client, "purchase_order_items", po_id=po["id"])
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

    po_data = {
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
        "supplier": sup_dict,
        "items": items,
    }
    return po_data, comp_dict
