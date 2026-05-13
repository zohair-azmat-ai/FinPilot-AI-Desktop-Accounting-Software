from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone
from database import get_db
import models, schemas

router = APIRouter(prefix="/api/customers", tags=["customers"])

_active = lambda: models.Customer.deleted_at.is_(None)


@router.get("/", response_model=List[schemas.Customer])
def list_customers(db: Session = Depends(get_db)):
    return db.query(models.Customer).filter(_active()).order_by(models.Customer.name).all()


@router.get("/{customer_id}", response_model=schemas.Customer)
def get_customer(customer_id: int, db: Session = Depends(get_db)):
    c = db.query(models.Customer).filter(models.Customer.id == customer_id, _active()).first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    return c


@router.post("/", response_model=schemas.Customer)
def create_customer(data: schemas.CustomerCreate, db: Session = Depends(get_db)):
    customer = models.Customer(**data.model_dump())
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.put("/{customer_id}", response_model=schemas.Customer)
def update_customer(customer_id: int, data: schemas.CustomerCreate, db: Session = Depends(get_db)):
    c = db.query(models.Customer).filter(models.Customer.id == customer_id, _active()).first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    for key, value in data.model_dump().items():
        setattr(c, key, value)
    db.commit()
    db.refresh(c)
    return c


@router.delete("/{customer_id}")
def delete_customer(customer_id: int, db: Session = Depends(get_db)):
    c = db.query(models.Customer).filter(models.Customer.id == customer_id, _active()).first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    now = datetime.now(timezone.utc).isoformat()
    c.deleted_at = now
    c.updated_at = now if hasattr(c, "updated_at") else None
    db.commit()
    return {"ok": True}
