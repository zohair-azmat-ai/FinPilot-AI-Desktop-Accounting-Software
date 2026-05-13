from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from database import get_db
import models, schemas
from pdf_generator import generate_po_pdf

router = APIRouter(prefix="/api/purchase-orders", tags=["purchase-orders"])


def _next_po_number(db: Session) -> str:
    company = db.query(models.Company).first()
    if company and (company.po_current_number or 0) > 0:
        prefix = company.po_prefix or "PO-"
        return f"{prefix}{company.po_current_number:04d}"
    last = db.query(models.PurchaseOrder).order_by(models.PurchaseOrder.id.desc()).first()
    prefix = (company.po_prefix if company else None) or "PO-"
    if not last:
        return f"{prefix}0001"
    try:
        num = int(last.po_number.split("-")[-1]) + 1
    except Exception:
        num = 1
    return f"{prefix}{num:04d}"


def _increment_po_counter(db: Session) -> None:
    company = db.query(models.Company).first()
    if company and (company.po_current_number or 0) > 0:
        company.po_current_number += 1
        db.add(company)
        db.commit()


def _calc_items(items_payload, vat_rate: float = 5.0):
    subtotal = vat_total = 0.0
    built = []
    for it in items_payload:
        qty  = it.quantity
        up   = it.unit_price
        amt  = round(qty * up, 2)
        vat  = round(amt * vat_rate / 100, 2) if it.vat_applicable else 0.0
        tot  = round(amt + vat, 2)
        subtotal  += amt
        vat_total += vat
        built.append({**it.model_dump(), "vat_amount": vat, "total": tot})
    return round(subtotal, 2), round(vat_total, 2), round(subtotal + vat_total, 2), built


@router.get("/", response_model=List[schemas.PurchaseOrderOut])
def list_pos(supplier_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(models.PurchaseOrder)
    if supplier_id:
        q = q.filter(models.PurchaseOrder.supplier_id == supplier_id)
    return q.order_by(models.PurchaseOrder.id.desc()).all()


@router.get("/{po_id}", response_model=schemas.PurchaseOrderOut)
def get_po(po_id: int, db: Session = Depends(get_db)):
    po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return po


@router.post("/", response_model=schemas.PurchaseOrderOut)
def create_po(payload: schemas.PurchaseOrderCreate, db: Session = Depends(get_db)):
    company = db.query(models.Company).first()
    vat_rate = company.vat_rate if company else 5.0

    subtotal, vat_amount, total, built_items = _calc_items(payload.items, vat_rate)

    po = models.PurchaseOrder(
        po_number=_next_po_number(db),
        supplier_id=payload.supplier_id,
        date=payload.date or datetime.utcnow(),
        delivery_date=payload.delivery_date,
        payment_terms=payload.payment_terms or "",
        delivery_terms=payload.delivery_terms or "",
        notes=payload.notes or "",
        subtotal=subtotal,
        vat_amount=vat_amount,
        total=total,
        include_stamp=payload.include_stamp or False,
        letterhead=payload.letterhead if payload.letterhead is not None else True,
        status="draft",
    )
    db.add(po)
    db.flush()

    for it in built_items:
        db.add(models.PurchaseOrderItem(
            po_id=po.id,
            description=it["description"],
            quantity=it["quantity"],
            unit_price=it["unit_price"],
            vat_applicable=it["vat_applicable"],
            vat_amount=it["vat_amount"],
            total=it["total"],
        ))

    db.commit()
    db.refresh(po)
    _increment_po_counter(db)
    return po


@router.put("/{po_id}", response_model=schemas.PurchaseOrderOut)
def update_po(po_id: int, payload: schemas.PurchaseOrderUpdate, db: Session = Depends(get_db)):
    po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    for field in ("supplier_id", "date", "delivery_date", "payment_terms",
                  "delivery_terms", "notes", "include_stamp", "letterhead", "status"):
        val = getattr(payload, field, None)
        if val is not None:
            setattr(po, field, val)

    if payload.items is not None:
        company = db.query(models.Company).first()
        vat_rate = company.vat_rate if company else 5.0
        subtotal, vat_amount, total, built_items = _calc_items(payload.items, vat_rate)
        po.subtotal  = subtotal
        po.vat_amount = vat_amount
        po.total     = total

        for old in list(po.items):
            db.delete(old)
        db.flush()
        for it in built_items:
            db.add(models.PurchaseOrderItem(
                po_id=po.id,
                description=it["description"],
                quantity=it["quantity"],
                unit_price=it["unit_price"],
                vat_applicable=it["vat_applicable"],
                vat_amount=it["vat_amount"],
                total=it["total"],
            ))

    db.commit()
    db.refresh(po)
    return po


@router.delete("/{po_id}")
def delete_po(po_id: int, db: Session = Depends(get_db)):
    po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    db.delete(po)
    db.commit()
    return {"ok": True}


@router.get("/{po_id}/pdf")
def download_po_pdf(po_id: str, db: Session = Depends(get_db)):
    po = None
    try:
        po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.id == int(po_id)).first()
    except (ValueError, TypeError):
        pass
    if not po:
        po = db.query(models.PurchaseOrder).filter(models.PurchaseOrder.po_number == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail=f"Purchase order not found: {po_id}")

    company = db.query(models.Company).first()
    comp_dict = {}
    if company:
        comp_dict = {
            "name": company.name or "",
            "trn":  company.trn  or "",
            "address": company.address or "",
            "phone": company.phone or "",
            "email": company.email or "",
        }

    supplier = po.supplier
    sup_dict = {}
    if supplier:
        sup_dict = {
            "name":    supplier.name    or "",
            "trn":     supplier.trn     or "",
            "phone":   supplier.phone   or "",
            "address": supplier.address or "",
        }

    po_data = {
        "po_number":     po.po_number,
        "date":          po.date.strftime("%d %b %Y") if po.date else "",
        "delivery_date": po.delivery_date.strftime("%d %b %Y") if po.delivery_date else "",
        "payment_terms": po.payment_terms or "",
        "delivery_terms": po.delivery_terms or "",
        "notes":         po.notes or "",
        "subtotal":      po.subtotal,
        "vat_amount":    po.vat_amount,
        "total":         po.total,
        "include_stamp": po.include_stamp,
        "letterhead":    po.letterhead,
        "supplier":      sup_dict,
        "items": [
            {
                "description":   it.description,
                "quantity":      it.quantity,
                "unit_price":    it.unit_price,
                "vat_applicable": it.vat_applicable,
                "vat_amount":    it.vat_amount,
                "total":         it.total,
            }
            for it in po.items
        ],
    }

    filepath = generate_po_pdf(po_data, comp_dict)
    return FileResponse(filepath, media_type="application/pdf",
                        filename=f"PO_{po.po_number}.pdf")
