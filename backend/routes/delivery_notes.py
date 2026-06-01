from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone
from database import get_db
import models, schemas, sync_engine
from pdf_generator import generate_delivery_note_pdf
from supabase_pdf import fetch_delivery_note_for_pdf

router = APIRouter(prefix="/api/delivery-notes", tags=["delivery-notes"])


def _next_dn_number(db: Session) -> str:
    """Generate next DN number respecting company-set series with leading-zero padding.

    When dn_current_number > 0: use it directly and increment (no DB gap scan).
    Legacy fallback: scan existing DNs for max+1 (only when no manual override).
    """
    company = db.query(models.Company).first()
    # Use dn_prefix exactly as stored — do NOT fall back to "DN-" for empty string
    prefix  = (company.dn_prefix if company.dn_prefix is not None else "") if company else ""
    pad     = (company.dn_number_pad or 4) if company else 4

    if company and (company.dn_current_number or 0) > 0:
        # Manual series: always use the stored counter, then increment
        next_num = company.dn_current_number
        company.dn_current_number = next_num + 1
        db.add(company)
        db.commit()
        return f"{prefix}{str(next_num).zfill(pad)}"

    # Legacy path: no manual starting number set — scan existing DNs
    rows = db.query(models.DeliveryNote.dn_number).filter(
        models.DeliveryNote.deleted_at.is_(None)
    ).all()
    existing = set()
    for (dn_no,) in rows:
        try:
            existing.add(int(dn_no.split("-")[-1]))
        except Exception:
            pass
    next_num = (max(existing) + 1) if existing else 1
    return f"{prefix}{str(next_num).zfill(pad)}"


_active = lambda: models.DeliveryNote.deleted_at.is_(None)


@router.get("/", response_model=List[schemas.DeliveryNoteOut])
def list_delivery_notes(
    customer_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    q = db.query(models.DeliveryNote).filter(_active())
    if customer_id:
        q = q.filter(models.DeliveryNote.customer_id == customer_id)
    return q.order_by(models.DeliveryNote.date.desc(), models.DeliveryNote.id.desc()).all()


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
        # Collect item sync_uuids via direct SQL (sync_uuid is migration-only, not in ORM model)
        import sqlalchemy as _sa
        _uuid_rows = db.execute(
            _sa.text("SELECT sync_uuid FROM delivery_note_items WHERE dn_id = :dn_id AND sync_uuid IS NOT NULL"),
            {"dn_id": dn.id}
        ).fetchall()
        old_item_uuids = [r[0] for r in _uuid_rows]
        dn.deleted_at = None
        # Refresh updated_at so the sync orphan guard (parent_ts > item_ts) correctly
        # blocks Supabase from re-syncing the stale child rows we are about to delete.
        db.execute(
            _sa.text("UPDATE delivery_notes SET updated_at = :ts WHERE id = :id"),
            {"ts": datetime.utcnow().isoformat(), "id": dn.id}
        )
        dn.customer_id = payload.customer_id
        dn.date = payload.date or datetime.utcnow()
        dn.remarks = payload.remarks or ""
        dn.letterhead = payload.letterhead if payload.letterhead is not None else True
        dn.status = "draft"
        db.query(models.DeliveryNoteItem).filter(models.DeliveryNoteItem.dn_id == dn.id).delete(synchronize_session=False)
        # Purge from Supabase so sync never resurrects them
        if old_item_uuids:
            try:
                sync_engine.delete_rows_from_supabase("delivery_note_items", old_item_uuids)
            except Exception:
                pass
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
        # Collect sync_uuids via direct SQL before hard-deleting (sync_uuid is migration-only)
        import sqlalchemy as _sa
        _uuid_rows = db.execute(
            _sa.text("SELECT sync_uuid FROM delivery_note_items WHERE dn_id = :dn_id AND sync_uuid IS NOT NULL"),
            {"dn_id": dn_id}
        ).fetchall()
        old_item_uuids = [r[0] for r in _uuid_rows]

        _del_c = db.query(models.DeliveryNoteItem).filter(
            models.DeliveryNoteItem.dn_id == dn_id,
        ).delete(synchronize_session=False)

        # Refresh DN updated_at so orphan guard (parent_ts > item_ts) blocks sync resurrection
        db.execute(
            _sa.text("UPDATE delivery_notes SET updated_at = :ts WHERE id = :id"),
            {"ts": datetime.utcnow().isoformat(), "id": dn_id}
        )

        print(f"[dn update] dn_id={dn_id} received={len(payload.items)} deleted={_del_c} old items purging={len(old_item_uuids)}")

        for item in payload.items:
            db.add(models.DeliveryNoteItem(
                dn_id=dn.id,
                description=item.description,
                quantity=item.quantity,
                remarks=item.remarks or "",
            ))

        # Purge old items from Supabase so sync never resurrects them
        if old_item_uuids:
            try:
                sync_engine.delete_rows_from_supabase("delivery_note_items", old_item_uuids)
            except Exception:
                pass

    db.commit()
    db.refresh(dn)
    return dn


@router.delete("/{dn_id}")
def delete_delivery_note(dn_id: int, db: Session = Depends(get_db)):
    dn = db.query(models.DeliveryNote).filter(models.DeliveryNote.id == dn_id, _active()).first()
    if not dn:
        raise HTTPException(status_code=404, detail="Delivery note not found")

    # Collect item sync_uuids via direct SQL (sync_uuid is migration-only, not in ORM model)
    import sqlalchemy as _sa
    _uuid_rows = db.execute(
        _sa.text("SELECT sync_uuid FROM delivery_note_items WHERE dn_id = :dn_id AND sync_uuid IS NOT NULL"),
        {"dn_id": dn_id}
    ).fetchall()
    item_uuids = [r[0] for r in _uuid_rows]

    # Hard-delete child items so they can never be re-synced from Supabase
    db.query(models.DeliveryNoteItem).filter(
        models.DeliveryNoteItem.dn_id == dn_id
    ).delete(synchronize_session=False)

    # Soft-delete the parent DN
    dn.deleted_at = datetime.now(timezone.utc).isoformat()
    db.commit()

    # Purge items from Supabase (fire-and-forget; non-blocking errors ignored)
    if item_uuids:
        try:
            sync_engine.delete_rows_from_supabase("delivery_note_items", item_uuids)
        except Exception:
            pass

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
