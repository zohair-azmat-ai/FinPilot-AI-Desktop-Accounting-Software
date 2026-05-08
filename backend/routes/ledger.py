from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from database import get_db
import models, schemas
from pdf_generator import generate_statement_pdf


def _parse_dt(s: str) -> datetime:
    """Parse ISO string as naive datetime (strips Z/timezone so it compares with DB datetimes)."""
    dt = datetime.fromisoformat(s)
    return dt.replace(tzinfo=None) if dt.tzinfo is not None else dt


router = APIRouter(prefix="/api/ledger", tags=["ledger"])


@router.get("/customer/{customer_id}")
def get_customer_ledger(
    customer_id: int,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db)
):
    customer = db.query(models.Customer).filter(models.Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    all_entries = (
        db.query(models.LedgerEntry)
        .filter(models.LedgerEntry.customer_id == customer_id)
        .order_by(models.LedgerEntry.date, models.LedgerEntry.id)
        .all()
    )

    dt_from = _parse_dt(date_from) if date_from else None
    dt_to   = _parse_dt(date_to)   if date_to   else None

    # Running balance starts from customer opening balance + any entries before date_from
    running = customer.opening_balance or 0.0
    if dt_from:
        for e in all_entries:
            if e.date < dt_from:
                running = round(running + e.debit - e.credit, 2)

    filtered = [e for e in all_entries if
                (dt_from is None or e.date >= dt_from) and
                (dt_to   is None or e.date <= dt_to)]

    result = []
    for e in filtered:
        running = round(running + e.debit - e.credit, 2)
        result.append({
            "id": e.id,
            "date": e.date.isoformat(),
            "description": e.description,
            "debit": e.debit,
            "credit": e.credit,
            "balance": running,
            "entry_type": e.entry_type,
            "invoice_id": e.invoice_id,
            "payment_id": e.payment_id,
            "customer_id": customer_id,
        })
    return result


@router.get("/statement/{customer_id}")
def get_statement(
    customer_id: int,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db)
):
    customer = db.query(models.Customer).filter(models.Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    all_entries = (
        db.query(models.LedgerEntry)
        .filter(models.LedgerEntry.customer_id == customer_id)
        .order_by(models.LedgerEntry.date, models.LedgerEntry.id)
        .all()
    )

    dt_from = datetime.fromisoformat(date_from) if date_from else None
    dt_to = datetime.fromisoformat(date_to) if date_to else None

    opening_balance = customer.opening_balance or 0.0
    if dt_from:
        for e in all_entries:
            if e.date < dt_from:
                opening_balance = round(opening_balance + e.debit - e.credit, 2)

    filtered = [e for e in all_entries if
                (dt_from is None or e.date >= dt_from) and
                (dt_to is None or e.date <= dt_to)]

    running = opening_balance
    stmt_entries = []
    for e in filtered:
        running = round(running + e.debit - e.credit, 2)
        stmt_entries.append({
            "id": e.id,
            "date": e.date.strftime("%d %b %Y"),
            "description": e.description,
            "debit": e.debit,
            "credit": e.credit,
            "balance": running,
            "entry_type": e.entry_type,
            "invoice_id": e.invoice_id,
            "payment_id": e.payment_id
        })

    closing_balance = running

    return {
        "customer": {
            "id": customer.id,
            "name": customer.name,
            "trn": customer.trn,
            "address": customer.address,
            "phone": customer.phone,
            "email": customer.email
        },
        "date_from": date_from,
        "date_to": date_to,
        "opening_balance": opening_balance,
        "closing_balance": closing_balance,
        "entries": stmt_entries
    }


@router.get("/statement/{customer_id}/pdf")
def download_statement_pdf(
    customer_id: int,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    lpo_number: Optional[str] = None,
    db: Session = Depends(get_db)
):
    stmt = get_statement(customer_id, date_from, date_to, db)

    company = db.query(models.Company).first()
    comp_dict = {}
    show_lpo = False
    if company:
        comp_dict = {"name": company.name, "trn": company.trn, "address": company.address, "phone": company.phone, "email": company.email}
        show_lpo = bool(company.show_lpo_in_statement)

    filepath = generate_statement_pdf(
        stmt["customer"],
        stmt["entries"],
        date_from, date_to,
        stmt["opening_balance"],
        stmt["closing_balance"],
        comp_dict,
        show_lpo=show_lpo,
        lpo_number=lpo_number or "",
    )
    customer = db.query(models.Customer).filter(models.Customer.id == customer_id).first()
    return FileResponse(filepath, media_type="application/pdf", filename=f"Statement_{customer.name.replace(' ', '_')}.pdf")
