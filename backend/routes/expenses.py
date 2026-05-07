from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime
from database import get_db
import models, schemas

router = APIRouter(prefix="/api/expenses", tags=["expenses"])

EXPENSE_CATEGORIES = [
    "office_expense", "rent", "salary", "fuel",
    "maintenance", "utilities", "travel", "marketing",
    "insurance", "custom",
    "tea", "petrol", "parking", "labour_lunch",
    "courier", "supplies", "tools", "other_daily",
]


def _next_expense_number(db: Session) -> str:
    last = db.query(models.Expense).order_by(models.Expense.id.desc()).first()
    if not last:
        return "EXP-0001"
    try:
        num = int(last.expense_number.split("-")[-1]) + 1
    except Exception:
        num = 1
    return f"EXP-{num:04d}"


@router.get("/categories")
def get_categories():
    return {"categories": EXPENSE_CATEGORIES}


@router.get("/", response_model=List[schemas.ExpenseOut])
def list_expenses(
    category: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    expense_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    q = db.query(models.Expense)
    if category:
        q = q.filter(models.Expense.category == category)
    if date_from:
        q = q.filter(models.Expense.date >= datetime.fromisoformat(date_from))
    if date_to:
        q = q.filter(models.Expense.date <= datetime.fromisoformat(date_to))
    if expense_type:
        q = q.filter(models.Expense.expense_type == expense_type)
    return q.order_by(models.Expense.date.desc(), models.Expense.id.desc()).all()


@router.get("/summary")
def expense_summary(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db)
):
    q = db.query(models.Expense)
    if date_from:
        q = q.filter(models.Expense.date >= datetime.fromisoformat(date_from))
    if date_to:
        q = q.filter(models.Expense.date <= datetime.fromisoformat(date_to))
    expenses = q.all()

    total = sum(e.amount for e in expenses)
    by_category: dict = {}
    for e in expenses:
        by_category[e.category] = by_category.get(e.category, 0.0) + e.amount

    return {
        "total": round(total, 2),
        "count": len(expenses),
        "by_category": {k: round(v, 2) for k, v in sorted(by_category.items(), key=lambda x: -x[1])}
    }


@router.get("/{expense_id}", response_model=schemas.ExpenseOut)
def get_expense(expense_id: int, db: Session = Depends(get_db)):
    e = db.query(models.Expense).filter(models.Expense.id == expense_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Expense not found")
    return e


@router.post("/", response_model=schemas.ExpenseOut)
def create_expense(data: schemas.ExpenseCreate, db: Session = Depends(get_db)):
    expense = models.Expense(
        expense_number=_next_expense_number(db),
        date=data.date or datetime.utcnow(),
        category=data.category,
        description=data.description,
        amount=data.amount,
        payment_method=data.payment_method or "cash",
        bank_account_id=data.bank_account_id,
        supplier_id=data.supplier_id,
        reference=data.reference or "",
        notes=data.notes or "",
        expense_type=data.expense_type or "general",
    )
    db.add(expense)

    if data.bank_account_id and data.payment_method in ("bank_transfer", "cheque", "online"):
        from routes.bank_transactions import _next_txn_number, _recalc_balances
        txn = models.BankTransaction(
            transaction_number=_next_txn_number(db),
            bank_account_id=data.bank_account_id,
            date=data.date or datetime.utcnow(),
            transaction_type="paid",
            method=data.payment_method,
            description=f"Expense: {data.description}",
            amount=data.amount,
            party_name="",
            reference=data.reference or "",
            balance_after=0.0
        )
        db.add(txn)
        db.flush()
        _recalc_balances(db, data.bank_account_id)

    db.commit()
    db.refresh(expense)
    return expense


@router.put("/{expense_id}", response_model=schemas.ExpenseOut)
def update_expense(expense_id: int, data: schemas.ExpenseCreate, db: Session = Depends(get_db)):
    e = db.query(models.Expense).filter(models.Expense.id == expense_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Expense not found")
    e.date = data.date or e.date
    e.category = data.category
    e.description = data.description
    e.amount = data.amount
    e.payment_method = data.payment_method or "cash"
    e.bank_account_id = data.bank_account_id
    e.reference = data.reference or ""
    e.notes = data.notes or ""
    if data.expense_type:
        e.expense_type = data.expense_type
    db.commit()
    db.refresh(e)
    return e


@router.delete("/{expense_id}")
def delete_expense(expense_id: int, db: Session = Depends(get_db)):
    e = db.query(models.Expense).filter(models.Expense.id == expense_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Expense not found")
    db.delete(e)
    db.commit()
    return {"ok": True}
