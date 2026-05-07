from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from database import get_db
import models, schemas
from pdf_generator import generate_payment_voucher_pdf, generate_receipt_voucher_pdf

router = APIRouter(prefix="/api/payments", tags=["payments"])


def _next_payment_number(db: Session) -> str:
    last = db.query(models.Payment).order_by(models.Payment.id.desc()).first()
    if not last:
        return "PMT-0001"
    try:
        num = int(last.payment_number.split("-")[-1]) + 1
    except Exception:
        num = 1
    return f"PMT-{num:04d}"


def _recalc_ledger_for_customer(db: Session, customer_id: int):
    customer = db.query(models.Customer).filter(models.Customer.id == customer_id).first()
    opening = customer.opening_balance if customer else 0.0
    entries = (
        db.query(models.LedgerEntry)
        .filter(models.LedgerEntry.customer_id == customer_id)
        .order_by(models.LedgerEntry.date, models.LedgerEntry.id)
        .all()
    )
    running = opening
    for entry in entries:
        running = round(running + entry.debit - entry.credit, 2)
        entry.balance = running


def _recalc_ledger_for_supplier(db: Session, supplier_id: int):
    supplier = db.query(models.Supplier).filter(models.Supplier.id == supplier_id).first()
    opening = supplier.opening_balance if supplier else 0.0
    entries = (
        db.query(models.LedgerEntry)
        .filter(models.LedgerEntry.supplier_id == supplier_id)
        .order_by(models.LedgerEntry.date, models.LedgerEntry.id)
        .all()
    )
    # Supplier payable: opening = amount we owe, payments = debit (reduce payable)
    running = opening
    for entry in entries:
        running = round(running - entry.debit + entry.credit, 2)
        entry.balance = running


def _recalc_bank_balances(db: Session, bank_account_id: int):
    from routes.bank_transactions import _recalc_balances
    _recalc_balances(db, bank_account_id)


@router.get("/", response_model=List[schemas.PaymentOut])
def list_payments(
    customer_id: Optional[int] = None,
    supplier_id: Optional[int] = None,
    payment_direction: Optional[str] = None,
    db: Session = Depends(get_db)
):
    q = db.query(models.Payment)
    if customer_id:
        q = q.filter(models.Payment.customer_id == customer_id)
    if supplier_id:
        q = q.filter(models.Payment.supplier_id == supplier_id)
    if payment_direction:
        q = q.filter(models.Payment.payment_direction == payment_direction)
    return q.order_by(models.Payment.id.desc()).all()


@router.get("/{payment_id}", response_model=schemas.PaymentOut)
def get_payment(payment_id: int, db: Session = Depends(get_db)):
    p = db.query(models.Payment).filter(models.Payment.id == payment_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")
    return p


@router.post("/", response_model=schemas.PaymentOut)
def create_payment(data: schemas.PaymentCreate, db: Session = Depends(get_db)):
    direction = data.payment_direction or "received"

    payment = models.Payment(
        payment_number=_next_payment_number(db),
        payment_direction=direction,
        customer_id=data.customer_id,
        supplier_id=data.supplier_id,
        bank_account_id=data.bank_account_id,
        is_advance=data.is_advance or False,
        date=data.date or datetime.utcnow(),
        amount=data.amount,
        method=data.method or "cash",
        reference=data.reference or "",
        notes=data.notes or ""
    )
    db.add(payment)
    db.flush()

    # ── Multi-invoice allocations ──────────────────────────────────────────
    allocations = data.allocations or []
    for alloc in allocations:
        invoice = db.query(models.Invoice).filter(models.Invoice.id == alloc.invoice_id).first()
        if invoice:
            inv_alloc = models.PaymentAllocation(
                payment_id=payment.id,
                invoice_id=alloc.invoice_id,
                amount=alloc.amount
            )
            db.add(inv_alloc)
            invoice.amount_paid = round(invoice.amount_paid + alloc.amount, 2)
            invoice.balance_due = round(invoice.total - invoice.amount_paid, 2)
            if invoice.balance_due <= 0:
                invoice.status = "paid"
                invoice.balance_due = 0.0
            else:
                invoice.status = "partial"

    # ── Double-entry ledger ────────────────────────────────────────────────
    if direction == "received" and data.customer_id:
        # Dr Bank/Cash, Cr Customer A/R
        desc = f"Receipt {payment.payment_number}"
        if payment.reference:
            desc += f" (Ref: {payment.reference})"
        if data.is_advance:
            desc += " [Advance]"
        entry = models.LedgerEntry(
            date=payment.date,
            customer_id=data.customer_id,
            payment_id=payment.id,
            description=desc,
            debit=0.0,
            credit=data.amount,
            balance=0.0,
            entry_type="receipt"
        )
        db.add(entry)
        db.flush()
        _recalc_ledger_for_customer(db, data.customer_id)

    elif direction == "paid" and data.supplier_id:
        # Dr Supplier A/P, Cr Bank/Cash
        desc = f"Payment {payment.payment_number}"
        if payment.reference:
            desc += f" (Ref: {payment.reference})"
        entry = models.LedgerEntry(
            date=payment.date,
            supplier_id=data.supplier_id,
            payment_id=payment.id,
            description=desc,
            debit=data.amount,
            credit=0.0,
            balance=0.0,
            entry_type="payment"
        )
        db.add(entry)
        db.flush()
        _recalc_ledger_for_supplier(db, data.supplier_id)

    # ── Bank account transaction ───────────────────────────────────────────
    if data.bank_account_id:
        from routes.bank_transactions import _recalc_balances, _next_txn_number
        party_name = ""
        if direction == "received" and data.customer_id:
            cust = db.query(models.Customer).filter(models.Customer.id == data.customer_id).first()
            party_name = cust.name if cust else ""
        elif direction == "paid" and data.supplier_id:
            supp = db.query(models.Supplier).filter(models.Supplier.id == data.supplier_id).first()
            party_name = supp.name if supp else ""

        txn_desc = f"{'Receipt' if direction == 'received' else 'Payment'} - {payment.payment_number}"
        bank_txn = models.BankTransaction(
            transaction_number=_next_txn_number(db),
            bank_account_id=data.bank_account_id,
            date=payment.date,
            transaction_type="received" if direction == "received" else "paid",
            method=data.method or "bank_transfer",
            description=txn_desc,
            amount=data.amount,
            party_name=party_name,
            customer_id=data.customer_id if direction == "received" else None,
            supplier_id=data.supplier_id if direction == "paid" else None,
            reference=data.reference or "",
            notes=data.notes or "",
            balance_after=0.0
        )
        db.add(bank_txn)
        db.flush()
        _recalc_balances(db, data.bank_account_id)

    db.commit()
    db.refresh(payment)
    return payment


@router.delete("/{payment_id}")
def delete_payment(payment_id: int, db: Session = Depends(get_db)):
    p = db.query(models.Payment).filter(models.Payment.id == payment_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")

    # Reverse invoice allocations
    for alloc in p.allocations:
        invoice = db.query(models.Invoice).filter(models.Invoice.id == alloc.invoice_id).first()
        if invoice:
            invoice.amount_paid = max(0, round(invoice.amount_paid - alloc.amount, 2))
            invoice.balance_due = round(invoice.total - invoice.amount_paid, 2)
            if invoice.balance_due <= 0:
                invoice.status = "paid"
            elif invoice.amount_paid > 0:
                invoice.status = "partial"
            else:
                invoice.status = "unpaid"

    customer_id = p.customer_id
    supplier_id = p.supplier_id
    bank_account_id = p.bank_account_id
    payment_number = p.payment_number
    payment_direction = p.payment_direction

    db.query(models.LedgerEntry).filter(models.LedgerEntry.payment_id == payment_id).delete()
    db.delete(p)
    db.flush()

    # Remove auto-created bank transaction for this payment
    if bank_account_id:
        expected_desc = f"{'Receipt' if payment_direction == 'received' else 'Payment'} - {payment_number}"
        orphan_txn = db.query(models.BankTransaction).filter(
            models.BankTransaction.bank_account_id == bank_account_id,
            models.BankTransaction.description == expected_desc
        ).first()
        if orphan_txn:
            db.delete(orphan_txn)
            db.flush()

    if customer_id:
        _recalc_ledger_for_customer(db, customer_id)
    if supplier_id:
        _recalc_ledger_for_supplier(db, supplier_id)
    if bank_account_id:
        from routes.bank_transactions import _recalc_balances
        _recalc_balances(db, bank_account_id)

    db.commit()
    return {"ok": True}


@router.get("/{payment_id}/pdf")
def download_payment_pdf(payment_id: int, db: Session = Depends(get_db)):
    p = db.query(models.Payment).filter(models.Payment.id == payment_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")

    company = db.query(models.Company).first()
    comp_dict = {}
    if company:
        comp_dict = {
            "name": company.name, "trn": company.trn,
            "address": company.address, "phone": company.phone, "email": company.email
        }

    alloc_summaries = []
    for alloc in p.allocations:
        inv = db.query(models.Invoice).filter(models.Invoice.id == alloc.invoice_id).first()
        if inv:
            alloc_summaries.append({"invoice_number": inv.invoice_number, "amount": alloc.amount})

    if p.payment_direction == "received":
        party_name = p.customer.name if p.customer else ""
        payment_data = {
            "payment_number": p.payment_number,
            "date": p.date.strftime("%d %b %Y"),
            "customer_name": party_name,
            "amount": p.amount,
            "method": p.method,
            "reference": p.reference,
            "notes": p.notes,
            "is_advance": p.is_advance,
            "allocations": alloc_summaries,
        }
        filepath = generate_receipt_voucher_pdf(payment_data, comp_dict)
        return FileResponse(filepath, media_type="application/pdf", filename=f"Receipt_{p.payment_number}.pdf")
    else:
        party_name = p.supplier.name if p.supplier else ""
        payment_data = {
            "payment_number": p.payment_number,
            "date": p.date.strftime("%d %b %Y"),
            "customer_name": party_name,
            "invoice_number": alloc_summaries[0]["invoice_number"] if alloc_summaries else "General Payment",
            "amount": p.amount,
            "method": p.method,
            "reference": p.reference,
            "notes": p.notes,
        }
        filepath = generate_payment_voucher_pdf(payment_data, comp_dict)
        return FileResponse(filepath, media_type="application/pdf", filename=f"Payment_{p.payment_number}.pdf")
