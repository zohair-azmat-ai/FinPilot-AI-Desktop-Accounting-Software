from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
import models, schemas

router = APIRouter(prefix="/api/cheques", tags=["cheques"])


@router.get("/", response_model=List[schemas.ChequeOut])
def list_cheques(
    cheque_type: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    q = db.query(models.Cheque)
    if cheque_type:
        q = q.filter(models.Cheque.cheque_type == cheque_type)
    if status:
        q = q.filter(models.Cheque.status == status)
    return q.order_by(models.Cheque.cheque_date.desc()).all()


@router.get("/{cheque_id}", response_model=schemas.ChequeOut)
def get_cheque(cheque_id: int, db: Session = Depends(get_db)):
    ch = db.query(models.Cheque).filter(models.Cheque.id == cheque_id).first()
    if not ch:
        raise HTTPException(status_code=404, detail="Cheque not found")
    return ch


@router.post("/", response_model=schemas.ChequeOut)
def create_cheque(data: schemas.ChequeCreate, db: Session = Depends(get_db)):
    cheque = models.Cheque(**data.model_dump())
    db.add(cheque)
    db.commit()
    db.refresh(cheque)
    return cheque


@router.patch("/{cheque_id}/status", response_model=schemas.ChequeOut)
def update_cheque_status(cheque_id: int, data: schemas.ChequeUpdate, db: Session = Depends(get_db)):
    ch = db.query(models.Cheque).filter(models.Cheque.id == cheque_id).first()
    if not ch:
        raise HTTPException(status_code=404, detail="Cheque not found")
    valid_statuses = ["pending", "cleared", "bounced", "cancelled"]
    if data.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Status must be one of: {valid_statuses}")
    ch.status = data.status
    db.commit()
    db.refresh(ch)
    return ch


@router.delete("/{cheque_id}")
def delete_cheque(cheque_id: int, db: Session = Depends(get_db)):
    ch = db.query(models.Cheque).filter(models.Cheque.id == cheque_id).first()
    if not ch:
        raise HTTPException(status_code=404, detail="Cheque not found")
    db.delete(ch)
    db.commit()
    return {"ok": True}


@router.get("/summary/stats")
def cheque_stats(db: Session = Depends(get_db)):
    from sqlalchemy import func
    total_received = (
        db.query(func.sum(models.Cheque.amount))
        .filter(models.Cheque.cheque_type == "received", models.Cheque.status == "pending")
        .scalar() or 0.0
    )
    total_issued = (
        db.query(func.sum(models.Cheque.amount))
        .filter(models.Cheque.cheque_type == "issued", models.Cheque.status == "pending")
        .scalar() or 0.0
    )
    cleared = db.query(func.count(models.Cheque.id)).filter(models.Cheque.status == "cleared").scalar() or 0
    bounced = db.query(func.count(models.Cheque.id)).filter(models.Cheque.status == "bounced").scalar() or 0
    return {
        "pending_received": round(total_received, 2),
        "pending_issued": round(total_issued, 2),
        "cleared_count": cleared,
        "bounced_count": bounced
    }
