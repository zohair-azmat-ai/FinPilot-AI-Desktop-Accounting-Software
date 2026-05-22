from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import datetime
from collections import defaultdict
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


@router.get("/vat/pdf")
def vat_report_pdf(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db)
):
    from pdf_generator import generate_vat_report_pdf
    q = db.query(models.Invoice).filter(models.Invoice.deleted_at == None)
    if date_from:
        q = q.filter(models.Invoice.date >= datetime.fromisoformat(date_from))
    if date_to:
        q = q.filter(models.Invoice.date <= datetime.fromisoformat(date_to))
    invoices = q.order_by(models.Invoice.date).all()
    total_taxable = sum(inv.subtotal for inv in invoices)
    total_vat     = sum(inv.vat_amount for inv in invoices)
    company = db.query(models.Company).first()
    comp_dict = {}
    if company:
        comp_dict = {"name": company.name, "trn": company.trn or "", "address": company.address or ""}
    data = {
        "total_taxable": round(total_taxable, 2),
        "total_vat":     round(total_vat, 2),
        "period":        {"from": date_from, "to": date_to},
        "invoices": [
            {
                "invoice_number": inv.invoice_number,
                "date":           inv.date.strftime("%d %b %Y"),
                "customer_name":  inv.customer.name if inv.customer else "",
                "customer_trn":   (inv.customer.trn if inv.customer else "") or "",
                "subtotal":       inv.subtotal,
                "vat_amount":     inv.vat_amount,
                "total":          inv.total,
            } for inv in invoices
        ],
    }
    path = generate_vat_report_pdf(data, comp_dict)
    return FileResponse(path, media_type="application/pdf", filename="VAT_Report.pdf")


@router.get("/profit-loss")
def profit_loss_report(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db)
):
    q_inv  = db.query(models.Invoice).filter(models.Invoice.deleted_at == None)
    q_exp  = db.query(models.Expense)
    q_bill = db.query(models.SupplierBill).filter(models.SupplierBill.deleted_at == None)

    if date_from:
        df = datetime.fromisoformat(date_from)
        q_inv  = q_inv.filter(models.Invoice.date >= df)
        q_exp  = q_exp.filter(models.Expense.date >= df)
        q_bill = q_bill.filter(models.SupplierBill.date >= df)
    if date_to:
        dt = datetime.fromisoformat(date_to)
        q_inv  = q_inv.filter(models.Invoice.date <= dt)
        q_exp  = q_exp.filter(models.Expense.date <= dt)
        q_bill = q_bill.filter(models.SupplierBill.date <= dt)

    invoices = q_inv.all()
    expenses = q_exp.all()
    bills    = q_bill.all()

    total_sales          = sum(inv.subtotal   for inv in invoices)
    total_vat_collected  = sum(inv.vat_amount for inv in invoices)
    total_daily_expenses = sum(exp.amount     for exp in expenses)
    total_supplier_bills = sum(b.subtotal     for b in bills)
    total_expenses       = total_daily_expenses + total_supplier_bills
    net_profit           = total_sales - total_expenses

    monthly = defaultdict(lambda: {"sales": 0.0, "expenses": 0.0})
    for inv in invoices:
        monthly[inv.date.strftime("%Y-%m")]["sales"] += inv.subtotal
    for exp in expenses:
        monthly[exp.date.strftime("%Y-%m")]["expenses"] += exp.amount
    for b in bills:
        monthly[b.date.strftime("%Y-%m")]["expenses"] += b.subtotal

    cat_totals = defaultdict(float)
    for exp in expenses:
        cat_totals[exp.category] += exp.amount

    return {
        "period":               {"from": date_from, "to": date_to},
        "total_sales":          round(total_sales, 2),
        "total_vat_collected":  round(total_vat_collected, 2),
        "total_daily_expenses": round(total_daily_expenses, 2),
        "total_supplier_bills": round(total_supplier_bills, 2),
        "total_expenses":       round(total_expenses, 2),
        "net_profit":           round(net_profit, 2),
        "invoice_count":        len(invoices),
        "expense_count":        len(expenses),
        "monthly_breakdown": sorted([
            {
                "month":    k,
                "sales":    round(v["sales"], 2),
                "expenses": round(v["expenses"], 2),
                "net":      round(v["sales"] - v["expenses"], 2),
            }
            for k, v in monthly.items()
        ], key=lambda x: x["month"]),
        "expense_categories": [
            {"category": k, "total": round(v, 2)}
            for k, v in sorted(cat_totals.items())
        ],
    }


@router.get("/profit-loss/pdf")
def profit_loss_pdf(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db)
):
    from pdf_generator import generate_pl_pdf
    pl = profit_loss_report(date_from=date_from, date_to=date_to, db=db)
    company = db.query(models.Company).first()
    comp_dict = {}
    if company:
        comp_dict = {"name": company.name, "trn": company.trn or "", "address": company.address or ""}
    path = generate_pl_pdf(pl, comp_dict)
    return FileResponse(path, media_type="application/pdf", filename="PL_Report.pdf")


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
