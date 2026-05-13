from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone
from database import get_db
import models, schemas
from pdf_generator import generate_supplier_bill_pdf

router = APIRouter(prefix="/api/supplier-bills", tags=["supplier-bills"])


def _max_bill_num(db: Session) -> int:
    rows = db.query(models.SupplierBill.bill_number).all()
    max_n = 0
    for (num,) in rows:
        try:
            n = int(num.split("-")[-1])
            if n > max_n:
                max_n = n
        except Exception:
            pass
    return max_n


def _next_bill_number(db: Session) -> str:
    existing_set = set()
    for (num,) in db.query(models.SupplierBill.bill_number).all():
        try:
            existing_set.add(int(num.split("-")[-1]))
        except Exception:
            pass
    if not existing_set:
        return "BILL-0001"
    candidate = min(existing_set)
    while candidate in existing_set:
        candidate += 1
    return f"BILL-{candidate:04d}"


def _calc_items(items_data, vat_rate=5.0):
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


_active = lambda: models.SupplierBill.deleted_at.is_(None)


@router.get("/", response_model=List[schemas.SupplierBillOut])
def list_supplier_bills(supplier_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(models.SupplierBill).filter(_active())
    if supplier_id:
        q = q.filter(models.SupplierBill.supplier_id == supplier_id)
    return q.order_by(models.SupplierBill.id.desc()).all()


@router.get("/{bill_id}", response_model=schemas.SupplierBillOut)
def get_supplier_bill(bill_id: int, db: Session = Depends(get_db)):
    bill = db.query(models.SupplierBill).filter(models.SupplierBill.id == bill_id, _active()).first()
    if not bill:
        raise HTTPException(status_code=404, detail="Supplier bill not found")
    return bill


@router.post("/", response_model=schemas.SupplierBillOut)
def create_supplier_bill(data: schemas.SupplierBillCreate, db: Session = Depends(get_db)):
    company = db.query(models.Company).first()
    vat_rate = company.vat_rate if company else 5.0

    processed, subtotal, vat_total = _calc_items(data.items, vat_rate)
    total = round(subtotal + vat_total, 2)

    bill = models.SupplierBill(
        bill_number=_next_bill_number(db),
        supplier_id=data.supplier_id,
        date=data.date or datetime.utcnow(),
        due_date=data.due_date,
        trn=data.trn or "",
        lpo_no=data.lpo_no or "",
        notes=data.notes or "",
        subtotal=subtotal,
        vat_amount=vat_total,
        total=total,
        amount_paid=0.0,
        balance_due=total,
        status="unpaid",
    )
    db.add(bill)
    db.flush()

    for item in processed:
        db.add(models.SupplierBillItem(
            bill_id=bill.id,
            description=item["description"],
            quantity=item["quantity"],
            unit_price=item["unit_price"],
            vat_applicable=item["vat_applicable"],
            vat_amount=item["vat_amount"],
            total=item["total"],
        ))

    db.commit()
    db.refresh(bill)
    return bill


@router.put("/{bill_id}", response_model=schemas.SupplierBillOut)
def update_supplier_bill(bill_id: int, data: schemas.SupplierBillCreate, db: Session = Depends(get_db)):
    bill = db.query(models.SupplierBill).filter(models.SupplierBill.id == bill_id).first()
    if not bill:
        raise HTTPException(status_code=404, detail="Supplier bill not found")

    company = db.query(models.Company).first()
    vat_rate = company.vat_rate if company else 5.0
    processed, subtotal, vat_total = _calc_items(data.items, vat_rate)
    total = round(subtotal + vat_total, 2)

    bill.supplier_id = data.supplier_id
    bill.date = data.date or bill.date
    bill.due_date = data.due_date
    bill.trn = data.trn or ""
    bill.lpo_no = data.lpo_no or ""
    bill.notes = data.notes or ""
    bill.subtotal = subtotal
    bill.vat_amount = vat_total
    bill.total = total
    bill.balance_due = round(total - bill.amount_paid, 2)
    if bill.balance_due <= 0:
        bill.status = "paid"
    elif bill.amount_paid > 0:
        bill.status = "partial"
    else:
        bill.status = "unpaid"

    db.query(models.SupplierBillItem).filter(models.SupplierBillItem.bill_id == bill_id).delete()
    for item in processed:
        db.add(models.SupplierBillItem(
            bill_id=bill.id,
            description=item["description"],
            quantity=item["quantity"],
            unit_price=item["unit_price"],
            vat_applicable=item["vat_applicable"],
            vat_amount=item["vat_amount"],
            total=item["total"],
        ))

    db.commit()
    db.refresh(bill)
    return bill


@router.delete("/{bill_id}")
def delete_supplier_bill(bill_id: int, db: Session = Depends(get_db)):
    bill = db.query(models.SupplierBill).filter(models.SupplierBill.id == bill_id, _active()).first()
    if not bill:
        raise HTTPException(status_code=404, detail="Supplier bill not found")
    bill.deleted_at = datetime.now(timezone.utc).isoformat()
    db.commit()
    return {"ok": True}


@router.get("/{bill_id}/pdf")
def download_supplier_bill_pdf(bill_id: int, db: Session = Depends(get_db)):
    bill = db.query(models.SupplierBill).filter(models.SupplierBill.id == bill_id).first()
    if not bill:
        raise HTTPException(status_code=404, detail="Supplier bill not found")

    company = db.query(models.Company).first()
    comp_dict = {}
    if company:
        comp_dict = {"name": company.name, "trn": company.trn, "address": company.address,
                     "phone": company.phone, "email": company.email}

    supplier = bill.supplier
    supp_dict = {}
    if supplier:
        supp_dict = {"name": supplier.name, "trn": supplier.trn, "address": supplier.address,
                     "phone": supplier.phone}

    bill_data = {
        "bill_number": bill.bill_number,
        "date": bill.date.strftime("%d %b %Y"),
        "due_date": bill.due_date.strftime("%d %b %Y") if bill.due_date else "",
        "trn": bill.trn or "",
        "lpo_no": bill.lpo_no or "",
        "notes": bill.notes or "",
        "supplier": supp_dict,
        "items": [{"description": it.description, "quantity": it.quantity,
                   "unit_price": it.unit_price, "vat_applicable": it.vat_applicable,
                   "vat_amount": it.vat_amount, "total": it.total} for it in bill.items],
        "subtotal": bill.subtotal,
        "vat_amount": bill.vat_amount,
        "total": bill.total,
    }

    filepath = generate_supplier_bill_pdf(bill_data, comp_dict)
    return FileResponse(filepath, media_type="application/pdf",
                        filename=f"SupplierBill_{bill.bill_number}.pdf")


# ── Supplier Ledger ───────────────────────────────────────────────────────────

@router.get("/ledger/{supplier_id}")
def get_supplier_ledger(supplier_id: int, db: Session = Depends(get_db)):
    supplier = db.query(models.Supplier).filter(models.Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    bills = (
        db.query(models.SupplierBill)
        .filter(models.SupplierBill.supplier_id == supplier_id)
        .order_by(models.SupplierBill.date, models.SupplierBill.id)
        .all()
    )
    payments = (
        db.query(models.SupplierPayment)
        .filter(models.SupplierPayment.supplier_id == supplier_id)
        .order_by(models.SupplierPayment.date, models.SupplierPayment.id)
        .all()
    )

    entries = []
    for b in bills:
        entries.append({
            "date": b.date.isoformat(),
            "type": "bill",
            "reference": b.bill_number,
            "description": f"Supplier Bill {b.bill_number}" + (f" / LPO: {b.lpo_no}" if b.lpo_no else ""),
            "debit": b.total,
            "credit": 0.0,
            "id": b.id,
            "bill_id": b.id,
            "payment_id": None,
        })
    for p in payments:
        entries.append({
            "date": p.date.isoformat(),
            "type": "payment",
            "reference": p.payment_number,
            "description": f"Payment {p.payment_number}" + (f" [{p.method}]" if p.method else ""),
            "debit": 0.0,
            "credit": p.amount,
            "id": p.id,
            "bill_id": None,
            "payment_id": p.id,
        })

    entries.sort(key=lambda e: (e["date"], e["type"]))

    running = supplier.opening_balance or 0.0
    for e in entries:
        running = round(running + e["debit"] - e["credit"], 2)
        e["balance"] = running

    return {
        "supplier": {
            "id": supplier.id,
            "name": supplier.name,
            "trn": supplier.trn,
            "address": supplier.address,
            "phone": supplier.phone,
            "email": supplier.email,
        },
        "opening_balance": supplier.opening_balance or 0.0,
        "closing_balance": running,
        "entries": entries,
    }
