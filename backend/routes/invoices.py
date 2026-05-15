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
    invoices = q.order_by(models.Invoice.id.desc()).all()
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

    processed_items, subtotal, vat_total = _calculate_items(data.items, vat_rate)
    total = round(subtotal + vat_total - (data.discount or 0), 2)
    balance_due = total

    inv_number, _use_series = _next_invoice_number(db)
    existing_deleted = db.query(models.Invoice).filter(
        models.Invoice.invoice_number == inv_number,
        models.Invoice.deleted_at.isnot(None)
    ).first()

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
        invoice.subtotal = subtotal
        invoice.vat_amount = vat_total
        invoice.total = total
        invoice.amount_paid = 0.0
        invoice.balance_due = balance_due
        invoice.status = "unpaid"
        _del_c = db.query(models.InvoiceItem).filter(
            models.InvoiceItem.invoice_id == invoice.id,
        ).delete(synchronize_session=False)
        print(f"[invoice create restore] invoice_id={invoice.id} num={inv_number} deleted={_del_c} old items")
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
    print(f"[invoice create] num={inv_number} received={len(data.items)} inserted={len(processed_items)}")
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

    _del_c = db.query(models.InvoiceItem).filter(
        models.InvoiceItem.invoice_id == invoice_id,
    ).delete(synchronize_session=False)
    print(f"[invoice update] invoice_id={invoice_id} received={len(data.items)} deleted={_del_c} old items")
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

    _final_c = db.query(models.InvoiceItem).filter(
        models.InvoiceItem.invoice_id == invoice_id,
        models.InvoiceItem.deleted_at.is_(None),
    ).count()
    print(f"[invoice update] invoice_id={invoice_id} inserted={len(processed_items)} final_active={_final_c}")
    if not inv.is_cash:
        _update_ledger(db, inv)
    db.commit()
    db.refresh(inv)
    return inv


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
    inv = None
    try:
        inv = db.query(models.Invoice).filter(models.Invoice.id == int(invoice_id)).first()
    except (ValueError, TypeError):
        pass
    if not inv:
        inv = db.query(models.Invoice).filter(models.Invoice.invoice_number == invoice_id).first()

    if inv:
        company = db.query(models.Company).first()
        comp_dict = {}
        if company:
            comp_dict = {
                "name": company.name, "trn": company.trn,
                "address": company.address, "phone": company.phone,
                "email": company.email,
            }
        customer = inv.customer
        cust_dict = {}
        if customer:
            cust_dict = {
                "name": customer.name, "trn": customer.trn,
                "attn": customer.attn, "phone": customer.phone,
                "address": customer.address,
                "po_box": customer.po_box or "",
            }
        active_items = db.query(models.InvoiceItem).filter(
            models.InvoiceItem.invoice_id == inv.id,
            models.InvoiceItem.deleted_at.is_(None),
        ).all()
        print(f"[invoice pdf] invoice_id={inv.id} num={inv.invoice_number} active_items={len(active_items)}")
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
            ],
            "subtotal": inv.subtotal,
            "vat_amount": inv.vat_amount,
            "discount": inv.discount,
            "total": inv.total,
            "notes": inv.notes,
            "letterhead": inv.letterhead if inv.letterhead is not None else True,
            "lpo_no": inv.lpo_no or "",
            "do_no": inv.do_no or "",
            "is_cash": inv.is_cash,
            "include_stamp": inv.include_stamp if inv.include_stamp is not None else False,
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
