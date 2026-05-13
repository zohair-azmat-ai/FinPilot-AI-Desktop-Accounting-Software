from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone
from database import get_db
import models, schemas

router = APIRouter(prefix="/api/suppliers", tags=["suppliers"])

_active = lambda: models.Supplier.deleted_at.is_(None)


def _current_balance(supplier: models.Supplier, db: Session) -> float:
    """Compute current payable balance = opening + bills - payments."""
    bills_total = db.query(func.coalesce(func.sum(models.SupplierBill.total), 0.0))\
        .filter(models.SupplierBill.supplier_id == supplier.id).scalar() or 0.0
    paid_total = db.query(func.coalesce(func.sum(models.SupplierPayment.amount), 0.0))\
        .filter(models.SupplierPayment.supplier_id == supplier.id).scalar() or 0.0
    return round((supplier.opening_balance or 0.0) + bills_total - paid_total, 2)


@router.get("/", response_model=List[schemas.SupplierWithBalance])
def list_suppliers(db: Session = Depends(get_db)):
    suppliers = db.query(models.Supplier).filter(_active()).order_by(models.Supplier.name).all()
    result = []
    for s in suppliers:
        d = {c.name: getattr(s, c.name) for c in s.__table__.columns}
        d["current_balance"] = _current_balance(s, db)
        result.append(d)
    return result


@router.get("/{supplier_id}", response_model=schemas.SupplierWithBalance)
def get_supplier(supplier_id: int, db: Session = Depends(get_db)):
    s = db.query(models.Supplier).filter(models.Supplier.id == supplier_id, _active()).first()
    if not s:
        raise HTTPException(status_code=404, detail="Supplier not found")
    d = {c.name: getattr(s, c.name) for c in s.__table__.columns}
    d["current_balance"] = _current_balance(s, db)
    return d


@router.post("/", response_model=schemas.Supplier)
def create_supplier(data: schemas.SupplierCreate, db: Session = Depends(get_db)):
    supplier = models.Supplier(**data.model_dump())
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return supplier


@router.put("/{supplier_id}", response_model=schemas.Supplier)
def update_supplier(supplier_id: int, data: schemas.SupplierCreate, db: Session = Depends(get_db)):
    s = db.query(models.Supplier).filter(models.Supplier.id == supplier_id, _active()).first()
    if not s:
        raise HTTPException(status_code=404, detail="Supplier not found")
    for key, value in data.model_dump().items():
        setattr(s, key, value)
    db.commit()
    db.refresh(s)
    return s


@router.delete("/{supplier_id}")
def delete_supplier(supplier_id: int, db: Session = Depends(get_db)):
    s = db.query(models.Supplier).filter(models.Supplier.id == supplier_id, _active()).first()
    if not s:
        raise HTTPException(status_code=404, detail="Supplier not found")
    s.deleted_at = datetime.now(timezone.utc).isoformat()
    db.commit()
    return {"ok": True}
