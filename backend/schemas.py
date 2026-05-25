from pydantic import BaseModel, field_validator
from typing import Any, Optional, List
from datetime import datetime


def _str(v: Any) -> str:
    """Coerce None → empty string so mobile-created rows (which may have NULL
    text columns) don't break Pydantic serialisation."""
    return "" if v is None else str(v)


def _bool(v: Any) -> bool:
    return bool(v) if v is not None else False


def _float(v: Any) -> float:
    return float(v) if v is not None else 0.0


class CompanyBase(BaseModel):
    name: str
    trn: Optional[str] = ""
    address: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    letterhead_mode: Optional[bool] = True
    vat_rate: Optional[float] = 5.0
    logo_path: Optional[str] = ""
    invoice_prefix: Optional[str] = ""
    invoice_current_number: Optional[int] = 0
    dn_prefix: Optional[str] = ""
    dn_current_number: Optional[int] = 0
    dn_number_pad: Optional[int] = 4
    show_dn_stamp: Optional[bool] = False
    quotation_prefix: Optional[str] = "QUO-"
    quotation_current_number: Optional[int] = 0
    po_prefix: Optional[str] = "PO-"
    po_current_number: Optional[int] = 0
    show_lpo_in_statement: Optional[bool] = False

class CompanyCreate(CompanyBase):
    pass

class Company(CompanyBase):
    id: int
    created_at: datetime
    class Config:
        from_attributes = True


class CustomerBase(BaseModel):
    name: str
    trn: Optional[str] = ""
    attn: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    address: Optional[str] = ""
    po_box: Optional[str] = ""
    opening_balance: Optional[float] = 0.0
    payment_terms: Optional[str] = ""

class CustomerCreate(CustomerBase):
    pass

class Customer(CustomerBase):
    id: int
    created_at: datetime
    class Config:
        from_attributes = True


class SupplierBase(BaseModel):
    name: str
    trn: Optional[str] = ""
    attn: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    address: Optional[str] = ""
    opening_balance: Optional[float] = 0.0

class SupplierCreate(SupplierBase):
    pass

class Supplier(SupplierBase):
    id: int
    created_at: datetime
    class Config:
        from_attributes = True


class ItemBase(BaseModel):
    name: str
    description: Optional[str] = ""
    unit: Optional[str] = "Nos"
    price: Optional[float] = 0.0
    vat_applicable: Optional[bool] = True

class ItemCreate(ItemBase):
    pass

class Item(ItemBase):
    id: int
    created_at: datetime
    class Config:
        from_attributes = True


class QuotationItemCreate(BaseModel):
    item_id: Optional[int] = None
    description: str
    quantity: float = 1.0
    unit_price: float = 0.0
    vat_applicable: bool = True

class QuotationItemOut(QuotationItemCreate):
    id: int
    vat_amount: float
    total: float
    class Config:
        from_attributes = True

class QuotationCreate(BaseModel):
    customer_id: int
    date: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    discount: Optional[float] = 0.0
    notes: Optional[str] = ""
    payment_terms: Optional[str] = ""
    delivery: Optional[str] = ""
    include_stamp: Optional[bool] = False
    letterhead: Optional[bool] = True
    items: List[QuotationItemCreate]

class QuotationOut(BaseModel):
    id: int
    quotation_number: str
    customer_id: int
    customer: Optional[Customer] = None
    date: datetime
    valid_until: Optional[datetime] = None
    status: str
    subtotal: float
    vat_amount: float
    discount: float
    total: float
    notes: str
    payment_terms: str = ""
    delivery: str = ""
    include_stamp: bool = False
    letterhead: bool = True
    converted_to_invoice: bool
    items: List[QuotationItemOut]
    class Config:
        from_attributes = True

    @field_validator("notes", "payment_terms", "delivery", "status", mode="before")
    @classmethod
    def _str(cls, v): return _str(v)

    @field_validator("subtotal", "vat_amount", "discount", "total", mode="before")
    @classmethod
    def _float(cls, v): return _float(v)

    @field_validator("include_stamp", "letterhead", "converted_to_invoice", mode="before")
    @classmethod
    def _bool(cls, v): return _bool(v)


class InvoiceItemCreate(BaseModel):
    item_id: Optional[int] = None
    description: str
    quantity: float = 1.0
    unit_price: float = 0.0
    vat_applicable: bool = True

class InvoiceItemOut(InvoiceItemCreate):
    id: int
    vat_amount: float
    total: float
    class Config:
        from_attributes = True

class InvoiceCreate(BaseModel):
    customer_id: Optional[int] = None
    date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    discount: Optional[float] = 0.0
    notes: Optional[str] = ""
    letterhead: Optional[bool] = True
    lpo_no: Optional[str] = ""
    do_no: Optional[str] = ""
    quotation_id: Optional[int] = None
    is_cash: Optional[bool] = False
    include_stamp: Optional[bool] = False
    require_customer_signature: Optional[bool] = False
    payment_terms: Optional[str] = ""
    items: List[InvoiceItemCreate]

class InvoiceOut(BaseModel):
    id: int
    invoice_number: str
    customer_id: Optional[int] = None
    customer: Optional[Customer] = None
    date: datetime
    due_date: Optional[datetime] = None
    status: str
    subtotal: float
    vat_amount: float
    discount: float
    total: float
    amount_paid: float
    balance_due: float
    notes: str
    letterhead: bool
    lpo_no: str = ""
    do_no: str = ""
    is_cash: bool = False
    include_stamp: bool = False
    require_customer_signature: bool = False
    payment_terms: str = ""
    items: List[InvoiceItemOut]
    class Config:
        from_attributes = True

    @field_validator("notes", "lpo_no", "do_no", "status", "payment_terms", mode="before")
    @classmethod
    def _str(cls, v): return _str(v)

    @field_validator("subtotal", "vat_amount", "discount", "total", "amount_paid", "balance_due", mode="before")
    @classmethod
    def _float(cls, v): return _float(v)

    @field_validator("letterhead", "is_cash", "include_stamp", "require_customer_signature", mode="before")
    @classmethod
    def _bool(cls, v): return _bool(v)


class InvoiceAllocation(BaseModel):
    invoice_id: int
    amount: float

class PaymentCreate(BaseModel):
    payment_direction: Optional[str] = "received"   # received / paid
    customer_id: Optional[int] = None
    supplier_id: Optional[int] = None
    bank_account_id: Optional[int] = None
    is_advance: Optional[bool] = False
    date: Optional[datetime] = None
    amount: float
    method: Optional[str] = "cash"
    reference: Optional[str] = ""
    notes: Optional[str] = ""
    allocations: Optional[List[InvoiceAllocation]] = []

class PaymentAllocationOut(BaseModel):
    id: int
    invoice_id: int
    amount: float
    class Config:
        from_attributes = True

class PaymentOut(BaseModel):
    id: int
    payment_number: str
    payment_direction: str
    customer_id: Optional[int] = None
    customer: Optional[Customer] = None
    supplier_id: Optional[int] = None
    supplier: Optional[Supplier] = None
    bank_account_id: Optional[int] = None
    is_advance: bool
    date: datetime
    amount: float
    method: str
    reference: str
    notes: str
    allocations: List[PaymentAllocationOut] = []
    class Config:
        from_attributes = True


class LedgerEntryOut(BaseModel):
    id: int
    date: datetime
    customer_id: Optional[int] = None
    description: str
    debit: float
    credit: float
    balance: float
    entry_type: str
    invoice_id: Optional[int] = None
    payment_id: Optional[int] = None
    class Config:
        from_attributes = True


class StatementRequest(BaseModel):
    customer_id: int
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None


class AICommandRequest(BaseModel):
    command: str


# ── Bank / Cash Management ────────────────────────────────────────────────

class BankAccountBase(BaseModel):
    name: str
    bank_name: Optional[str] = ""
    account_number: Optional[str] = ""
    iban: Optional[str] = ""
    account_type: Optional[str] = "bank"
    opening_balance: Optional[float] = 0.0
    is_active: Optional[bool] = True

class BankAccountCreate(BankAccountBase):
    pass

class BankAccountOut(BankAccountBase):
    id: int
    created_at: datetime
    class Config:
        from_attributes = True


class BankTransactionCreate(BaseModel):
    bank_account_id: int
    date: Optional[datetime] = None
    transaction_type: str          # received / paid
    method: Optional[str] = "bank_transfer"
    description: str
    amount: float
    party_name: Optional[str] = ""
    customer_id: Optional[int] = None
    supplier_id: Optional[int] = None
    invoice_id: Optional[int] = None
    cheque_id: Optional[int] = None
    reference: Optional[str] = ""
    notes: Optional[str] = ""

class BankTransactionOut(BaseModel):
    id: int
    transaction_number: str
    bank_account_id: int
    bank_account: Optional[BankAccountOut] = None
    date: datetime
    transaction_type: str
    method: str
    description: str
    amount: float
    party_name: str
    customer_id: Optional[int] = None
    supplier_id: Optional[int] = None
    invoice_id: Optional[int] = None
    cheque_id: Optional[int] = None
    reference: str
    notes: str
    balance_after: float
    class Config:
        from_attributes = True


class ChequeCreate(BaseModel):
    cheque_number: str
    cheque_date: datetime
    bank_name: Optional[str] = ""
    party_name: Optional[str] = ""
    customer_id: Optional[int] = None
    supplier_id: Optional[int] = None
    bank_account_id: Optional[int] = None
    amount: float
    cheque_type: Optional[str] = "received"
    status: Optional[str] = "pending"
    notes: Optional[str] = ""

class ChequeUpdate(BaseModel):
    status: str

class ChequeOut(BaseModel):
    id: int
    cheque_number: str
    cheque_date: datetime
    bank_name: str
    party_name: str
    customer_id: Optional[int] = None
    supplier_id: Optional[int] = None
    bank_account_id: Optional[int] = None
    amount: float
    cheque_type: str
    status: str
    notes: str
    created_at: datetime
    class Config:
        from_attributes = True


class DeliveryNoteItemCreate(BaseModel):
    description: str
    quantity: float = 1.0
    remarks: Optional[str] = ""

class DeliveryNoteItemOut(DeliveryNoteItemCreate):
    id: int
    class Config:
        from_attributes = True

class DeliveryNoteCreate(BaseModel):
    customer_id: Optional[int] = None
    date: Optional[datetime] = None
    remarks: Optional[str] = ""
    letterhead: Optional[bool] = True
    items: List[DeliveryNoteItemCreate]

class DeliveryNoteUpdate(BaseModel):
    customer_id: Optional[int] = None
    date: Optional[datetime] = None
    remarks: Optional[str] = ""
    letterhead: Optional[bool] = True
    status: Optional[str] = "draft"
    items: Optional[List[DeliveryNoteItemCreate]] = None

class DeliveryNoteOut(BaseModel):
    id: int
    dn_number: str
    customer_id: Optional[int] = None
    customer: Optional[Customer] = None
    date: datetime
    remarks: str
    status: str
    letterhead: bool
    items: List[DeliveryNoteItemOut]
    created_at: datetime
    class Config:
        from_attributes = True

    @field_validator("remarks", "status", mode="before")
    @classmethod
    def _str(cls, v): return _str(v)

    @field_validator("letterhead", mode="before")
    @classmethod
    def _bool(cls, v): return _bool(v)


class ExpenseCreate(BaseModel):
    date: Optional[datetime] = None
    category: str
    description: str
    amount: float
    payment_method: Optional[str] = "cash"
    bank_account_id: Optional[int] = None
    supplier_id: Optional[int] = None
    party_name: Optional[str] = ""
    reference: Optional[str] = ""
    notes: Optional[str] = ""
    expense_type: Optional[str] = "general"

class ExpenseOut(BaseModel):
    id: int
    expense_number: str
    date: datetime
    category: str
    description: str
    amount: float
    payment_method: str
    bank_account_id: Optional[int] = None
    bank_account: Optional[BankAccountOut] = None
    supplier_id: Optional[int] = None
    party_name: str = ""
    reference: str
    notes: str
    expense_type: str = "general"
    created_at: datetime
    class Config:
        from_attributes = True


# ── Purchase Orders ────────────────────────────────────────────────────────────
class PurchaseOrderItemCreate(BaseModel):
    description: str
    quantity: float = 1.0
    unit_price: float = 0.0
    vat_applicable: bool = True

class PurchaseOrderItemOut(PurchaseOrderItemCreate):
    id: int
    vat_amount: float
    total: float
    class Config:
        from_attributes = True

class PurchaseOrderCreate(BaseModel):
    supplier_id: Optional[int] = None
    date: Optional[datetime] = None
    delivery_date: Optional[datetime] = None
    payment_terms: Optional[str] = ""
    delivery_terms: Optional[str] = ""
    notes: Optional[str] = ""
    include_stamp: Optional[bool] = False
    letterhead: Optional[bool] = True
    items: List[PurchaseOrderItemCreate]

class PurchaseOrderUpdate(BaseModel):
    supplier_id: Optional[int] = None
    date: Optional[datetime] = None
    delivery_date: Optional[datetime] = None
    payment_terms: Optional[str] = None
    delivery_terms: Optional[str] = None
    notes: Optional[str] = None
    include_stamp: Optional[bool] = None
    letterhead: Optional[bool] = None
    status: Optional[str] = None
    items: Optional[List[PurchaseOrderItemCreate]] = None

class PurchaseOrderOut(BaseModel):
    id: int
    po_number: str
    supplier_id: Optional[int] = None
    supplier: Optional[Supplier] = None
    date: datetime
    delivery_date: Optional[datetime] = None
    payment_terms: str
    delivery_terms: str
    notes: str
    subtotal: float
    vat_amount: float
    total: float
    include_stamp: bool
    letterhead: bool
    status: str
    items: List[PurchaseOrderItemOut]
    created_at: datetime
    class Config:
        from_attributes = True

    @field_validator("payment_terms", "delivery_terms", "notes", "status", mode="before")
    @classmethod
    def _str(cls, v): return _str(v)

    @field_validator("subtotal", "vat_amount", "total", mode="before")
    @classmethod
    def _float(cls, v): return _float(v)

    @field_validator("include_stamp", "letterhead", mode="before")
    @classmethod
    def _bool(cls, v): return _bool(v)


# ── Supplier Bills ────────────────────────────────────────────────────────────

class SupplierBillItemCreate(BaseModel):
    description: str
    quantity: float = 1.0
    unit_price: float = 0.0
    vat_applicable: bool = True

class SupplierBillItemOut(SupplierBillItemCreate):
    id: int
    vat_amount: float
    total: float
    class Config:
        from_attributes = True

class SupplierBillCreate(BaseModel):
    supplier_id: Optional[int] = None
    date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    trn: Optional[str] = ""
    lpo_no: Optional[str] = ""
    notes: Optional[str] = ""
    items: List[SupplierBillItemCreate]

class SupplierBillOut(BaseModel):
    id: int
    bill_number: str
    supplier_id: Optional[int] = None
    supplier: Optional[Supplier] = None
    date: datetime
    due_date: Optional[datetime] = None
    trn: str = ""
    lpo_no: str = ""
    notes: str = ""
    subtotal: float
    vat_amount: float
    total: float
    amount_paid: float
    balance_due: float
    status: str
    items: List[SupplierBillItemOut]
    created_at: datetime
    class Config:
        from_attributes = True

    @field_validator("trn", "lpo_no", "notes", "status", mode="before")
    @classmethod
    def _str(cls, v): return _str(v)

    @field_validator("subtotal", "vat_amount", "total", "amount_paid", "balance_due", mode="before")
    @classmethod
    def _float(cls, v): return _float(v)


# ── Supplier Payments ─────────────────────────────────────────────────────────

class SupplierPaymentCreate(BaseModel):
    supplier_id: Optional[int] = None
    date: Optional[datetime] = None
    amount: float
    method: Optional[str] = "cash"
    reference: Optional[str] = ""
    notes: Optional[str] = ""

class SupplierPaymentOut(BaseModel):
    id: int
    payment_number: str
    supplier_id: Optional[int] = None
    supplier: Optional[Supplier] = None
    date: datetime
    amount: float
    method: str
    reference: str
    notes: str
    created_at: datetime
    class Config:
        from_attributes = True


# ── Supplier with computed balance ────────────────────────────────────────────

class SupplierWithBalance(BaseModel):
    id: int
    name: str
    trn: str = ""
    attn: str = ""
    phone: str = ""
    email: str = ""
    address: str = ""
    opening_balance: float = 0.0
    current_balance: float = 0.0
    created_at: datetime
    class Config:
        from_attributes = True
