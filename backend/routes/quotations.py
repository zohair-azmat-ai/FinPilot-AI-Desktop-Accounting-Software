from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone
from database import get_db
import models, schemas
from pdf_generator import generate_quotation_pdf
from supabase_pdf import fetch_quotation_for_pdf

router = APIRouter(prefix="/api/quotations", tags=["quotations"])


def _next_quotation_number(db: Session) -> str:
    """Fills the lowest gap first; if no gap, uses max+1."""
    company = db.query(models.Company).first()
    prefix = (company.quotation_prefix or "QUO-") if company else "QUO-"

    rows = db.query(models.Quotation.quotation_number).filter(models.Quotation.deleted_at.is_(None)).all()
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
        if not (item.description or "").strip():
            continue  # skip blank rows — never persist blank items
        line_total = item.quantity * item.unit_price
        vat_amt = round(line_total * (vat_rate / 100), 2) if item.vat_applicable else 0.0
        item_total = round(line_total + vat_amt, 2)
        subtotal += line_total
        vat_total += vat_amt
        processed.append({**item.model_dump(), "vat_amount": vat_amt, "total": item_total})
    return processed, round(subtotal, 2), round(vat_total, 2)


_active = lambda: models.Quotation.deleted_at.is_(None)


@router.get("/", response_model=List[schemas.QuotationOut])
def list_quotations(db: Session = Depends(get_db)):
    from sqlalchemy.orm.attributes import set_committed_value
    qs = db.query(models.Quotation).filter(_active()).order_by(models.Quotation.date.desc(), models.Quotation.id.desc()).all()
    for q in qs:
        set_committed_value(q, 'items', [it for it in q.items if not it.deleted_at])
    return qs


@router.get("/{quotation_id}", response_model=schemas.QuotationOut)
def get_quotation(quotation_id: int, db: Session = Depends(get_db)):
    from sqlalchemy.orm.attributes import set_committed_value
    q = db.query(models.Quotation).filter(models.Quotation.id == quotation_id, _active()).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    active_items = [it for it in q.items if not it.deleted_at]
    set_committed_value(q, 'items', active_items)
    return q


@router.post("/", response_model=schemas.QuotationOut)
def create_quotation(data: schemas.QuotationCreate, db: Session = Depends(get_db)):
    company = db.query(models.Company).first()
    vat_rate = company.vat_rate if company else 5.0

    processed_items, subtotal, vat_total = _calculate_items(data.items, vat_rate)
    total = round(subtotal + vat_total - (data.discount or 0), 2)

    q_number = _next_quotation_number(db)
    existing_deleted = db.query(models.Quotation).filter(
        models.Quotation.quotation_number == q_number,
        models.Quotation.deleted_at.isnot(None)
    ).first()

    if existing_deleted:
        quotation = existing_deleted
        quotation.deleted_at = None
        quotation.customer_id = data.customer_id
        quotation.date = data.date or datetime.utcnow()
        quotation.valid_until = data.valid_until
        quotation.discount = data.discount or 0
        quotation.notes = data.notes or ""
        quotation.payment_terms = data.payment_terms or ""
        quotation.delivery = data.delivery or ""
        quotation.include_stamp = data.include_stamp or False
        quotation.letterhead = data.letterhead if data.letterhead is not None else True
        quotation.subtotal = subtotal
        quotation.vat_amount = vat_total
        quotation.total = total
        quotation.status = "draft"
        _now_q = datetime.now(timezone.utc).isoformat()
        db.query(models.QuotationItem).filter(
            models.QuotationItem.quotation_id == quotation.id,
        ).update({"deleted_at": _now_q, "updated_at": _now_q}, synchronize_session=False)
    else:
        quotation = models.Quotation(
            quotation_number=q_number,
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
    db.flush()
    _final_c = db.query(models.QuotationItem).filter(models.QuotationItem.quotation_id == quotation.id).count()
    print(f"[quotation create] {quotation.quotation_number if hasattr(quotation, 'quotation_number') else q_number} "
          f"received_items={len(data.items)} non_blank={len(processed_items)} final_db_count={_final_c}")

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

    # Soft-delete old active items so sync engine doesn't resurrect orphans from Supabase.
    _now_upd = datetime.now(timezone.utc).isoformat()
    _del_c = db.query(models.QuotationItem).filter(
        models.QuotationItem.quotation_id == quotation_id,
        models.QuotationItem.deleted_at.is_(None),
    ).update({"deleted_at": _now_upd, "updated_at": _now_upd}, synchronize_session=False)
    db.flush()   # flush before INSERT to avoid PK conflicts

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
    db.flush()   # flush new inserts before count

    # Verify final ACTIVE row count before commit
    _final_c = db.query(models.QuotationItem).filter(
        models.QuotationItem.quotation_id == quotation_id,
        models.QuotationItem.deleted_at.is_(None),
    ).count()
    print(f"[quotation update] quotation_id={quotation_id} "
          f"received_items_count={len(data.items)} "
          f"deleted_items_count={_del_c} "
          f"inserted_items_count={len(processed_items)} "
          f"final_db_items_count={_final_c}")

    db.commit()
    db.refresh(q)
    return q


@router.post("/{quotation_id}/cloud-cleanup")
def cloud_cleanup_quotation_items(quotation_id: int, db: Session = Depends(get_db)):
    """Soft-delete in Supabase any quotation_items not in the local active set."""
    import requests as _req
    try:
        from sync_engine import _read_creds
    except ImportError:
        raise HTTPException(500, "sync_engine not available")

    creds = _read_creds()
    if not creds:
        return {"ok": False, "reason": "Sync not configured — connect Supabase first"}

    q = db.query(models.Quotation).filter(models.Quotation.id == quotation_id).first()
    if not q:
        raise HTTPException(404, "Quotation not found")

    active_items = db.query(models.QuotationItem).filter(
        models.QuotationItem.quotation_id == quotation_id,
        models.QuotationItem.deleted_at.is_(None),
    ).all()
    active_uuids = {it.sync_uuid for it in active_items if it.sync_uuid}
    print(f"[cloud-cleanup quotation] id={quotation_id} num={q.quotation_number} "
          f"local_active={len(active_items)} active_uuids={len(active_uuids)}")

    hdrs = {"apikey": creds["anon_key"], "Content-Type": "application/json"}
    if creds["anon_key"].startswith("eyJ"):
        hdrs["Authorization"] = f"Bearer {creds['anon_key']}"

    sb_url = creds["url"].rstrip("/")
    ws = creds["workspace_id"]
    now_ts = datetime.now(timezone.utc).isoformat()

    r = _req.get(
        f"{sb_url}/rest/v1/quotation_items",
        params={"workspace_id": f"eq.{ws}", "quotation_id": f"eq.{quotation_id}",
                "deleted_at": "is.null", "limit": "500"},
        headers=hdrs, timeout=15,
    )
    if r.status_code not in (200, 206):
        return {"ok": False, "reason": f"Supabase fetch error {r.status_code}: {r.text[:200]}"}

    sb_active = r.json()
    orphans = [it for it in sb_active if it.get("sync_uuid") not in active_uuids]
    print(f"[cloud-cleanup quotation] sb_active={len(sb_active)} orphans_to_delete={len(orphans)}")

    cleaned = 0
    errors = []
    for it in orphans:
        suuid = it.get("sync_uuid")
        if not suuid:
            continue
        patch_r = _req.patch(
            f"{sb_url}/rest/v1/quotation_items",
            json={"deleted_at": now_ts, "updated_at": now_ts},
            params={"sync_uuid": f"eq.{suuid}", "workspace_id": f"eq.{ws}"},
            headers={**hdrs, "Prefer": "return=minimal"},
            timeout=15,
        )
        if patch_r.status_code in (200, 204):
            cleaned += 1
        else:
            errors.append(f"sync_uuid={suuid} HTTP {patch_r.status_code}")

    return {
        "ok": True,
        "quotation_id": quotation_id,
        "quotation_number": q.quotation_number,
        "local_active_count": len(active_items),
        "sb_active_before_cleanup": len(sb_active),
        "orphans_cleaned": cleaned,
        "errors": errors,
        "sb_should_now_have_active": len(active_items),
    }


@router.delete("/{quotation_id}")
def delete_quotation(quotation_id: int, db: Session = Depends(get_db)):
    q = db.query(models.Quotation).filter(models.Quotation.id == quotation_id, _active()).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    now = datetime.now(timezone.utc).isoformat()
    q.deleted_at = now
    db.commit()
    return {"ok": True}


@router.get("/{quotation_id}/pdf")
def download_quotation_pdf(quotation_id: str, db: Session = Depends(get_db)):
    q = None
    try:
        q = db.query(models.Quotation).filter(models.Quotation.id == int(quotation_id)).first()
    except (ValueError, TypeError):
        pass
    if not q:
        q = db.query(models.Quotation).filter(models.Quotation.quotation_number == quotation_id).first()

    if q:
        company = db.query(models.Company).first()
        comp_dict = {}
        if company:
            comp_dict = {
                "name": company.name, "trn": company.trn,
                "address": company.address, "phone": company.phone,
                "email": company.email,
                "stamp_path": company.stamp_path or "",
            }
        customer = q.customer
        cust_dict = {}
        if customer:
            cust_dict = {"name": customer.name, "trn": customer.trn, "attn": customer.attn, "phone": customer.phone, "address": customer.address}
        q_data = {
            "quotation_number": q.quotation_number,
            "date": q.date.strftime("%d %b %Y"),
            "valid_until": q.valid_until.strftime("%d %b %Y") if q.valid_until else "",
            "customer": cust_dict,
            "items": [{"description": it.description, "quantity": it.quantity, "unit_price": it.unit_price, "vat_applicable": it.vat_applicable, "vat_amount": it.vat_amount, "total": it.total} for it in q.items if not it.deleted_at and (it.description or "").strip()],
            "subtotal": q.subtotal,
            "vat_amount": q.vat_amount,
            "discount": q.discount,
            "total": q.total,
            "notes": q.notes,
            "payment_terms": q.payment_terms or "",
            "delivery": q.delivery or "",
            "include_stamp": q.include_stamp if q.include_stamp is not None else False,
            "letterhead": q.letterhead if q.letterhead is not None else True,
        }
        doc_number = q.quotation_number
    else:
        # Fallback: fetch from Supabase (mobile-created, not yet synced locally)
        q_data, comp_dict = fetch_quotation_for_pdf(quotation_id)
        if not q_data:
            raise HTTPException(status_code=404, detail=f"Quotation not found: {quotation_id}")
        doc_number = q_data["quotation_number"]

    filepath = generate_quotation_pdf(q_data, comp_dict)
    return FileResponse(
        filepath,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="Quotation_{doc_number}.pdf"',
                 "Cache-Control": "no-cache, no-store, must-revalidate",
                 "Pragma": "no-cache", "Expires": "0"},
    )
