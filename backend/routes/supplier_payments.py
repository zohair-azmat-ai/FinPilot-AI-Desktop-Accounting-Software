from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from database import get_db
import models, schemas
from pdf_generator import generate_supplier_payment_pdf

router = APIRouter(prefix="/api/supplier-payments", tags=["supplier-payments"])


def _next_payment_number(db: Session) -> str:
    existing_set = set()
    for (num,) in db.query(models.SupplierPayment.payment_number).all():
        try:
            existing_set.add(int(num.split("-")[-1]))
        except Exception:
            pass
    if not existing_set:
        return "SPAY-0001"
    candidate = min(existing_set)
    while candidate in existing_set:
        candidate += 1
    return f"SPAY-{candidate:04d}"


@router.get("/", response_model=List[schemas.SupplierPaymentOut])
def list_supplier_payments(supplier_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(models.SupplierPayment)
    if supplier_id:
        q = q.filter(models.SupplierPayment.supplier_id == supplier_id)
    return q.order_by(models.SupplierPayment.id.desc()).all()


@router.get("/{payment_id}", response_model=schemas.SupplierPaymentOut)
def get_supplier_payment(payment_id: int, db: Session = Depends(get_db)):
    payment = db.query(models.SupplierPayment).filter(models.SupplierPayment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Supplier payment not found")
    return payment


@router.post("/", response_model=schemas.SupplierPaymentOut)
def create_supplier_payment(data: schemas.SupplierPaymentCreate, db: Session = Depends(get_db)):
    payment = models.SupplierPayment(
        payment_number=_next_payment_number(db),
        supplier_id=data.supplier_id,
        date=data.date or datetime.utcnow(),
        amount=data.amount,
        method=data.method or "cash",
        reference=data.reference or "",
        notes=data.notes or "",
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


@router.put("/{payment_id}", response_model=schemas.SupplierPaymentOut)
def update_supplier_payment(payment_id: int, data: schemas.SupplierPaymentCreate, db: Session = Depends(get_db)):
    payment = db.query(models.SupplierPayment).filter(models.SupplierPayment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Supplier payment not found")

    payment.supplier_id = data.supplier_id
    payment.date = data.date or payment.date
    payment.amount = data.amount
    payment.method = data.method or "cash"
    payment.reference = data.reference or ""
    payment.notes = data.notes or ""

    db.commit()
    db.refresh(payment)
    return payment


@router.delete("/{payment_id}")
def delete_supplier_payment(payment_id: int, db: Session = Depends(get_db)):
    payment = db.query(models.SupplierPayment).filter(models.SupplierPayment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Supplier payment not found")
    db.query(models.SupplierPaymentAllocation).filter(
        models.SupplierPaymentAllocation.payment_id == payment_id
    ).delete(synchronize_session=False)
    db.delete(payment)
    db.commit()
    return {"ok": True}


@router.get("/{payment_id}/pdf")
def download_supplier_payment_pdf(payment_id: int, db: Session = Depends(get_db)):
    payment = db.query(models.SupplierPayment).filter(models.SupplierPayment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Supplier payment not found")

    company = db.query(models.Company).first()
    comp_dict = {}
    if company:
        comp_dict = {"name": company.name, "trn": company.trn, "address": company.address,
                     "phone": company.phone, "email": company.email}

    supplier = payment.supplier
    supp_dict = {}
    if supplier:
        supp_dict = {"name": supplier.name, "trn": supplier.trn, "address": supplier.address,
                     "phone": supplier.phone}

    pay_data = {
        "payment_number": payment.payment_number,
        "date": payment.date.strftime("%d %b %Y"),
        "amount": payment.amount,
        "method": payment.method,
        "reference": payment.reference or "",
        "notes": payment.notes or "",
        "supplier": supp_dict,
    }

    filepath = generate_supplier_payment_pdf(pay_data, comp_dict)
    return FileResponse(filepath, media_type="application/pdf",
                        filename=f"SupplierPayment_{payment.payment_number}.pdf")
