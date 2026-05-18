from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from database import get_db
import models, schemas
from pdf_generator import generate_bank_statement_pdf

router = APIRouter(prefix="/api/bank-transactions", tags=["bank-transactions"])


def _parse_dt(s: str) -> datetime:
    """Parse ISO string as naive datetime (strips Z/timezone so it compares with DB datetimes)."""
    dt = datetime.fromisoformat(s)
    return dt.replace(tzinfo=None) if dt.tzinfo is not None else dt


def _next_txn_number(db: Session) -> str:
    last = db.query(models.BankTransaction).order_by(models.BankTransaction.id.desc()).first()
    if not last:
        return "BTX-0001"
    try:
        num = int(last.transaction_number.split("-")[-1]) + 1
    except Exception:
        num = 1
    return f"BTX-{num:04d}"


def _recalc_balances(db: Session, account_id: int):
    acct = db.query(models.BankAccount).filter(models.BankAccount.id == account_id).first()
    if not acct:
        return
    txns = (
        db.query(models.BankTransaction)
        .filter(models.BankTransaction.bank_account_id == account_id)
        .order_by(models.BankTransaction.date, models.BankTransaction.id)
        .all()
    )
    running = acct.opening_balance
    for t in txns:
        if t.transaction_type == "received":
            running = round(running + t.amount, 2)
        else:
            running = round(running - t.amount, 2)
        t.balance_after = running


@router.get("/", response_model=List[schemas.BankTransactionOut])
def list_transactions(
    bank_account_id: Optional[int] = None,
    transaction_type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db)
):
    q = db.query(models.BankTransaction)
    if bank_account_id:
        q = q.filter(models.BankTransaction.bank_account_id == bank_account_id)
    if transaction_type:
        q = q.filter(models.BankTransaction.transaction_type == transaction_type)
    if date_from:
        q = q.filter(models.BankTransaction.date >= datetime.fromisoformat(date_from))
    if date_to:
        q = q.filter(models.BankTransaction.date <= datetime.fromisoformat(date_to))
    return q.order_by(models.BankTransaction.date.desc(), models.BankTransaction.id.desc()).all()


@router.get("/{txn_id}", response_model=schemas.BankTransactionOut)
def get_transaction(txn_id: int, db: Session = Depends(get_db)):
    t = db.query(models.BankTransaction).filter(models.BankTransaction.id == txn_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return t


@router.post("/", response_model=schemas.BankTransactionOut)
def create_transaction(data: schemas.BankTransactionCreate, db: Session = Depends(get_db)):
    acct = db.query(models.BankAccount).filter(models.BankAccount.id == data.bank_account_id).first()
    if not acct:
        raise HTTPException(status_code=404, detail="Bank account not found")

    txn = models.BankTransaction(
        transaction_number=_next_txn_number(db),
        bank_account_id=data.bank_account_id,
        date=data.date or datetime.utcnow(),
        transaction_type=data.transaction_type,
        method=data.method or "bank_transfer",
        description=data.description,
        amount=data.amount,
        party_name=data.party_name or "",
        customer_id=data.customer_id,
        supplier_id=data.supplier_id,
        invoice_id=data.invoice_id,
        cheque_id=data.cheque_id,
        reference=data.reference or "",
        notes=data.notes or "",
        balance_after=0.0
    )
    db.add(txn)
    db.flush()
    _recalc_balances(db, data.bank_account_id)
    db.commit()
    db.refresh(txn)
    return txn


@router.delete("/{txn_id}")
def delete_transaction(txn_id: int, db: Session = Depends(get_db)):
    t = db.query(models.BankTransaction).filter(models.BankTransaction.id == txn_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Transaction not found")
    account_id = t.bank_account_id
    db.delete(t)
    db.flush()
    _recalc_balances(db, account_id)
    db.commit()
    return {"ok": True}


@router.get("/statement/{account_id}")
def get_bank_statement(
    account_id: int,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db)
):
    acct = db.query(models.BankAccount).filter(models.BankAccount.id == account_id).first()
    if not acct:
        raise HTTPException(status_code=404, detail="Account not found")

    all_txns = (
        db.query(models.BankTransaction)
        .filter(models.BankTransaction.bank_account_id == account_id)
        .order_by(models.BankTransaction.date, models.BankTransaction.id)
        .all()
    )

    dt_from = _parse_dt(date_from) if date_from else None
    dt_to = _parse_dt(date_to) if date_to else None

    opening_balance = acct.opening_balance
    if dt_from:
        for t in all_txns:
            if t.date < dt_from:
                if t.transaction_type == "received":
                    opening_balance += t.amount
                else:
                    opening_balance -= t.amount

    filtered = [t for t in all_txns if
                (dt_from is None or t.date >= dt_from) and
                (dt_to is None or t.date <= dt_to)]

    running = opening_balance
    entries = []
    total_in = 0.0
    total_out = 0.0

    for t in filtered:
        money_in = t.amount if t.transaction_type == "received" else 0.0
        money_out = t.amount if t.transaction_type == "paid" else 0.0
        running = round(running + money_in - money_out, 2)
        total_in += money_in
        total_out += money_out
        entries.append({
            "id": t.id,
            "date": t.date.strftime("%d %b %Y"),
            "description": t.description,
            "method": t.method,
            "party_name": t.party_name,
            "money_in": money_in,
            "money_out": money_out,
            "balance": running,
            "reference": t.reference,
            "transaction_type": t.transaction_type
        })

    print(f"[bank_statement] statement_type=bank account={acct.name!r} "
          f"date_from={date_from!r} date_to={date_to!r} rows_count={len(entries)}")
    return {
        "account": {
            "id": acct.id,
            "name": acct.name,
            "bank_name": acct.bank_name,
            "account_number": acct.account_number,
            "iban": acct.iban,
            "account_type": acct.account_type
        },
        "date_from": date_from,
        "date_to": date_to,
        "opening_balance": round(opening_balance, 2),
        "total_in": round(total_in, 2),
        "total_out": round(total_out, 2),
        "closing_balance": running,
        "entries": entries
    }


@router.get("/statement/{account_id}/pdf")
def download_bank_statement_pdf(
    account_id: int,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db)
):
    stmt = get_bank_statement(account_id, date_from, date_to, db)
    company = db.query(models.Company).first()
    comp_dict = {}
    if company:
        comp_dict = {"name": company.name, "trn": company.trn, "address": company.address, "phone": company.phone, "email": company.email}

    acct = stmt["account"]
    print(f"[bank_statement] statement_type=bank_pdf account={acct['name']!r} "
          f"date_from={date_from!r} date_to={date_to!r} rows_count={len(stmt['entries'])} "
          f"pdf_generated=starting")
    try:
        filepath = generate_bank_statement_pdf(stmt, comp_dict)
        print(f"[bank_statement] pdf_generated=True path={filepath}")
    except Exception as _e:
        print(f"[bank_statement] pdf_generated=False error={_e}")
        raise
    fname = f"BankStatement_{acct['name'].replace(' ', '_')}.pdf"
    return FileResponse(filepath, media_type="application/pdf", filename=fname)
