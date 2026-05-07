from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from database import get_db
import models, schemas
from pdf_generator import generate_delivery_note_pdf

router = APIRouter(prefix="/api/delivery-notes", tags=["delivery-notes"])


def _next_dn_number(db: Session) -> str:
    company = db.query(models.Company).first()
    if company and (company.dn_current_number or 0) > 0:
        prefix = company.dn_prefix or "DN-"
        return f"{prefix}{company.dn_current_number:04d}"
    # Fallback: derive from last DN number in table
    last = db.query(models.DeliveryNote).order_by(models.DeliveryNote.id.desc()).first()
    if not last:
        prefix = (company.dn_prefix if company else None) or "DN-"
        return f"{prefix}0001"
    try:
        num = int(last.dn_number.split("-")[-1]) + 1
    except Exception:
        num = 1
    prefix = (company.dn_prefix if company else None) or "DN-"
    return f"{prefix}{num:04d}"


def _increment_dn_counter(db: Session) -> None:
    company = db.query(models.Company).first()
    if company and (company.dn_current_number or 0) > 0:
        company.dn_current_number += 1
        db.add(company)
        db.commit()


@router.get("/", response_model=List[schemas.DeliveryNoteOut])
def list_delivery_notes(
    customer_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    q = db.query(models.DeliveryNote)
    if customer_id:
        q = q.filter(models.DeliveryNote.customer_id == customer_id)
    return q.order_by(models.DeliveryNote.id.desc()).all()


@router.get("/{dn_id}", response_model=schemas.DeliveryNoteOut)
def get_delivery_note(dn_id: int, db: Session = Depends(get_db)):
    dn = db.query(models.DeliveryNote).filter(models.DeliveryNote.id == dn_id).first()
    if not dn:
        raise HTTPException(status_code=404, detail="Delivery note not found")
    return dn


@router.post("/", response_model=schemas.DeliveryNoteOut)
def create_delivery_note(payload: schemas.DeliveryNoteCreate, db: Session = Depends(get_db)):
    dn = models.DeliveryNote(
        dn_number=_next_dn_number(db),
        customer_id=payload.customer_id,
        date=payload.date or datetime.utcnow(),
        remarks=payload.remarks or "",
        letterhead=payload.letterhead if payload.letterhead is not None else True,
        status="draft",
    )
    db.add(dn)
    db.flush()

    for item in payload.items:
        db.add(models.DeliveryNoteItem(
            dn_id=dn.id,
            description=item.description,
            quantity=item.quantity,
            remarks=item.remarks or "",
        ))

    db.commit()
    db.refresh(dn)
    _increment_dn_counter(db)
    return dn


@router.put("/{dn_id}", response_model=schemas.DeliveryNoteOut)
def update_delivery_note(dn_id: int, payload: schemas.DeliveryNoteUpdate, db: Session = Depends(get_db)):
    dn = db.query(models.DeliveryNote).filter(models.DeliveryNote.id == dn_id).first()
    if not dn:
        raise HTTPException(status_code=404, detail="Delivery note not found")

    if payload.customer_id is not None:
        dn.customer_id = payload.customer_id
    if payload.date is not None:
        dn.date = payload.date
    if payload.remarks is not None:
        dn.remarks = payload.remarks
    if payload.letterhead is not None:
        dn.letterhead = payload.letterhead
    if payload.status is not None:
        dn.status = payload.status

    if payload.items is not None:
        db.query(models.DeliveryNoteItem).filter(models.DeliveryNoteItem.dn_id == dn_id).delete()
        for item in payload.items:
            db.add(models.DeliveryNoteItem(
                dn_id=dn.id,
                description=item.description,
                quantity=item.quantity,
                remarks=item.remarks or "",
            ))

    db.commit()
    db.refresh(dn)
    return dn


@router.delete("/{dn_id}")
def delete_delivery_note(dn_id: int, db: Session = Depends(get_db)):
    dn = db.query(models.DeliveryNote).filter(models.DeliveryNote.id == dn_id).first()
    if not dn:
        raise HTTPException(status_code=404, detail="Delivery note not found")
    db.delete(dn)
    db.commit()
    return {"message": "Delivery note deleted"}


@router.get("/{dn_id}/pdf")
def download_delivery_note_pdf(dn_id: int, db: Session = Depends(get_db)):
    dn = db.query(models.DeliveryNote).filter(models.DeliveryNote.id == dn_id).first()
    if not dn:
        raise HTTPException(status_code=404, detail="Delivery note not found")

    company = db.query(models.Company).first()
    comp_dict = {}
    if company:
        comp_dict = {
            "name": company.name, "trn": company.trn,
            "address": company.address, "phone": company.phone,
            "email": company.email,
        }

    dn_data = {
        "dn_number": dn.dn_number,
        "date": dn.date.strftime("%d %b %Y") if dn.date else "",
        "customer": {
            "name": dn.customer.name if dn.customer else "",
            "address": dn.customer.address if dn.customer else "",
            "phone": dn.customer.phone if dn.customer else "",
            "trn": dn.customer.trn if dn.customer else "",
        } if dn.customer_id else {},
        "remarks": dn.remarks or "",
        "letterhead": dn.letterhead,
        "items": [
            {"sno": i + 1, "description": it.description, "quantity": it.quantity, "remarks": it.remarks or ""}
            for i, it in enumerate(dn.items)
        ],
    }

    filepath = generate_delivery_note_pdf(dn_data, comp_dict)
    return FileResponse(
        filepath, media_type="application/pdf",
        filename=f"DeliveryNote_{dn.dn_number}.pdf"
    )
