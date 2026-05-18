from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import set_committed_value
from typing import List, Optional
from datetime import datetime, timezone
from database import get_db
import models, schemas
from pdf_generator import generate_invoice_pdf
from supabase_pdf import fetch_invoice_for_pdf

router = APIRouter(prefix="/api/invoices", tags=["invoices"])


def _next_invoice_number(db: Session) -> tuple:
    """Returns (invoice_number_string, True).
    Fills the lowest gap first; if no gap, uses max+1."""
    company = db.query(models.Company).first()
    prefix = (company.invoice_prefix or "") if company else ""

    rows = db.query(models.Invoice.invoice_number).filter(models.Invoice.deleted_at.is_(None)).all()
    existing = set()
    for (inv_no,) in rows:
        try:
            existing.add(int(inv_no.split("-")[-1]))
        except Exception:
            pass

    if not existing:
        counter = (company.invoice_current_number or 0) if company else 0
        next_num = counter if counter > 0 else 1
    else:
        # walk from min upward until first gap
        candidate = min(existing)
        while candidate in existing:
            candidate += 1
        next_num = candidate

    if company and next_num != (company.invoice_current_number or 0):
        company.invoice_current_number = next_num
        db.add(company)
        db.commit()

    return f"{prefix}{next_num:04d}", True


def _increment_invoice_counter(db: Session) -> None:
    """Re-sync counter after a successful commit (next call to _next_invoice_number recomputes anyway)."""
    pass


def _calculate_items(items_data, vat_rate=5.0):
    subtotal = 0.0
    vat_total = 0.0
    processed = []
    for item in items_data:
        line_total = item.quantity * item.unit_price
        vat_amt = round(line_total * (vat_rate / 100), 2) if item.vat_applicable else 0.0
        item_total = round(line_total + vat_amt, 2)
        subtotal += line_total
        vat_total += vat_amt
        processed.append({**item.model_dump(), "vat_amount": vat_amt, "total": item_total})
    return processed, round(subtotal, 2), round(vat_total, 2)


def _update_ledger(db: Session, invoice: models.Invoice):
    db.query(models.LedgerEntry).filter(models.LedgerEntry.invoice_id == invoice.id).delete()

    prev_balance = 0.0
    prev_entries = (
        db.query(models.LedgerEntry)
        .filter(models.LedgerEntry.customer_id == invoice.customer_id)
        .filter(models.LedgerEntry.date < invoice.date)
        .order_by(models.LedgerEntry.date)
        .all()
    )
    if prev_entries:
        prev_balance = prev_entries[-1].balance

    entry = models.LedgerEntry(
        date=invoice.date,
        customer_id=invoice.customer_id,
        invoice_id=invoice.id,
        description=f"Invoice {invoice.invoice_number}",
        debit=invoice.total,
        credit=0.0,
        balance=round(prev_balance + invoice.total, 2),
        entry_type="invoice"
    )
    db.add(entry)

    later_entries = (
        db.query(models.LedgerEntry)
        .filter(models.LedgerEntry.customer_id == invoice.customer_id)
        .filter(models.LedgerEntry.date > invoice.date)
        .order_by(models.LedgerEntry.date)
        .all()
    )
    running = entry.balance
    for e in later_entries:
        running = round(running + e.debit - e.credit, 2)
        e.balance = running


_active = lambda: models.Invoice.deleted_at.is_(None)


@router.get("/", response_model=List[schemas.InvoiceOut])
def list_invoices(status: Optional[str] = None, customer_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(models.Invoice).filter(_active())
    if status:
        q = q.filter(models.Invoice.status == status)
    if customer_id:
        q = q.filter(models.Invoice.customer_id == customer_id)
    invoices = q.order_by(models.Invoice.date.desc(), models.Invoice.id.desc()).all()
    for inv in invoices:
        active = [it for it in inv.items if it.deleted_at is None]
        set_committed_value(inv, 'items', active)
    return invoices


@router.get("/{invoice_id}", response_model=schemas.InvoiceOut)
def get_invoice(invoice_id: int, db: Session = Depends(get_db)):
    inv = db.query(models.Invoice).filter(models.Invoice.id == invoice_id, _active()).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    # Exclude soft-deleted items so the edit screen only shows active items
    active_items = db.query(models.InvoiceItem).filter(
        models.InvoiceItem.invoice_id == invoice_id,
        models.InvoiceItem.deleted_at.is_(None),
    ).all()
    set_committed_value(inv, 'items', active_items)
    return inv


@router.post("/", response_model=schemas.InvoiceOut)
def create_invoice(data: schemas.InvoiceCreate, db: Session = Depends(get_db)):
    company = db.query(models.Company).first()
    vat_rate = company.vat_rate if company else 5.0

    # Filter out blank rows — never save items with no description
    data.items = [it for it in data.items if it.description.strip()]
    processed_items, subtotal, vat_total = _calculate_items(data.items, vat_rate)
    total = round(subtotal + vat_total - (data.discount or 0), 2)
    balance_due = total

    inv_number, _use_series = _next_invoice_number(db)
    existing_deleted = db.query(models.Invoice).filter(
        models.Invoice.invoice_number == inv_number,
        models.Invoice.deleted_at.isnot(None)
    ).first()

    _now_ts = datetime.now(timezone.utc).isoformat()

    if existing_deleted:
        invoice = existing_deleted
        invoice.deleted_at = None
        invoice.customer_id = data.customer_id
        invoice.date = data.date or datetime.utcnow()
        invoice.due_date = data.due_date
        invoice.discount = data.discount or 0
        invoice.notes = data.notes or ""
        invoice.letterhead = data.letterhead if data.letterhead is not None else True
        invoice.lpo_no = data.lpo_no or ""
        invoice.do_no = data.do_no or ""
        invoice.quotation_id = data.quotation_id
        invoice.is_cash = data.is_cash or False
        invoice.include_stamp = data.include_stamp or False
        invoice.require_customer_signature = data.require_customer_signature or False
        invoice.payment_terms = data.payment_terms or ""
        invoice.subtotal = subtotal
        invoice.vat_amount = vat_total
        invoice.total = total
        invoice.amount_paid = 0.0
        invoice.balance_due = balance_due
        invoice.status = "unpaid"
        # Soft-delete old items so sync engine doesn't resurrect them from Supabase
        _del_c = db.query(models.InvoiceItem).filter(
            models.InvoiceItem.invoice_id == invoice.id,
            models.InvoiceItem.deleted_at.is_(None),
        ).update({"deleted_at": _now_ts, "updated_at": _now_ts}, synchronize_session=False)
        print(f"[invoice create restore] invoice_id={invoice.id} num={inv_number} soft_deleted={_del_c} old items")
        db.flush()
    else:
        invoice = models.Invoice(
            invoice_number=inv_number,
            customer_id=data.customer_id,
            date=data.date or datetime.utcnow(),
            due_date=data.due_date,
            discount=data.discount or 0,
            notes=data.notes or "",
            letterhead=data.letterhead if data.letterhead is not None else True,
            lpo_no=data.lpo_no or "",
            do_no=data.do_no or "",
            quotation_id=data.quotation_id,
            is_cash=data.is_cash or False,
            include_stamp=data.include_stamp or False,
            require_customer_signature=data.require_customer_signature or False,
            payment_terms=data.payment_terms or "",
            subtotal=subtotal,
            vat_amount=vat_total,
            total=total,
            amount_paid=0.0,
            balance_due=balance_due,
            status="unpaid"
        )
        db.add(invoice)
    db.flush()

    for item in processed_items:
        db_item = models.InvoiceItem(
            invoice_id=invoice.id,
            item_id=item.get("item_id"),
            description=item["description"],
            quantity=item["quantity"],
            unit_price=item["unit_price"],
            vat_applicable=item["vat_applicable"],
            vat_amount=item["vat_amount"],
            total=item["total"]
        )
        db.add(db_item)

    db.flush()
    _final_c = db.query(models.InvoiceItem).filter(
        models.InvoiceItem.invoice_id == invoice.id,
        models.InvoiceItem.deleted_at.is_(None),
    ).count()
    print(f"[invoice create] num={inv_number} received={len(data.items)} inserted={len(processed_items)} final_active={_final_c}")
    if not invoice.is_cash:
        _update_ledger(db, invoice)
    db.commit()
    # Increment counter only after successful commit
    if _use_series:
        _increment_invoice_counter(db)
    db.refresh(invoice)
    return invoice


@router.put("/{invoice_id}", response_model=schemas.InvoiceOut)
def update_invoice(invoice_id: int, data: schemas.InvoiceCreate, db: Session = Depends(get_db)):
    inv = db.query(models.Invoice).filter(models.Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    company = db.query(models.Company).first()
    vat_rate = company.vat_rate if company else 5.0
    # Filter blank rows before processing
    data.items = [it for it in data.items if it.description.strip()]
    processed_items, subtotal, vat_total = _calculate_items(data.items, vat_rate)
    total = round(subtotal + vat_total - (data.discount or 0), 2)

    now = datetime.now(timezone.utc).isoformat()
    inv.customer_id = data.customer_id
    inv.date = data.date or inv.date
    inv.due_date = data.due_date
    inv.discount = data.discount or 0
    inv.notes = data.notes or ""
    inv.letterhead = data.letterhead if data.letterhead is not None else True
    inv.lpo_no = data.lpo_no or ""
    inv.do_no = data.do_no or ""
    inv.is_cash = data.is_cash or False
    inv.include_stamp = data.include_stamp or False
    inv.require_customer_signature = data.require_customer_signature or False
    inv.payment_terms = data.payment_terms or ""
    inv.subtotal = subtotal
    inv.vat_amount = vat_total
    inv.total = total
    inv.balance_due = round(total - inv.amount_paid, 2)
    if inv.balance_due <= 0:
        inv.status = "paid"
    elif inv.amount_paid > 0:
        inv.status = "partial"
    else:
        inv.status = "unpaid"

    # Soft-delete old active items so sync engine doesn't resurrect orphans from Supabase
    _del_c = db.query(models.InvoiceItem).filter(
        models.InvoiceItem.invoice_id == inv.id,
        models.InvoiceItem.deleted_at.is_(None),
    ).update({"deleted_at": now, "updated_at": now}, synchronize_session=False)
    print(f"[invoice update] invoice_id={inv.id} received={len(data.items)} soft_deleted={_del_c} old items")
    db.flush()

    for item in processed_items:
        db_item = models.InvoiceItem(
            invoice_id=inv.id,
            item_id=item.get("item_id"),
            description=item["description"],
            quantity=item["quantity"],
            unit_price=item["unit_price"],
            vat_applicable=item["vat_applicable"],
            vat_amount=item["vat_amount"],
            total=item["total"]
        )
        db.add(db_item)

    db.flush()   # flush new inserts before count
    _final_c = db.query(models.InvoiceItem).filter(
        models.InvoiceItem.invoice_id == inv.id,
        models.InvoiceItem.deleted_at.is_(None),
    ).count()
    print(f"[invoice update] invoice_id={inv.id} "
          f"received_items_count={len(data.items)} "
          f"deleted_items_count={_del_c} "
          f"inserted_items_count={len(processed_items)} "
          f"final_db_items_count={_final_c}")
    if not inv.is_cash:
        _update_ledger(db, inv)
    db.commit()
    db.refresh(inv)
    return inv


@router.post("/{invoice_id}/cloud-cleanup")
def cloud_cleanup_invoice_items(invoice_id: int, db: Session = Depends(get_db)):
    """Soft-delete in Supabase any invoice_items that are not in the local active set.
    Fixes ghost/orphan items from mobile that were never pulled to local DB."""
    import requests as _req
    try:
        from sync_engine import _read_creds
    except ImportError:
        raise HTTPException(500, "sync_engine not available")

    creds = _read_creds()
    if not creds:
        return {"ok": False, "reason": "Sync not configured — connect Supabase first"}

    inv = db.query(models.Invoice).filter(models.Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")

    # Collect local active sync_uuids for this invoice
    active_items = db.query(models.InvoiceItem).filter(
        models.InvoiceItem.invoice_id == invoice_id,
        models.InvoiceItem.deleted_at.is_(None),
    ).all()
    active_uuids = {it.sync_uuid for it in active_items if it.sync_uuid}
    print(f"[cloud-cleanup invoice] id={invoice_id} num={inv.invoice_number} "
          f"local_active={len(active_items)} active_uuids={len(active_uuids)}")

    hdrs = {"apikey": creds["anon_key"], "Content-Type": "application/json"}
    if creds["anon_key"].startswith("eyJ"):
        hdrs["Authorization"] = f"Bearer {creds['anon_key']}"

    sb_url = creds["url"].rstrip("/")
    ws = creds["workspace_id"]
    now_ts = datetime.now(timezone.utc).isoformat()

    # Fetch ALL active Supabase items for this invoice
    r = _req.get(
        f"{sb_url}/rest/v1/invoice_items",
        params={"workspace_id": f"eq.{ws}", "invoice_id": f"eq.{invoice_id}",
                "deleted_at": "is.null", "limit": "500"},
        headers=hdrs, timeout=15,
    )
    if r.status_code not in (200, 206):
        return {"ok": False, "reason": f"Supabase fetch error {r.status_code}: {r.text[:200]}"}

    sb_active = r.json()
    orphans = [it for it in sb_active if it.get("sync_uuid") not in active_uuids]
    print(f"[cloud-cleanup invoice] sb_active={len(sb_active)} orphans_to_delete={len(orphans)}")

    cleaned = 0
    errors = []
    for it in orphans:
        suuid = it.get("sync_uuid")
        if not suuid:
            continue
        patch_r = _req.patch(
            f"{sb_url}/rest/v1/invoice_items",
            json={"deleted_at": now_ts, "updated_at": now_ts},
            params={"sync_uuid": f"eq.{suuid}", "workspace_id": f"eq.{ws}"},
            headers={**hdrs, "Prefer": "return=minimal"},
            timeout=15,
        )
        if patch_r.status_code in (200, 204):
            cleaned += 1
        else:
            errors.append(f"sync_uuid={suuid} HTTP {patch_r.status_code}")

    return {
        "ok": True,
        "invoice_id": invoice_id,
        "invoice_number": inv.invoice_number,
        "local_active_count": len(active_items),
        "sb_active_before_cleanup": len(sb_active),
        "orphans_cleaned": cleaned,
        "errors": errors,
        "sb_should_now_have_active": len(active_items),
    }


@router.delete("/{invoice_id}")
def delete_invoice(invoice_id: int, db: Session = Depends(get_db)):
    inv = db.query(models.Invoice).filter(models.Invoice.id == invoice_id, _active()).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    now = datetime.now(timezone.utc).isoformat()
    inv.deleted_at = now
    inv.updated_at = now if hasattr(inv, "updated_at") else None
    db.commit()
    return {"ok": True, "deleted_id": invoice_id}


@router.get("/{invoice_id}/pdf")
def download_invoice_pdf(invoice_id: str, db: Session = Depends(get_db)):
    # Always try invoice_number first — the URL typically carries the number, not the local DB id.
    # Numeric id lookup is kept as fallback for legacy callers.
    inv = db.query(models.Invoice).filter(models.Invoice.invoice_number == invoice_id).first()
    if not inv:
        try:
            inv = db.query(models.Invoice).filter(models.Invoice.id == int(invoice_id)).first()
        except (ValueError, TypeError):
            pass

    if inv:
        company = db.query(models.Company).first()
        comp_dict = {}
        if company:
            comp_dict = {
                "name": company.name, "trn": company.trn,
                "address": company.address, "phone": company.phone,
                "email": company.email,
                "stamp_path": company.stamp_path or "",
            }
        customer = inv.customer
        cust_dict = {}
        if customer:
            cust_dict = {
                "name": customer.name, "trn": customer.trn,
                "attn": customer.attn, "phone": customer.phone,
                "address": customer.address,
                "po_box": customer.po_box or "",
                "payment_terms": customer.payment_terms or "",
            }
        active_items = db.query(models.InvoiceItem).filter(
            models.InvoiceItem.invoice_id == inv.id,
            models.InvoiceItem.deleted_at.is_(None),
        ).all()
        print(f"[invoice pdf] invoice_id={inv.id} num={inv.invoice_number} active_items={len(active_items)}")
        # payment_terms: invoice-level value takes precedence; fallback to customer's
        _pt = (inv.payment_terms or "") or (cust_dict.get("payment_terms") or "")
        invoice_data = {
            "invoice_number": inv.invoice_number,
            "date": inv.date.strftime("%d %b %Y"),
            "due_date": inv.due_date.strftime("%d %b %Y") if inv.due_date else "",
            "customer": cust_dict,
            "items": [
                {
                    "description": it.description,
                    "quantity": it.quantity,
                    "unit_price": it.unit_price,
                    "vat_applicable": it.vat_applicable,
                    "vat_amount": it.vat_amount,
                    "total": it.total,
                } for it in active_items
                if it.description and it.description.strip()  # extra guard: skip blank items
            ],
            "subtotal": inv.subtotal,
            "vat_amount": inv.vat_amount,
            "discount": inv.discount,
            "total": inv.total,
            "notes": inv.notes,
            "payment_terms": _pt,
            "letterhead": inv.letterhead if inv.letterhead is not None else True,
            "lpo_no": inv.lpo_no or "",
            "do_no": inv.do_no or "",
            "is_cash": inv.is_cash,
            "include_stamp": inv.include_stamp if inv.include_stamp is not None else True,
            "require_customer_signature": inv.require_customer_signature,
        }
        doc_number = inv.invoice_number
    else:
        # Fallback: fetch from Supabase (mobile-created, not yet synced locally)
        invoice_data, comp_dict = fetch_invoice_for_pdf(invoice_id)
        if not invoice_data:
            raise HTTPException(status_code=404, detail=f"Invoice not found: {invoice_id}")
        doc_number = invoice_data["invoice_number"]

    filepath = generate_invoice_pdf(invoice_data, comp_dict)
    return FileResponse(
        filepath,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="Invoice_{doc_number}.pdf"',
                 "Cache-Control": "no-cache, no-store, must-revalidate",
                 "Pragma": "no-cache", "Expires": "0"},
    )
