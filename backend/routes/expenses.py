from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from database import get_db
import models, schemas

router = APIRouter(prefix="/api/expenses", tags=["expenses"])

EXPENSE_CATEGORIES = [
    # General categories
    "office_expense", "rent", "salary", "fuel",
    "maintenance", "utilities", "travel", "marketing",
    "insurance",
    # Daily expense categories
    "labour_advance", "internet_bill", "sewa_bill", "worker_ticket",
    "supplier_purchase", "company_purchase", "material", "tools",
    "tea", "petrol", "parking", "labour_lunch",
    "courier", "supplies", "other",
]

CATEGORY_LABELS = {
    "office_expense":    "Office Expense",
    "rent":              "Rent",
    "salary":            "Salary",
    "fuel":              "Fuel",
    "maintenance":       "Maintenance",
    "utilities":         "Utilities",
    "travel":            "Travel",
    "marketing":         "Marketing",
    "insurance":         "Insurance",
    "labour_advance":    "Labour Advance",
    "internet_bill":     "Internet / Landline Bill",
    "sewa_bill":         "SEWA Bill",
    "worker_ticket":     "Worker Ticket / Visa / Travel",
    "supplier_purchase": "Supplier Purchase",
    "company_purchase":  "Company Purchase",
    "material":          "Material",
    "tools":             "Tools",
    "tea":               "Tea / Refreshments",
    "petrol":            "Petrol",
    "parking":           "Parking",
    "labour_lunch":      "Labour Lunch",
    "courier":           "Courier",
    "supplies":          "Supplies",
    "other":             "Other",
    # legacy
    "other_daily":       "Other (Daily)",
    "custom":            "Custom",
}


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
    return {
        "categories": EXPENSE_CATEGORIES,
        "labels": CATEGORY_LABELS,
    }


@router.get("/parties")
def get_parties(db: Session = Depends(get_db)):
    """Return sorted list of distinct party names saved on expenses."""
    rows = (
        db.query(models.Expense.party_name)
        .filter(models.Expense.party_name != None)
        .filter(models.Expense.party_name != "")
        .distinct()
        .all()
    )
    names = sorted({r[0].strip() for r in rows if r[0] and r[0].strip()})
    return {"parties": names}


@router.get("/", response_model=List[schemas.ExpenseOut])
def list_expenses(
    category: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    expense_type: Optional[str] = None,
    payment_type: Optional[str] = None,   # "cash" | "bank"
    bank_account_id: Optional[int] = None,
    db: Session = Depends(get_db),
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
    if payment_type == "cash":
        q = q.filter(models.Expense.payment_method == "cash")
    elif payment_type == "bank":
        q = q.filter(models.Expense.payment_method != "cash")
    if bank_account_id:
        q = q.filter(models.Expense.bank_account_id == bank_account_id)
    return q.order_by(models.Expense.date.desc(), models.Expense.id.desc()).all()


@router.get("/summary")
def expense_summary(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    payment_type: Optional[str] = None,
    bank_account_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.Expense)
    if date_from:
        q = q.filter(models.Expense.date >= datetime.fromisoformat(date_from))
    if date_to:
        q = q.filter(models.Expense.date <= datetime.fromisoformat(date_to))
    if payment_type == "cash":
        q = q.filter(models.Expense.payment_method == "cash")
    elif payment_type == "bank":
        q = q.filter(models.Expense.payment_method != "cash")
    if bank_account_id:
        q = q.filter(models.Expense.bank_account_id == bank_account_id)

    expenses = q.all()
    total = sum(e.amount for e in expenses)
    by_category: dict = {}
    for e in expenses:
        by_category[e.category] = by_category.get(e.category, 0.0) + e.amount

    return {
        "total": round(total, 2),
        "count": len(expenses),
        "by_category": {k: round(v, 2) for k, v in sorted(by_category.items(), key=lambda x: -x[1])},
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
        party_name=(data.party_name or "").strip(),
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
            party_name=(data.party_name or "").strip(),
            reference=data.reference or "",
            balance_after=0.0,
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
    e.party_name = (data.party_name or "").strip()
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
