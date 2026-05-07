from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import datetime
from database import get_db
import models

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/dashboard")
def get_dashboard(db: Session = Depends(get_db)):
    total_invoiced = db.query(func.sum(models.Invoice.total)).scalar() or 0.0
    total_collected = db.query(func.sum(models.Payment.amount)).scalar() or 0.0
    outstanding = db.query(func.sum(models.Invoice.balance_due)).scalar() or 0.0
    invoice_count = db.query(func.count(models.Invoice.id)).scalar() or 0
    customer_count = db.query(func.count(models.Customer.id)).scalar() or 0
    overdue_count = (
        db.query(func.count(models.Invoice.id))
        .filter(models.Invoice.status.in_(["unpaid", "partial"]))
        .filter(models.Invoice.due_date < datetime.utcnow())
        .scalar() or 0
    )

    recent_invoices = (
        db.query(models.Invoice)
        .order_by(models.Invoice.id.desc())
        .limit(5)
        .all()
    )

    return {
        "total_invoiced": round(total_invoiced, 2),
        "total_collected": round(total_collected, 2),
        "outstanding": round(outstanding, 2),
        "invoice_count": invoice_count,
        "customer_count": customer_count,
        "overdue_count": overdue_count,
        "recent_invoices": [
            {
                "id": inv.id,
                "invoice_number": inv.invoice_number,
                "customer_name": inv.customer.name if inv.customer else "",
                "total": inv.total,
                "balance_due": inv.balance_due,
                "status": inv.status,
                "date": inv.date.strftime("%d %b %Y")
            } for inv in recent_invoices
        ]
    }


@router.get("/sales")
def sales_report(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db)
):
    q = db.query(models.Invoice)
    if date_from:
        q = q.filter(models.Invoice.date >= datetime.fromisoformat(date_from))
    if date_to:
        q = q.filter(models.Invoice.date <= datetime.fromisoformat(date_to))

    invoices = q.order_by(models.Invoice.date.desc()).all()
    total_sales = sum(inv.subtotal for inv in invoices)
    total_vat = sum(inv.vat_amount for inv in invoices)
    total_discount = sum(inv.discount for inv in invoices)
    total_net = sum(inv.total for inv in invoices)

    return {
        "total_sales": round(total_sales, 2),
        "total_vat": round(total_vat, 2),
        "total_discount": round(total_discount, 2),
        "total_net": round(total_net, 2),
        "invoice_count": len(invoices),
        "invoices": [
            {
                "invoice_number": inv.invoice_number,
                "date": inv.date.strftime("%d %b %Y"),
                "customer_name": inv.customer.name if inv.customer else "",
                "subtotal": inv.subtotal,
                "vat_amount": inv.vat_amount,
                "discount": inv.discount,
                "total": inv.total,
                "status": inv.status
            } for inv in invoices
        ]
    }


@router.get("/outstanding")
def outstanding_report(db: Session = Depends(get_db)):
    invoices = (
        db.query(models.Invoice)
        .filter(models.Invoice.balance_due > 0)
        .order_by(models.Invoice.due_date)
        .all()
    )
    total_outstanding = sum(inv.balance_due for inv in invoices)

    return {
        "total_outstanding": round(total_outstanding, 2),
        "invoice_count": len(invoices),
        "invoices": [
            {
                "invoice_number": inv.invoice_number,
                "date": inv.date.strftime("%d %b %Y"),
                "due_date": inv.due_date.strftime("%d %b %Y") if inv.due_date else "",
                "customer_name": inv.customer.name if inv.customer else "",
                "total": inv.total,
                "amount_paid": inv.amount_paid,
                "balance_due": inv.balance_due,
                "status": inv.status
            } for inv in invoices
        ]
    }


@router.get("/vat")
def vat_report(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db)
):
    q = db.query(models.Invoice)
    if date_from:
        q = q.filter(models.Invoice.date >= datetime.fromisoformat(date_from))
    if date_to:
        q = q.filter(models.Invoice.date <= datetime.fromisoformat(date_to))

    invoices = q.order_by(models.Invoice.date).all()
    total_taxable = sum(inv.subtotal for inv in invoices)
    total_vat = sum(inv.vat_amount for inv in invoices)

    return {
        "total_taxable": round(total_taxable, 2),
        "total_vat": round(total_vat, 2),
        "invoice_count": len(invoices),
        "period": {"from": date_from, "to": date_to},
        "invoices": [
            {
                "invoice_number": inv.invoice_number,
                "date": inv.date.strftime("%d %b %Y"),
                "customer_name": inv.customer.name if inv.customer else "",
                "customer_trn": inv.customer.trn if inv.customer else "",
                "subtotal": inv.subtotal,
                "vat_amount": inv.vat_amount,
                "total": inv.total
            } for inv in invoices
        ]
    }


@router.get("/customer-balance")
def customer_balance_report(db: Session = Depends(get_db)):
    customers = db.query(models.Customer).order_by(models.Customer.name).all()
    result = []
    total_balance = 0.0

    for customer in customers:
        total_invoiced = sum(inv.total for inv in customer.invoices)
        total_paid = sum(p.amount for p in customer.payments)
        balance = round(total_invoiced - total_paid + (customer.opening_balance or 0), 2)
        total_balance += balance
        result.append({
            "id": customer.id,
            "name": customer.name,
            "phone": customer.phone,
            "email": customer.email,
            "total_invoiced": round(total_invoiced, 2),
            "total_paid": round(total_paid, 2),
            "balance": balance
        })

    return {
        "total_balance": round(total_balance, 2),
        "customers": result
    }
