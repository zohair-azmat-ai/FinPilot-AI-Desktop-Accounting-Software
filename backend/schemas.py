from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


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
    items: List[InvoiceItemOut]
    class Config:
        from_attributes = True


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


class ExpenseCreate(BaseModel):
    date: Optional[datetime] = None
    category: str
    description: str
    amount: float
    payment_method: Optional[str] = "cash"
    bank_account_id: Optional[int] = None
    supplier_id: Optional[int] = None
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
    reference: str
    notes: str
    expense_type: str = "general"
    created_at: datetime
    class Config:
        from_attributes = True
