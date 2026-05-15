from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone
from database import get_db
import models, schemas
from pdf_generator import generate_delivery_note_pdf
from supabase_pdf import fetch_delivery_note_for_pdf

router = APIRouter(prefix="/api/delivery-notes", tags=["delivery-notes"])


def _next_dn_number(db: Session) -> str:
    """Fills the lowest gap first; if no gap, uses max+1."""
    company = db.query(models.Company).first()
    prefix = (company.dn_prefix or "DN-") if company else "DN-"

    rows = db.query(models.DeliveryNote.dn_number).filter(models.DeliveryNote.deleted_at.is_(None)).all()
    existing = set()
    for (dn_no,) in rows:
        try:
            existing.add(int(dn_no.split("-")[-1]))
        except Exception:
            pass

    if not existing:
        counter = (company.dn_current_number or 0) if company else 0
        next_num = counter if counter > 0 else 1
    else:
        candidate = min(existing)
        while candidate in existing:
            candidate += 1
        next_num = candidate

    if company and next_num != (company.dn_current_number or 0):
        company.dn_current_number = next_num
        db.add(company)
        db.commit()

    return f"{prefix}{next_num:04d}"


def _increment_dn_counter(db: Session) -> None:
    pass


_active = lambda: models.DeliveryNote.deleted_at.is_(None)


@router.get("/", response_model=List[schemas.DeliveryNoteOut])
def list_delivery_notes(
    customer_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    q = db.query(models.DeliveryNote).filter(_active())
    if customer_id:
        q = q.filter(models.DeliveryNote.customer_id == customer_id)
    return q.order_by(models.DeliveryNote.id.desc()).all()


@router.get("/{dn_id}", response_model=schemas.DeliveryNoteOut)
def get_delivery_note(dn_id: int, db: Session = Depends(get_db)):
    dn = db.query(models.DeliveryNote).filter(models.DeliveryNote.id == dn_id, _active()).first()
    if not dn:
        raise HTTPException(status_code=404, detail="Delivery note not found")
    return dn


@router.post("/", response_model=schemas.DeliveryNoteOut)
def create_delivery_note(payload: schemas.DeliveryNoteCreate, db: Session = Depends(get_db)):
    dn_number = _next_dn_number(db)
    existing_deleted = db.query(models.DeliveryNote).filter(
        models.DeliveryNote.dn_number == dn_number,
        models.DeliveryNote.deleted_at.isnot(None)
    ).first()

    if existing_deleted:
        dn = existing_deleted
        dn.deleted_at = None
        dn.customer_id = payload.customer_id
        dn.date = payload.date or datetime.utcnow()
        dn.remarks = payload.remarks or ""
        dn.letterhead = payload.letterhead if payload.letterhead is not None else True
        dn.status = "draft"
        db.query(models.DeliveryNoteItem).filter(models.DeliveryNoteItem.dn_id == dn.id).delete()
    else:
        dn = models.DeliveryNote(
            dn_number=dn_number,
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
        _del_c = db.query(models.DeliveryNoteItem).filter(
            models.DeliveryNoteItem.dn_id == dn_id,
        ).delete(synchronize_session=False)
        print(f"[dn update] dn_id={dn_id} received={len(payload.items)} deleted={_del_c} old items")
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
    dn = db.query(models.DeliveryNote).filter(models.DeliveryNote.id == dn_id, _active()).first()
    if not dn:
        raise HTTPException(status_code=404, detail="Delivery note not found")
    dn.deleted_at = datetime.now(timezone.utc).isoformat()
    db.commit()
    return {"ok": True}


@router.get("/{dn_id}/pdf")
def download_delivery_note_pdf(dn_id: str, db: Session = Depends(get_db)):
    dn = None
    try:
        dn = db.query(models.DeliveryNote).filter(models.DeliveryNote.id == int(dn_id)).first()
    except (ValueError, TypeError):
        pass
    if not dn:
        dn = db.query(models.DeliveryNote).filter(models.DeliveryNote.dn_number == dn_id).first()

    if dn:
        company = db.query(models.Company).first()
        comp_dict = {}
        show_stamp = False
        if company:
            comp_dict = {
                "name": company.name, "trn": company.trn,
                "address": company.address, "phone": company.phone,
                "email": company.email,
            }
            show_stamp = bool(company.show_dn_stamp)
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
            "show_stamp": show_stamp,
            "items": [
                {"sno": i + 1, "description": it.description, "quantity": it.quantity, "remarks": it.remarks or ""}
                for i, it in enumerate(dn.items)
            ],
        }
        doc_number = dn.dn_number
    else:
        # Fallback: fetch from Supabase (mobile-created, not yet synced locally)
        dn_data, comp_dict = fetch_delivery_note_for_pdf(dn_id)
        if not dn_data:
            raise HTTPException(status_code=404, detail=f"Delivery note not found: {dn_id}")
        doc_number = dn_data["dn_number"]

    filepath = generate_delivery_note_pdf(dn_data, comp_dict)
    return FileResponse(
        filepath,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="DeliveryNote_{doc_number}.pdf"',
                 "Cache-Control": "no-cache, no-store, must-revalidate",
                 "Pragma": "no-cache", "Expires": "0"},
    )
