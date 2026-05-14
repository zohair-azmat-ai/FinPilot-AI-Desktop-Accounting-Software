from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class Company(Base):
    __tablename__ = "companies"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, default="My Company")
    trn = Column(String, default="")
    address = Column(Text, default="")
    phone = Column(String, default="")
    email = Column(String, default="")
    letterhead_mode = Column(Boolean, default=True)
    vat_rate = Column(Float, default=5.0)
    logo_path = Column(String, default="")
    invoice_prefix = Column(String, default="")
    invoice_current_number = Column(Integer, default=0)
    dn_prefix = Column(String, default="DN-")
    dn_current_number = Column(Integer, default=0)
    show_dn_stamp = Column(Boolean, default=False)
    quotation_prefix = Column(String, default="QUO-")
    quotation_current_number = Column(Integer, default=0)
    po_prefix = Column(String, default="PO-")
    po_current_number = Column(Integer, default=0)
    show_lpo_in_statement = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Customer(Base):
    __tablename__ = "customers"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    trn = Column(String, default="")
    attn = Column(String, default="")
    phone = Column(String, default="")
    email = Column(String, default="")
    address = Column(Text, default="")
    po_box = Column(String, nullable=True, default="")
    opening_balance = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    deleted_at = Column(String, nullable=True, default=None)

    invoices = relationship("Invoice", back_populates="customer")
    payments = relationship("Payment", back_populates="customer")
    ledger_entries = relationship("LedgerEntry", back_populates="customer")


class Supplier(Base):
    __tablename__ = "suppliers"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    trn = Column(String, default="")
    attn = Column(String, default="")
    phone = Column(String, default="")
    email = Column(String, default="")
    address = Column(Text, default="")
    opening_balance = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    deleted_at = Column(String, nullable=True, default=None)

    payments = relationship("Payment", back_populates="supplier")
    bills = relationship("SupplierBill", back_populates="supplier", cascade="all, delete-orphan")
    supplier_payments = relationship("SupplierPayment", back_populates="supplier", cascade="all, delete-orphan")


class Item(Base):
    __tablename__ = "items"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    unit = Column(String, default="Nos")
    price = Column(Float, default=0.0)
    vat_applicable = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Quotation(Base):
    __tablename__ = "quotations"
    id = Column(Integer, primary_key=True, index=True)
    quotation_number = Column(String, unique=True, nullable=False)
    customer_id = Column(Integer, ForeignKey("customers.id"))
    date = Column(DateTime, default=datetime.utcnow)
    valid_until = Column(DateTime, nullable=True)
    status = Column(String, default="draft")
    subtotal = Column(Float, default=0.0)
    vat_amount = Column(Float, default=0.0)
    discount = Column(Float, default=0.0)
    total = Column(Float, default=0.0)
    notes = Column(Text, default="")
    payment_terms = Column(String, default="")
    delivery = Column(String, default="")
    include_stamp = Column(Boolean, default=False)
    letterhead = Column(Boolean, default=True)
    converted_to_invoice = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    deleted_at = Column(String, nullable=True, default=None)

    customer = relationship("Customer")
    items = relationship("QuotationItem", back_populates="quotation", cascade="all, delete-orphan")


class QuotationItem(Base):
    __tablename__ = "quotation_items"
    id = Column(Integer, primary_key=True, index=True)
    quotation_id = Column(Integer, ForeignKey("quotations.id"))
    item_id = Column(Integer, ForeignKey("items.id"), nullable=True)
    description = Column(String, nullable=False)
    quantity = Column(Float, default=1.0)
    unit_price = Column(Float, default=0.0)
    vat_applicable = Column(Boolean, default=True)
    vat_amount = Column(Float, default=0.0)
    total = Column(Float, default=0.0)

    quotation = relationship("Quotation", back_populates="items")
    item = relationship("Item")


class Invoice(Base):
    __tablename__ = "invoices"
    id = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String, unique=True, nullable=False)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    date = Column(DateTime, default=datetime.utcnow)
    due_date = Column(DateTime, nullable=True)
    status = Column(String, default="unpaid")
    subtotal = Column(Float, default=0.0)
    vat_amount = Column(Float, default=0.0)
    discount = Column(Float, default=0.0)
    total = Column(Float, default=0.0)
    amount_paid = Column(Float, default=0.0)
    balance_due = Column(Float, default=0.0)
    notes = Column(Text, default="")
    letterhead = Column(Boolean, default=True)
    lpo_no = Column(String, default="")
    do_no = Column(String, default="")
    quotation_id = Column(Integer, ForeignKey("quotations.id"), nullable=True)
    is_cash = Column(Boolean, default=False)
    include_stamp = Column(Boolean, default=False)
    require_customer_signature = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    deleted_at = Column(String, nullable=True, default=None)

    customer = relationship("Customer", back_populates="invoices")
    items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="invoice")
    ledger_entries = relationship("LedgerEntry", back_populates="invoice")


class InvoiceItem(Base):
    __tablename__ = "invoice_items"
    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"))
    item_id = Column(Integer, ForeignKey("items.id"), nullable=True)
    description = Column(String, nullable=False)
    quantity = Column(Float, default=1.0)
    unit_price = Column(Float, default=0.0)
    vat_applicable = Column(Boolean, default=True)
    vat_amount = Column(Float, default=0.0)
    total = Column(Float, default=0.0)
    deleted_at = Column(String, nullable=True, default=None)
    updated_at = Column(String, nullable=True, default=None)

    invoice = relationship("Invoice", back_populates="items")
    item = relationship("Item")


class Payment(Base):
    __tablename__ = "payments"
    id = Column(Integer, primary_key=True, index=True)
    payment_number = Column(String, unique=True, nullable=False)
    payment_direction = Column(String, default="received")  # received / paid
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    bank_account_id = Column(Integer, ForeignKey("bank_accounts.id"), nullable=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=True)  # legacy single-invoice
    is_advance = Column(Boolean, default=False)
    date = Column(DateTime, default=datetime.utcnow)
    amount = Column(Float, default=0.0)
    method = Column(String, default="cash")
    reference = Column(String, default="")
    notes = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    deleted_at = Column(String, nullable=True, default=None)

    customer = relationship("Customer", back_populates="payments")
    supplier = relationship("Supplier", back_populates="payments")
    bank_account = relationship("BankAccount")
    invoice = relationship("Invoice", back_populates="payments")
    ledger_entries = relationship("LedgerEntry", back_populates="payment")
    allocations = relationship("PaymentAllocation", back_populates="payment", cascade="all, delete-orphan")


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"
    id = Column(Integer, primary_key=True, index=True)
    date = Column(DateTime, default=datetime.utcnow)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=True)
    payment_id = Column(Integer, ForeignKey("payments.id"), nullable=True)
    description = Column(String, nullable=False)
    debit = Column(Float, default=0.0)
    credit = Column(Float, default=0.0)
    balance = Column(Float, default=0.0)
    entry_type = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    customer = relationship("Customer", back_populates="ledger_entries")
    invoice = relationship("Invoice", back_populates="ledger_entries")
    payment = relationship("Payment", back_populates="ledger_entries")


class PaymentAllocation(Base):
    __tablename__ = "payment_allocations"
    id = Column(Integer, primary_key=True, index=True)
    payment_id = Column(Integer, ForeignKey("payments.id"), nullable=False)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False)
    amount = Column(Float, default=0.0)

    payment = relationship("Payment", back_populates="allocations")
    invoice = relationship("Invoice")


class BankAccount(Base):
    __tablename__ = "bank_accounts"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    bank_name = Column(String, default="")
    account_number = Column(String, default="")
    iban = Column(String, default="")
    account_type = Column(String, default="bank")  # bank, cash
    opening_balance = Column(Float, default=0.0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    transactions = relationship("BankTransaction", back_populates="bank_account", cascade="all, delete-orphan")
    cheques = relationship("Cheque", back_populates="bank_account")
    expenses = relationship("Expense", back_populates="bank_account")


class BankTransaction(Base):
    __tablename__ = "bank_transactions"
    id = Column(Integer, primary_key=True, index=True)
    transaction_number = Column(String, unique=True, nullable=False)
    bank_account_id = Column(Integer, ForeignKey("bank_accounts.id"), nullable=False)
    date = Column(DateTime, default=datetime.utcnow)
    transaction_type = Column(String, nullable=False)  # received, paid
    method = Column(String, default="bank_transfer")   # cash, bank_transfer, cheque, online
    description = Column(String, nullable=False)
    amount = Column(Float, default=0.0)
    party_name = Column(String, default="")
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=True)
    cheque_id = Column(Integer, ForeignKey("cheques.id"), nullable=True)
    reference = Column(String, default="")
    notes = Column(Text, default="")
    balance_after = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    bank_account = relationship("BankAccount", back_populates="transactions")
    customer = relationship("Customer")
    supplier = relationship("Supplier")
    invoice = relationship("Invoice")


class Cheque(Base):
    __tablename__ = "cheques"
    id = Column(Integer, primary_key=True, index=True)
    cheque_number = Column(String, nullable=False)
    cheque_date = Column(DateTime, nullable=False)
    bank_name = Column(String, default="")
    party_name = Column(String, default="")
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    bank_account_id = Column(Integer, ForeignKey("bank_accounts.id"), nullable=True)
    amount = Column(Float, default=0.0)
    cheque_type = Column(String, default="received")  # received, issued
    status = Column(String, default="pending")         # pending, cleared, bounced, cancelled
    notes = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    customer = relationship("Customer")
    supplier = relationship("Supplier")
    bank_account = relationship("BankAccount", back_populates="cheques")


class DeliveryNote(Base):
    __tablename__ = "delivery_notes"
    id = Column(Integer, primary_key=True, index=True)
    dn_number = Column(String, unique=True, nullable=False)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    date = Column(DateTime, default=datetime.utcnow)
    remarks = Column(Text, default="")
    status = Column(String, default="draft")  # draft, delivered
    letterhead = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    deleted_at = Column(String, nullable=True, default=None)

    customer = relationship("Customer")
    items = relationship("DeliveryNoteItem", back_populates="delivery_note", cascade="all, delete-orphan")


class DeliveryNoteItem(Base):
    __tablename__ = "delivery_note_items"
    id = Column(Integer, primary_key=True, index=True)
    dn_id = Column(Integer, ForeignKey("delivery_notes.id"))
    description = Column(String, nullable=False)
    quantity = Column(Float, default=1.0)
    remarks = Column(String, default="")

    delivery_note = relationship("DeliveryNote", back_populates="items")


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"
    id = Column(Integer, primary_key=True, index=True)
    po_number = Column(String, unique=True, nullable=False)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    date = Column(DateTime, default=datetime.utcnow)
    delivery_date = Column(DateTime, nullable=True)
    payment_terms = Column(String, default="")
    delivery_terms = Column(String, default="")
    notes = Column(Text, default="")
    subtotal = Column(Float, default=0.0)
    vat_amount = Column(Float, default=0.0)
    total = Column(Float, default=0.0)
    include_stamp = Column(Boolean, default=False)
    letterhead = Column(Boolean, default=True)
    status = Column(String, default="draft")  # draft, sent, received
    created_at = Column(DateTime, default=datetime.utcnow)

    deleted_at = Column(String, nullable=True, default=None)

    supplier = relationship("Supplier")
    items = relationship("PurchaseOrderItem", back_populates="po", cascade="all, delete-orphan")


class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"
    id = Column(Integer, primary_key=True, index=True)
    po_id = Column(Integer, ForeignKey("purchase_orders.id"))
    description = Column(String, nullable=False)
    quantity = Column(Float, default=1.0)
    unit_price = Column(Float, default=0.0)
    vat_applicable = Column(Boolean, default=True)
    vat_amount = Column(Float, default=0.0)
    total = Column(Float, default=0.0)

    po = relationship("PurchaseOrder", back_populates="items")


class SupplierBill(Base):
    __tablename__ = "supplier_bills"
    id = Column(Integer, primary_key=True, index=True)
    bill_number = Column(String, unique=True, nullable=False)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    date = Column(DateTime, default=datetime.utcnow)
    due_date = Column(DateTime, nullable=True)
    trn = Column(String, default="")
    lpo_no = Column(String, default="")
    notes = Column(Text, default="")
    subtotal = Column(Float, default=0.0)
    vat_amount = Column(Float, default=0.0)
    total = Column(Float, default=0.0)
    amount_paid = Column(Float, default=0.0)
    balance_due = Column(Float, default=0.0)
    status = Column(String, default="unpaid")  # unpaid, partial, paid
    created_at = Column(DateTime, default=datetime.utcnow)

    deleted_at = Column(String, nullable=True, default=None)

    supplier = relationship("Supplier", back_populates="bills")
    items = relationship("SupplierBillItem", back_populates="bill", cascade="all, delete-orphan")
    supplier_payment_allocations = relationship("SupplierPaymentAllocation", back_populates="bill", cascade="all, delete-orphan")


class SupplierBillItem(Base):
    __tablename__ = "supplier_bill_items"
    id = Column(Integer, primary_key=True, index=True)
    bill_id = Column(Integer, ForeignKey("supplier_bills.id"))
    description = Column(String, nullable=False)
    quantity = Column(Float, default=1.0)
    unit_price = Column(Float, default=0.0)
    vat_applicable = Column(Boolean, default=True)
    vat_amount = Column(Float, default=0.0)
    total = Column(Float, default=0.0)

    bill = relationship("SupplierBill", back_populates="items")


class SupplierPayment(Base):
    __tablename__ = "supplier_payments"
    id = Column(Integer, primary_key=True, index=True)
    payment_number = Column(String, unique=True, nullable=False)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    date = Column(DateTime, default=datetime.utcnow)
    amount = Column(Float, default=0.0)
    method = Column(String, default="cash")
    reference = Column(String, default="")
    notes = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    supplier = relationship("Supplier", back_populates="supplier_payments")
    allocations = relationship("SupplierPaymentAllocation", back_populates="payment", cascade="all, delete-orphan")


class SupplierPaymentAllocation(Base):
    __tablename__ = "supplier_payment_allocations"
    id = Column(Integer, primary_key=True, index=True)
    payment_id = Column(Integer, ForeignKey("supplier_payments.id"), nullable=False)
    bill_id = Column(Integer, ForeignKey("supplier_bills.id"), nullable=False)
    amount = Column(Float, default=0.0)

    payment = relationship("SupplierPayment", back_populates="allocations")
    bill = relationship("SupplierBill", back_populates="supplier_payment_allocations")


class Expense(Base):
    __tablename__ = "expenses"
    id = Column(Integer, primary_key=True, index=True)
    expense_number = Column(String, unique=True, nullable=False)
    date = Column(DateTime, default=datetime.utcnow)
    category = Column(String, nullable=False)  # office_expense, rent, salary, fuel, maintenance, custom
    description = Column(String, nullable=False)
    amount = Column(Float, default=0.0)
    payment_method = Column(String, default="cash")  # cash, bank_transfer, cheque
    bank_account_id = Column(Integer, ForeignKey("bank_accounts.id"), nullable=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    reference = Column(String, default="")
    notes = Column(Text, default="")
    expense_type = Column(String, default="general")  # general, daily
    created_at = Column(DateTime, default=datetime.utcnow)

    bank_account = relationship("BankAccount", back_populates="expenses")
    supplier = relationship("Supplier")
