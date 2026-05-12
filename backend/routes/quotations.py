from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
from database import get_db
import models, schemas
from pdf_generator import generate_quotation_pdf

router = APIRouter(prefix="/api/quotations", tags=["quotations"])


def _next_quotation_number(db: Session) -> str:
    """Fills the lowest gap first; if no gap, uses max+1."""
    company = db.query(models.Company).first()
    prefix = (company.quotation_prefix or "QUO-") if company else "QUO-"

    rows = db.query(models.Quotation.quotation_number).all()
    existing = set()
    for (q_no,) in rows:
        try:
            existing.add(int(q_no.split("-")[-1]))
        except Exception:
            pass

    if not existing:
        counter = (company.quotation_current_number or 0) if company else 0
        next_num = counter if counter > 0 else 1
    else:
        candidate = min(existing)
        while candidate in existing:
            candidate += 1
        next_num = candidate

    if company and next_num != (company.quotation_current_number or 0):
        company.quotation_current_number = next_num
        db.add(company)
        db.commit()

    return f"{prefix}{next_num:04d}"


def _increment_quotation_counter(db: Session) -> None:
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


@router.get("/", response_model=List[schemas.QuotationOut])
def list_quotations(db: Session = Depends(get_db)):
    return db.query(models.Quotation).order_by(models.Quotation.id.desc()).all()


@router.get("/{quotation_id}", response_model=schemas.QuotationOut)
def get_quotation(quotation_id: int, db: Session = Depends(get_db)):
    q = db.query(models.Quotation).filter(models.Quotation.id == quotation_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    return q


@router.post("/", response_model=schemas.QuotationOut)
def create_quotation(data: schemas.QuotationCreate, db: Session = Depends(get_db)):
    company = db.query(models.Company).first()
    vat_rate = company.vat_rate if company else 5.0

    processed_items, subtotal, vat_total = _calculate_items(data.items, vat_rate)
    total = round(subtotal + vat_total - (data.discount or 0), 2)

    quotation = models.Quotation(
        quotation_number=_next_quotation_number(db),
        customer_id=data.customer_id,
        date=data.date or datetime.utcnow(),
        valid_until=data.valid_until,
        discount=data.discount or 0,
        notes=data.notes or "",
        payment_terms=data.payment_terms or "",
        delivery=data.delivery or "",
        include_stamp=data.include_stamp or False,
        letterhead=data.letterhead if data.letterhead is not None else True,
        subtotal=subtotal,
        vat_amount=vat_total,
        total=total,
        status="draft"
    )
    db.add(quotation)
    db.flush()

    for item in processed_items:
        db_item = models.QuotationItem(
            quotation_id=quotation.id,
            item_id=item.get("item_id"),
            description=item["description"],
            quantity=item["quantity"],
            unit_price=item["unit_price"],
            vat_applicable=item["vat_applicable"],
            vat_amount=item["vat_amount"],
            total=item["total"]
        )
        db.add(db_item)

    db.commit()
    db.refresh(quotation)
    _increment_quotation_counter(db)
    return quotation


@router.post("/{quotation_id}/convert", response_model=schemas.InvoiceOut)
def convert_to_invoice(quotation_id: int, db: Session = Depends(get_db)):
    q = db.query(models.Quotation).filter(models.Quotation.id == quotation_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    if q.converted_to_invoice:
        raise HTTPException(status_code=400, detail="Already converted to invoice")

    last_inv = db.query(models.Invoice).order_by(models.Invoice.id.desc()).first()
    try:
        num = int(last_inv.invoice_number.split("-")[-1]) + 1 if last_inv else 1
    except Exception:
        num = 1
    inv_number = f"INV-{num:04d}"

    invoice = models.Invoice(
        invoice_number=inv_number,
        customer_id=q.customer_id,
        date=datetime.utcnow(),
        quotation_id=q.id,
        subtotal=q.subtotal,
        vat_amount=q.vat_amount,
        discount=q.discount,
        total=q.total,
        amount_paid=0.0,
        balance_due=q.total,
        notes=q.notes,
        status="unpaid"
    )
    db.add(invoice)
    db.flush()

    for qi in q.items:
        db.add(models.InvoiceItem(
            invoice_id=invoice.id,
            item_id=qi.item_id,
            description=qi.description,
            quantity=qi.quantity,
            unit_price=qi.unit_price,
            vat_applicable=qi.vat_applicable,
            vat_amount=qi.vat_amount,
            total=qi.total
        ))

    q.converted_to_invoice = True
    q.status = "converted"

    ledger_entry = models.LedgerEntry(
        date=invoice.date,
        customer_id=invoice.customer_id,
        invoice_id=invoice.id,
        description=f"Invoice {invoice.invoice_number} (from Quotation {q.quotation_number})",
        debit=invoice.total,
        credit=0.0,
        balance=invoice.total,
        entry_type="invoice"
    )
    db.add(ledger_entry)

    db.commit()
    db.refresh(invoice)
    return invoice


@router.put("/{quotation_id}", response_model=schemas.QuotationOut)
def update_quotation(quotation_id: int, data: schemas.QuotationCreate, db: Session = Depends(get_db)):
    q = db.query(models.Quotation).filter(models.Quotation.id == quotation_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")

    company = db.query(models.Company).first()
    vat_rate = company.vat_rate if company else 5.0

    processed_items, subtotal, vat_total = _calculate_items(data.items, vat_rate)
    total = round(subtotal + vat_total - (data.discount or 0), 2)

    q.customer_id = data.customer_id
    q.date = data.date or q.date
    q.valid_until = data.valid_until
    q.discount = data.discount or 0
    q.notes = data.notes or ""
    q.payment_terms = data.payment_terms or ""
    q.delivery = data.delivery or ""
    q.include_stamp = data.include_stamp or False
    q.letterhead = data.letterhead if data.letterhead is not None else True
    q.subtotal = subtotal
    q.vat_amount = vat_total
    q.total = total

    for old_item in q.items:
        db.delete(old_item)
    db.flush()

    for item in processed_items:
        db.add(models.QuotationItem(
            quotation_id=q.id,
            item_id=item.get("item_id"),
            description=item["description"],
            quantity=item["quantity"],
            unit_price=item["unit_price"],
            vat_applicable=item["vat_applicable"],
            vat_amount=item["vat_amount"],
            total=item["total"]
        ))

    db.commit()
    db.refresh(q)
    return q


@router.delete("/{quotation_id}")
def delete_quotation(quotation_id: int, db: Session = Depends(get_db)):
    q = db.query(models.Quotation).filter(models.Quotation.id == quotation_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    db.delete(q)
    db.commit()
    return {"ok": True}


@router.get("/{quotation_id}/pdf")
def download_quotation_pdf(quotation_id: int, db: Session = Depends(get_db)):
    q = db.query(models.Quotation).filter(models.Quotation.id == quotation_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")

    company = db.query(models.Company).first()
    comp_dict = {}
    if company:
        comp_dict = {"name": company.name, "trn": company.trn, "address": company.address, "phone": company.phone, "email": company.email}

    customer = q.customer
    cust_dict = {}
    if customer:
        cust_dict = {"name": customer.name, "trn": customer.trn, "attn": customer.attn, "phone": customer.phone, "address": customer.address}

    q_data = {
        "quotation_number": q.quotation_number,
        "date": q.date.strftime("%d %b %Y"),
        "valid_until": q.valid_until.strftime("%d %b %Y") if q.valid_until else "",
        "customer": cust_dict,
        "items": [{"description": it.description, "quantity": it.quantity, "unit_price": it.unit_price, "vat_applicable": it.vat_applicable, "vat_amount": it.vat_amount, "total": it.total} for it in q.items],
        "subtotal": q.subtotal,
        "vat_amount": q.vat_amount,
        "discount": q.discount,
        "total": q.total,
        "notes": q.notes,
        "payment_terms": q.payment_terms or "",
        "delivery": q.delivery or "",
        "include_stamp": q.include_stamp,
        "letterhead": q.letterhead,
    }

    filepath = generate_quotation_pdf(q_data, comp_dict)
    return FileResponse(filepath, media_type="application/pdf", filename=f"Quotation_{q.quotation_number}.pdf")
