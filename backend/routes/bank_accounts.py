from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
import models, schemas

router = APIRouter(prefix="/api/bank-accounts", tags=["bank-accounts"])


def _running_balance(db: Session, account_id: int) -> float:
    acct = db.query(models.BankAccount).filter(models.BankAccount.id == account_id).first()
    if not acct:
        return 0.0
    txns = (
        db.query(models.BankTransaction)
        .filter(models.BankTransaction.bank_account_id == account_id)
        .order_by(models.BankTransaction.date, models.BankTransaction.id)
        .all()
    )
    balance = acct.opening_balance
    for t in txns:
        balance += t.amount if t.transaction_type == "received" else -t.amount
    return round(balance, 2)


@router.get("/", response_model=List[schemas.BankAccountOut])
def list_bank_accounts(db: Session = Depends(get_db)):
    return db.query(models.BankAccount).order_by(models.BankAccount.name).all()


@router.get("/summary")
def bank_accounts_summary(db: Session = Depends(get_db)):
    accounts = db.query(models.BankAccount).filter(models.BankAccount.is_active == True).all()
    result = []
    total_balance = 0.0
    for acct in accounts:
        bal = _running_balance(db, acct.id)
        total_balance += bal
        result.append({
            "id": acct.id,
            "name": acct.name,
            "bank_name": acct.bank_name,
            "account_type": acct.account_type,
            "current_balance": bal
        })
    return {"accounts": result, "total_balance": round(total_balance, 2)}


@router.get("/{account_id}", response_model=schemas.BankAccountOut)
def get_bank_account(account_id: int, db: Session = Depends(get_db)):
    acct = db.query(models.BankAccount).filter(models.BankAccount.id == account_id).first()
    if not acct:
        raise HTTPException(status_code=404, detail="Bank account not found")
    return acct


@router.get("/{account_id}/balance")
def get_balance(account_id: int, db: Session = Depends(get_db)):
    acct = db.query(models.BankAccount).filter(models.BankAccount.id == account_id).first()
    if not acct:
        raise HTTPException(status_code=404, detail="Bank account not found")
    return {"account_id": account_id, "balance": _running_balance(db, account_id)}


@router.post("/", response_model=schemas.BankAccountOut)
def create_bank_account(data: schemas.BankAccountCreate, db: Session = Depends(get_db)):
    acct = models.BankAccount(**data.model_dump())
    db.add(acct)
    db.commit()
    db.refresh(acct)
    return acct


@router.put("/{account_id}", response_model=schemas.BankAccountOut)
def update_bank_account(account_id: int, data: schemas.BankAccountCreate, db: Session = Depends(get_db)):
    acct = db.query(models.BankAccount).filter(models.BankAccount.id == account_id).first()
    if not acct:
        raise HTTPException(status_code=404, detail="Bank account not found")
    for k, v in data.model_dump().items():
        setattr(acct, k, v)
    db.commit()
    db.refresh(acct)
    return acct


@router.delete("/{account_id}")
def delete_bank_account(account_id: int, db: Session = Depends(get_db)):
    acct = db.query(models.BankAccount).filter(models.BankAccount.id == account_id).first()
    if not acct:
        raise HTTPException(status_code=404, detail="Bank account not found")
    db.delete(acct)
    db.commit()
    return {"ok": True}
