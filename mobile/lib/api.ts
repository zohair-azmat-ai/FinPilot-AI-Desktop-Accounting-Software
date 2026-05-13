/**
 * Raw PostgREST fetch layer for FinPilot Mobile.
 * Handles both old JWT anon keys (eyJ…) and new publishable keys (sb_publishable_…).
 */

interface Config { url: string; anonKey: string; workspaceId: string; backendUrl?: string; }

let _cfg: Config | null = null;

export function setApiConfig(cfg: Config) { _cfg = cfg; }
export function getApiConfig() { return _cfg; }
export function getBackendUrl(): string | null {
  return _cfg?.backendUrl?.replace(/\/$/, '') ?? null;
}

function headers(anonKey: string): Record<string, string> {
  const h: Record<string, string> = {
    apikey: anonKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (anonKey.startsWith('eyJ')) h['Authorization'] = `Bearer ${anonKey}`;
  return h;
}

async function pg<T = Record<string, unknown>>(
  table: string,
  params: Record<string, string> = {},
  skipWorkspace = false,
): Promise<T[]> {
  if (!_cfg) throw new Error('Not connected');
  const { url, anonKey, workspaceId } = _cfg;
  const ep = new URL(`${url.replace(/\/$/, '')}/rest/v1/${table}`);
  if (!skipWorkspace) params = { workspace_id: `eq.${workspaceId}`, ...params };
  Object.entries(params).forEach(([k, v]) => ep.searchParams.set(k, v));
  const res = await fetch(ep.toString(), { headers: headers(anonKey) });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const e = await res.json(); msg = e.message || e.error || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

// ── Connection test ───────────────────────────────────────────────────────────
export async function testConnection(url: string, anonKey: string, workspaceId: string) {
  const ep = new URL(`${url.replace(/\/$/, '')}/rest/v1/companies`);
  ep.searchParams.set('workspace_id', `eq.${workspaceId}`);
  ep.searchParams.set('limit', '1');
  const res = await fetch(ep.toString(), { headers: headers(anonKey) });
  if (res.status === 401) throw new Error('Authentication failed — check your API key.');
  if (!res.ok && res.status !== 404)
    throw new Error(`Cannot reach Supabase (${res.status}).`);
}

export async function testBackendUrl(backendUrl: string): Promise<void> {
  const base = backendUrl.replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`${base}/`, { signal: controller.signal });
    if (!res.ok && res.status !== 404 && res.status !== 405)
      throw new Error(`Backend returned HTTP ${res.status}`);
  } finally {
    clearTimeout(timer);
  }
}

// ── Company ───────────────────────────────────────────────────────────────────
export async function getCompany() {
  const d = await pg<any>('companies', { limit: '1' });
  return d[0] ?? null;
}

// ── Customers ─────────────────────────────────────────────────────────────────
export async function getCustomers() {
  return pg<any>('customers', {
    select: 'id,name,phone,email,trn,address,po_box,opening_balance',
    order: 'name.asc',
    limit: '500',
    deleted_at: 'is.null',
  });
}
export async function getCustomer(id: number) {
  const d = await pg<any>('customers', { id: `eq.${id}`, limit: '1' });
  return d[0] ?? null;
}

// ── Suppliers ─────────────────────────────────────────────────────────────────
export async function getSuppliers() {
  return pg<any>('suppliers', {
    select: 'id,name,phone,email,trn,address,opening_balance',
    order: 'name.asc',
    limit: '500',
    deleted_at: 'is.null',
  });
}
export async function getSupplier(id: number) {
  const d = await pg<any>('suppliers', { id: `eq.${id}`, limit: '1' });
  return d[0] ?? null;
}

// ── Invoices ──────────────────────────────────────────────────────────────────
export async function getInvoices(status?: string) {
  const params: Record<string, string> = {
    select: 'id,invoice_number,date,due_date,total,amount_paid,balance_due,status,customer_id',
    order: 'date.desc',
    limit: '500',
    deleted_at: 'is.null',
  };
  if (status && status !== 'all') params.status = `eq.${status}`;
  return pg<any>('invoices', params);
}
export async function getInvoice(id: number) {
  const d = await pg<any>('invoices', { id: `eq.${id}`, limit: '1' });
  return d[0] ?? null;
}
export async function getInvoiceByNumber(num: string) {
  const d = await pg<any>('invoices', { invoice_number: `eq.${num}`, limit: '1' });
  return d[0] ?? null;
}
export async function getInvoiceItems(invoiceId: number) {
  return pg<any>('invoice_items', { invoice_id: `eq.${invoiceId}` });
}
export async function getInvoicesByCustomer(customerId: number) {
  return pg<any>('invoices', {
    customer_id: `eq.${customerId}`,
    select: 'id,invoice_number,date,total,balance_due,status',
    order: 'date.desc',
    limit: '200',
    deleted_at: 'is.null',
  });
}

// ── Quotations ────────────────────────────────────────────────────────────────
export async function getQuotations() {
  return pg<any>('quotations', {
    select: 'id,quotation_number,date,valid_until,total,status,customer_id,converted_to_invoice',
    order: 'date.desc',
    limit: '500',
    deleted_at: 'is.null',
  });
}
export async function getQuotation(id: number) {
  const d = await pg<any>('quotations', { id: `eq.${id}`, limit: '1' });
  return d[0] ?? null;
}
export async function getQuotationByNumber(num: string) {
  const d = await pg<any>('quotations', { quotation_number: `eq.${num}`, limit: '1' });
  return d[0] ?? null;
}
export async function getQuotationItems(quotationId: number) {
  return pg<any>('quotation_items', { quotation_id: `eq.${quotationId}` });
}
export async function getNextQuotationNumber(): Promise<string> {
  try {
    const rows = await pg<any>('quotations', { select: 'quotation_number', order: 'id.desc', limit: '1' });
    if (rows.length && rows[0].quotation_number) {
      const m = rows[0].quotation_number.match(/(\d+)$/);
      if (m) {
        const next = String(parseInt(m[1]) + 1).padStart(m[1].length, '0');
        return rows[0].quotation_number.replace(/\d+$/, next);
      }
    }
  } catch {}
  return `QUO-${String(new Date().getFullYear()).slice(2)}${String(new Date().getMonth()+1).padStart(2,'0')}01`;
}

// ── Delivery Notes ────────────────────────────────────────────────────────────
export async function getDeliveryNotes() {
  return pg<any>('delivery_notes', {
    select: 'id,dn_number,date,status,customer_id',
    order: 'date.desc',
    limit: '500',
    deleted_at: 'is.null',
  });
}
export async function getDeliveryNote(id: number) {
  const d = await pg<any>('delivery_notes', { id: `eq.${id}`, limit: '1' });
  return d[0] ?? null;
}
export async function getDeliveryNoteByNumber(num: string) {
  const d = await pg<any>('delivery_notes', { dn_number: `eq.${num}`, limit: '1' });
  return d[0] ?? null;
}
export async function getDeliveryNoteItems(dnId: number) {
  return pg<any>('delivery_note_items', { dn_id: `eq.${dnId}` });
}
export async function getNextDNNumber(): Promise<string> {
  try {
    const rows = await pg<any>('delivery_notes', { select: 'dn_number', order: 'id.desc', limit: '1' });
    if (rows.length && rows[0].dn_number) {
      const m = rows[0].dn_number.match(/(\d+)$/);
      if (m) {
        const next = String(parseInt(m[1]) + 1).padStart(m[1].length, '0');
        return rows[0].dn_number.replace(/\d+$/, next);
      }
    }
  } catch {}
  return `DN-0001`;
}

// ── Purchase Orders ───────────────────────────────────────────────────────────
export async function getPurchaseOrders() {
  return pg<any>('purchase_orders', {
    select: 'id,po_number,date,total,status,supplier_id',
    order: 'date.desc',
    limit: '500',
    deleted_at: 'is.null',
  });
}
export async function getPurchaseOrder(id: number) {
  const d = await pg<any>('purchase_orders', { id: `eq.${id}`, limit: '1' });
  return d[0] ?? null;
}
export async function getPurchaseOrderByNumber(num: string) {
  const d = await pg<any>('purchase_orders', { po_number: `eq.${num}`, limit: '1' });
  return d[0] ?? null;
}
export async function getPurchaseOrderItems(poId: number) {
  return pg<any>('purchase_order_items', { po_id: `eq.${poId}` });
}
export async function getNextPONumber(): Promise<string> {
  try {
    const rows = await pg<any>('purchase_orders', { select: 'po_number', order: 'id.desc', limit: '1' });
    if (rows.length && rows[0].po_number) {
      const m = rows[0].po_number.match(/(\d+)$/);
      if (m) {
        const next = String(parseInt(m[1]) + 1).padStart(m[1].length, '0');
        return rows[0].po_number.replace(/\d+$/, next);
      }
    }
  } catch {}
  return `PO-0001`;
}

// ── Supplier Bills ────────────────────────────────────────────────────────────
export async function getSupplierBills(supplierId?: number) {
  const params: Record<string, string> = {
    select: 'id,bill_number,date,due_date,total,amount_paid,balance_due,status,supplier_id',
    order: 'date.desc',
    limit: '500',
    deleted_at: 'is.null',
  };
  if (supplierId) params.supplier_id = `eq.${supplierId}`;
  return pg<any>('supplier_bills', params);
}
export async function getSupplierBill(id: number) {
  const d = await pg<any>('supplier_bills', { id: `eq.${id}`, limit: '1' });
  return d[0] ?? null;
}
export async function getSupplierBillItems(billId: number) {
  return pg<any>('supplier_bill_items', { bill_id: `eq.${billId}` });
}
export async function getNextBillNumber(): Promise<string> {
  try {
    const rows = await pg<any>('supplier_bills', { select: 'bill_number', order: 'id.desc', limit: '1' });
    if (rows.length && rows[0].bill_number) {
      const m = rows[0].bill_number.match(/(\d+)$/);
      if (m) {
        const next = String(parseInt(m[1]) + 1).padStart(m[1].length, '0');
        return rows[0].bill_number.replace(/\d+$/, next);
      }
    }
  } catch {}
  return `BILL-0001`;
}

// ── Supplier Payments ─────────────────────────────────────────────────────────
export async function getSupplierPayments(supplierId?: number) {
  const params: Record<string, string> = {
    select: 'id,payment_number,date,amount,method,reference,supplier_id',
    order: 'date.desc',
    limit: '500',
  };
  if (supplierId) params.supplier_id = `eq.${supplierId}`;
  return pg<any>('supplier_payments', params);
}

// ── Customer Payments ─────────────────────────────────────────────────────────
export async function getPayments(customerId?: number) {
  const params: Record<string, string> = {
    select: 'id,payment_number,date,amount,method,payment_direction,customer_id,supplier_id,reference',
    order: 'date.desc',
    limit: '500',
    deleted_at: 'is.null',
  };
  if (customerId) params.customer_id = `eq.${customerId}`;
  return pg<any>('payments', params);
}

// ── Ledger entries ────────────────────────────────────────────────────────────
export async function getLedgerEntries(customerId: number) {
  return pg<any>('ledger_entries', {
    customer_id: `eq.${customerId}`,
    order: 'date.asc,id.asc',
    limit: '1000',
  });
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export async function getDashboard() {
  const [company, invoices, bills] = await Promise.all([
    pg<any>('companies', { limit: '1' }),
    pg<any>('invoices', {
      select: 'id,sync_uuid,invoice_number,total,amount_paid,balance_due,status,date,customer_id',
      order: 'id.desc',
      deleted_at: 'is.null',
    }),
    pg<any>('supplier_bills', { select: 'total,balance_due,status', deleted_at: 'is.null' }),
  ]);

  const mm = new Date().toISOString().slice(0, 7);
  const thisMonth = invoices.filter((i: any) => (i.date ?? '').startsWith(mm));

  return {
    company: company[0] ?? null,
    totalReceivable: invoices.reduce((s: number, i: any) => s + (i.balance_due ?? 0), 0),
    totalPayable: bills.reduce((s: number, b: any) => s + (b.balance_due ?? 0), 0),
    monthRevenue: thisMonth.reduce((s: number, i: any) => s + (i.total ?? 0), 0),
    invoiceCount: invoices.length,
    unpaidCount: invoices.filter((i: any) => i.status === 'unpaid').length,
    partialCount: invoices.filter((i: any) => i.status === 'partial').length,
    recentInvoices: invoices.slice(0, 6),
  };
}

// ── Reports ───────────────────────────────────────────────────────────────────
export async function getReports() {
  const [invoices, payments, expenses] = await Promise.all([
    pg<any>('invoices', { select: 'total,amount_paid,date,status', deleted_at: 'is.null' }),
    pg<any>('payments', { select: 'amount,date', payment_direction: 'eq.received', deleted_at: 'is.null' }),
    pg<any>('expenses', { select: 'amount,date,category' }),
  ]);

  const byMonth: Record<string, number> = {};
  invoices.forEach((i: any) => {
    const m = (i.date ?? '').slice(0, 7);
    if (m) byMonth[m] = (byMonth[m] ?? 0) + (i.total ?? 0);
  });

  return {
    totalRevenue: invoices.reduce((s: number, i: any) => s + (i.total ?? 0), 0),
    totalCollected: payments.reduce((s: number, p: any) => s + (p.amount ?? 0), 0),
    totalExpenses: expenses.reduce((s: number, e: any) => s + (e.amount ?? 0), 0),
    invoiceCount: invoices.length,
    monthlyRevenue: Object.entries(byMonth).sort(([a], [b]) => b.localeCompare(a)).slice(0, 6),
  };
}

// ── Write helpers ─────────────────────────────────────────────────────────────

let _idSeed = Date.now();
function nextId(): number { return ++_idSeed; }

function genUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function isoNow(): string { return new Date().toISOString(); }

async function pgPost(table: string, data: Record<string, unknown>): Promise<any> {
  if (!_cfg) throw new Error('Not connected');
  const { url, anonKey } = _cfg;
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...headers(anonKey), Prefer: 'return=representation' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const e = await res.json(); msg = e.message || e.details || msg; } catch {}
    throw new Error(msg);
  }
  const json = await res.json();
  return Array.isArray(json) ? json[0] : json;
}

async function pgPatch(table: string, id: number, data: Record<string, unknown>): Promise<void> {
  if (!_cfg) throw new Error('Not connected');
  const { url, anonKey, workspaceId } = _cfg;
  const ep = `${url.replace(/\/$/, '')}/rest/v1/${table}?id=eq.${id}&workspace_id=eq.${encodeURIComponent(workspaceId)}`;
  const res = await fetch(ep, {
    method: 'PATCH',
    headers: { ...headers(anonKey), Prefer: 'return=minimal' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const e = await res.json(); msg = e.message || e.details || msg; } catch {}
    throw new Error(msg);
  }
}

async function pgDelete(table: string, id: number): Promise<void> {
  if (!_cfg) throw new Error('Not connected');
  const { url, anonKey, workspaceId } = _cfg;
  const ep = `${url.replace(/\/$/, '')}/rest/v1/${table}?id=eq.${id}&workspace_id=eq.${encodeURIComponent(workspaceId)}`;
  const res = await fetch(ep, { method: 'DELETE', headers: headers(anonKey) });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const e = await res.json(); msg = e.message || e.details || msg; } catch {}
    throw new Error(msg);
  }
}

// Soft-delete: set deleted_at + updated_at so the row is filtered from all UIs
// but still syncs to other devices so they can hide it too.
async function pgSoftDelete(table: string, id: number): Promise<void> {
  return pgPatch(table, id, { deleted_at: isoNow(), updated_at: isoNow() });
}

async function pgDeleteWhere(table: string, extra: Record<string, string>): Promise<void> {
  if (!_cfg) throw new Error('Not connected');
  const { url, anonKey, workspaceId } = _cfg;
  const ep = new URL(`${url.replace(/\/$/, '')}/rest/v1/${table}`);
  ep.searchParams.set('workspace_id', `eq.${workspaceId}`);
  Object.entries(extra).forEach(([k, v]) => ep.searchParams.set(k, v));
  const res = await fetch(ep.toString(), { method: 'DELETE', headers: headers(anonKey) });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const e = await res.json(); msg = e.message || e.details || msg; } catch {}
    throw new Error(msg);
  }
}

// ── Shared totals calculation ─────────────────────────────────────────────────

export interface LineItemDraft {
  description: string;
  quantity: number;
  unit_price: number;
  vat_applicable: boolean;
}

export type InvoiceItemDraft = LineItemDraft;

export function calcLineTotals(items: LineItemDraft[], discount = 0) {
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const vat_amount = items.reduce((s, i) =>
    s + (i.vat_applicable ? i.quantity * i.unit_price * 0.05 : 0), 0);
  const total = Math.max(0, subtotal + vat_amount - discount);
  return { subtotal, vat_amount, discount, total };
}

export const calcInvoiceTotals = calcLineTotals;

// Per-item total including VAT (matches desktop behaviour)
function itemTotal(it: LineItemDraft): number {
  const line = it.quantity * it.unit_price;
  return it.vat_applicable ? line * 1.05 : line;
}

function itemVatAmount(it: LineItemDraft): number {
  return it.vat_applicable ? it.quantity * it.unit_price * 0.05 : 0;
}

// ── Customer CRUD ─────────────────────────────────────────────────────────────

export async function createCustomer(d: {
  name: string; phone?: string | null; email?: string | null;
  address?: string | null; trn?: string | null; po_box?: string | null;
  opening_balance?: number;
}) {
  if (!_cfg) throw new Error('Not connected');
  return pgPost('customers', {
    id: nextId(), name: d.name,
    phone: d.phone ?? null, email: d.email ?? null,
    address: d.address ?? null, trn: d.trn ?? null,
    po_box: d.po_box ?? null,
    opening_balance: d.opening_balance ?? 0,
    workspace_id: _cfg.workspaceId, sync_uuid: genUUID(), updated_at: isoNow(),
  });
}

export async function updateCustomer(id: number, d: {
  name: string; phone?: string | null; email?: string | null;
  address?: string | null; trn?: string | null; po_box?: string | null;
  opening_balance?: number;
}) {
  return pgPatch('customers', id, {
    name: d.name, phone: d.phone ?? null, email: d.email ?? null,
    address: d.address ?? null, trn: d.trn ?? null,
    po_box: d.po_box ?? null,
    opening_balance: d.opening_balance ?? 0, updated_at: isoNow(),
  });
}

export async function deleteCustomer(id: number) {
  return pgSoftDelete('customers', id);
}

// ── Invoice CRUD ──────────────────────────────────────────────────────────────

export async function getNextInvoiceNumber(): Promise<string> {
  try {
    const rows = await pg<any>('invoices', { select: 'invoice_number', order: 'id.desc', limit: '1' });
    if (rows.length && rows[0].invoice_number) {
      const m = rows[0].invoice_number.match(/(\d+)$/);
      if (m) {
        const next = String(parseInt(m[1]) + 1).padStart(m[1].length, '0');
        return rows[0].invoice_number.replace(/\d+$/, next);
      }
    }
  } catch {}
  const d = new Date();
  return `INV-M-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}

export async function createInvoice(
  inv: {
    invoice_number: string; customer_id: number | null;
    date: string; due_date?: string | null; lpo_no?: string | null;
    do_no?: string | null; notes?: string | null; discount?: number;
    is_cash?: boolean; letterhead?: boolean; include_stamp?: boolean;
    require_customer_signature?: boolean;
  },
  items: LineItemDraft[],
) {
  if (!_cfg) throw new Error('Not connected');
  const t = calcLineTotals(items, inv.discount ?? 0);
  const invoiceId = nextId();
  await pgPost('invoices', {
    id: invoiceId, invoice_number: inv.invoice_number,
    customer_id: inv.customer_id ?? null,
    date: inv.date, due_date: inv.due_date ?? null,
    lpo_no: inv.lpo_no ?? null, do_no: inv.do_no ?? null,
    notes: inv.notes ?? null,
    subtotal: t.subtotal, vat_amount: t.vat_amount,
    discount: t.discount, total: t.total,
    amount_paid: 0, balance_due: t.total, status: 'unpaid',
    is_cash: inv.is_cash ? 1 : 0,
    letterhead: inv.letterhead !== false ? 1 : 0,
    include_stamp: inv.include_stamp ? 1 : 0,
    require_customer_signature: inv.require_customer_signature ? 1 : 0,
    workspace_id: _cfg.workspaceId, sync_uuid: genUUID(), updated_at: isoNow(),
  });
  for (const it of items) {
    await pgPost('invoice_items', {
      id: nextId(), invoice_id: invoiceId,
      description: it.description,
      quantity: it.quantity, unit_price: it.unit_price,
      vat_applicable: it.vat_applicable ? 1 : 0,
      vat_amount: itemVatAmount(it),
      total: itemTotal(it),
      workspace_id: _cfg.workspaceId, sync_uuid: genUUID(), updated_at: isoNow(),
    });
  }
  return invoiceId;
}

export async function updateInvoice(
  id: number,
  inv: {
    invoice_number: string; customer_id: number | null;
    date: string; due_date?: string | null; lpo_no?: string | null;
    do_no?: string | null; notes?: string | null; discount?: number;
    is_cash?: boolean; letterhead?: boolean; include_stamp?: boolean;
    require_customer_signature?: boolean; amount_paid?: number;
  },
  items: LineItemDraft[],
) {
  if (!_cfg) throw new Error('Not connected');
  const t = calcLineTotals(items, inv.discount ?? 0);
  const amountPaid = inv.amount_paid ?? 0;
  const balanceDue = Math.max(0, t.total - amountPaid);
  const status = balanceDue <= 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid';
  await pgPatch('invoices', id, {
    invoice_number: inv.invoice_number, customer_id: inv.customer_id ?? null,
    date: inv.date, due_date: inv.due_date ?? null,
    lpo_no: inv.lpo_no ?? null, do_no: inv.do_no ?? null,
    notes: inv.notes ?? null,
    subtotal: t.subtotal, vat_amount: t.vat_amount,
    discount: t.discount, total: t.total,
    balance_due: balanceDue, status,
    is_cash: inv.is_cash ? 1 : 0,
    letterhead: inv.letterhead !== false ? 1 : 0,
    include_stamp: inv.include_stamp ? 1 : 0,
    require_customer_signature: inv.require_customer_signature ? 1 : 0,
    updated_at: isoNow(),
  });
  await pgDeleteWhere('invoice_items', { invoice_id: `eq.${id}` });
  for (const it of items) {
    await pgPost('invoice_items', {
      id: nextId(), invoice_id: id,
      description: it.description, quantity: it.quantity,
      unit_price: it.unit_price, vat_applicable: it.vat_applicable ? 1 : 0,
      vat_amount: itemVatAmount(it),
      total: itemTotal(it),
      workspace_id: _cfg.workspaceId, sync_uuid: genUUID(), updated_at: isoNow(),
    });
  }
}

export async function deleteInvoice(id: number) {
  return pgSoftDelete('invoices', id);
}

// ── Quotation CRUD ────────────────────────────────────────────────────────────

export async function createQuotation(
  q: {
    quotation_number: string; customer_id: number | null;
    date: string; valid_until?: string | null;
    discount?: number; notes?: string | null;
    payment_terms?: string | null; delivery?: string | null;
    include_stamp?: boolean; letterhead?: boolean;
  },
  items: LineItemDraft[],
) {
  if (!_cfg) throw new Error('Not connected');
  const t = calcLineTotals(items, q.discount ?? 0);
  const qId = nextId();
  await pgPost('quotations', {
    id: qId, quotation_number: q.quotation_number,
    customer_id: q.customer_id ?? null,
    date: q.date, valid_until: q.valid_until ?? null,
    discount: q.discount ?? 0,
    notes: q.notes ?? null,
    payment_terms: q.payment_terms ?? null,
    delivery: q.delivery ?? null,
    include_stamp: q.include_stamp ? 1 : 0,
    letterhead: q.letterhead !== false ? 1 : 0,
    subtotal: t.subtotal, vat_amount: t.vat_amount, total: t.total,
    status: 'draft',
    converted_to_invoice: 0,
    workspace_id: _cfg.workspaceId, sync_uuid: genUUID(), updated_at: isoNow(),
  });
  for (const it of items) {
    await pgPost('quotation_items', {
      id: nextId(), quotation_id: qId,
      description: it.description, quantity: it.quantity,
      unit_price: it.unit_price, vat_applicable: it.vat_applicable ? 1 : 0,
      vat_amount: itemVatAmount(it), total: itemTotal(it),
      workspace_id: _cfg.workspaceId, sync_uuid: genUUID(), updated_at: isoNow(),
    });
  }
  return qId;
}

export async function updateQuotation(
  id: number,
  q: {
    quotation_number: string; customer_id: number | null;
    date: string; valid_until?: string | null;
    discount?: number; notes?: string | null;
    payment_terms?: string | null; delivery?: string | null;
    include_stamp?: boolean; letterhead?: boolean;
  },
  items: LineItemDraft[],
) {
  if (!_cfg) throw new Error('Not connected');
  const t = calcLineTotals(items, q.discount ?? 0);
  await pgPatch('quotations', id, {
    quotation_number: q.quotation_number, customer_id: q.customer_id ?? null,
    date: q.date, valid_until: q.valid_until ?? null,
    discount: q.discount ?? 0, notes: q.notes ?? null,
    payment_terms: q.payment_terms ?? null, delivery: q.delivery ?? null,
    include_stamp: q.include_stamp ? 1 : 0, letterhead: q.letterhead !== false ? 1 : 0,
    subtotal: t.subtotal, vat_amount: t.vat_amount, total: t.total,
    updated_at: isoNow(),
  });
  await pgDeleteWhere('quotation_items', { quotation_id: `eq.${id}` });
  for (const it of items) {
    await pgPost('quotation_items', {
      id: nextId(), quotation_id: id,
      description: it.description, quantity: it.quantity,
      unit_price: it.unit_price, vat_applicable: it.vat_applicable ? 1 : 0,
      vat_amount: itemVatAmount(it), total: itemTotal(it),
      workspace_id: _cfg.workspaceId, sync_uuid: genUUID(), updated_at: isoNow(),
    });
  }
}

export async function deleteQuotation(id: number) {
  return pgSoftDelete('quotations', id);
}

// ── Delivery Note CRUD ────────────────────────────────────────────────────────

export interface DNItemDraft { description: string; quantity: number; remarks?: string; }

export async function createDeliveryNote(
  dn: {
    dn_number: string; customer_id: number | null;
    date: string; remarks?: string | null; letterhead?: boolean;
  },
  items: DNItemDraft[],
) {
  if (!_cfg) throw new Error('Not connected');
  const dnId = nextId();
  await pgPost('delivery_notes', {
    id: dnId, dn_number: dn.dn_number,
    customer_id: dn.customer_id ?? null,
    date: dn.date, remarks: dn.remarks ?? null,
    letterhead: dn.letterhead !== false ? 1 : 0,
    status: 'draft',
    workspace_id: _cfg.workspaceId, sync_uuid: genUUID(), updated_at: isoNow(),
  });
  for (const it of items) {
    await pgPost('delivery_note_items', {
      id: nextId(), dn_id: dnId,
      description: it.description, quantity: it.quantity,
      remarks: it.remarks ?? null,
      workspace_id: _cfg.workspaceId, sync_uuid: genUUID(), updated_at: isoNow(),
    });
  }
  return dnId;
}

export async function updateDeliveryNote(
  id: number,
  dn: {
    dn_number: string; customer_id: number | null;
    date: string; remarks?: string | null; letterhead?: boolean; status?: string;
  },
  items: DNItemDraft[],
) {
  if (!_cfg) throw new Error('Not connected');
  await pgPatch('delivery_notes', id, {
    dn_number: dn.dn_number, customer_id: dn.customer_id ?? null,
    date: dn.date, remarks: dn.remarks ?? null,
    letterhead: dn.letterhead !== false ? 1 : 0,
    status: dn.status ?? 'draft',
    updated_at: isoNow(),
  });
  await pgDeleteWhere('delivery_note_items', { dn_id: `eq.${id}` });
  for (const it of items) {
    await pgPost('delivery_note_items', {
      id: nextId(), dn_id: id,
      description: it.description, quantity: it.quantity,
      remarks: it.remarks ?? null,
      workspace_id: _cfg.workspaceId, sync_uuid: genUUID(), updated_at: isoNow(),
    });
  }
}

export async function deleteDeliveryNote(id: number) {
  return pgSoftDelete('delivery_notes', id);
}

// ── Purchase Order CRUD ───────────────────────────────────────────────────────

export async function createPurchaseOrder(
  po: {
    po_number: string; supplier_id: number | null;
    date: string; delivery_date?: string | null;
    payment_terms?: string | null; delivery_terms?: string | null;
    notes?: string | null; include_stamp?: boolean; letterhead?: boolean;
  },
  items: LineItemDraft[],
) {
  if (!_cfg) throw new Error('Not connected');
  const t = calcLineTotals(items, 0);
  const poId = nextId();
  await pgPost('purchase_orders', {
    id: poId, po_number: po.po_number,
    supplier_id: po.supplier_id ?? null,
    date: po.date, delivery_date: po.delivery_date ?? null,
    payment_terms: po.payment_terms ?? null,
    delivery_terms: po.delivery_terms ?? null,
    notes: po.notes ?? null,
    subtotal: t.subtotal, vat_amount: t.vat_amount, total: t.total,
    include_stamp: po.include_stamp ? 1 : 0,
    letterhead: po.letterhead !== false ? 1 : 0,
    status: 'draft',
    workspace_id: _cfg.workspaceId, sync_uuid: genUUID(), updated_at: isoNow(),
  });
  for (const it of items) {
    await pgPost('purchase_order_items', {
      id: nextId(), po_id: poId,
      description: it.description, quantity: it.quantity,
      unit_price: it.unit_price, vat_applicable: it.vat_applicable ? 1 : 0,
      vat_amount: itemVatAmount(it), total: itemTotal(it),
      workspace_id: _cfg.workspaceId, sync_uuid: genUUID(), updated_at: isoNow(),
    });
  }
  return poId;
}

export async function updatePurchaseOrder(
  id: number,
  po: {
    po_number: string; supplier_id: number | null;
    date: string; delivery_date?: string | null;
    payment_terms?: string | null; delivery_terms?: string | null;
    notes?: string | null; include_stamp?: boolean; letterhead?: boolean;
  },
  items: LineItemDraft[],
) {
  if (!_cfg) throw new Error('Not connected');
  const t = calcLineTotals(items, 0);
  await pgPatch('purchase_orders', id, {
    po_number: po.po_number, supplier_id: po.supplier_id ?? null,
    date: po.date, delivery_date: po.delivery_date ?? null,
    payment_terms: po.payment_terms ?? null, delivery_terms: po.delivery_terms ?? null,
    notes: po.notes ?? null,
    subtotal: t.subtotal, vat_amount: t.vat_amount, total: t.total,
    include_stamp: po.include_stamp ? 1 : 0, letterhead: po.letterhead !== false ? 1 : 0,
    updated_at: isoNow(),
  });
  await pgDeleteWhere('purchase_order_items', { po_id: `eq.${id}` });
  for (const it of items) {
    await pgPost('purchase_order_items', {
      id: nextId(), po_id: id,
      description: it.description, quantity: it.quantity,
      unit_price: it.unit_price, vat_applicable: it.vat_applicable ? 1 : 0,
      vat_amount: itemVatAmount(it), total: itemTotal(it),
      workspace_id: _cfg.workspaceId, sync_uuid: genUUID(), updated_at: isoNow(),
    });
  }
}

export async function deletePurchaseOrder(id: number) {
  return pgSoftDelete('purchase_orders', id);
}

// ── Supplier Bill CRUD ────────────────────────────────────────────────────────

export async function createSupplierBill(
  bill: {
    bill_number: string; supplier_id: number | null;
    date: string; due_date?: string | null;
    trn?: string | null; lpo_no?: string | null; notes?: string | null;
  },
  items: LineItemDraft[],
) {
  if (!_cfg) throw new Error('Not connected');
  const t = calcLineTotals(items, 0);
  const billId = nextId();
  await pgPost('supplier_bills', {
    id: billId, bill_number: bill.bill_number,
    supplier_id: bill.supplier_id ?? null,
    date: bill.date, due_date: bill.due_date ?? null,
    trn: bill.trn ?? null, lpo_no: bill.lpo_no ?? null, notes: bill.notes ?? null,
    subtotal: t.subtotal, vat_amount: t.vat_amount, total: t.total,
    amount_paid: 0, balance_due: t.total, status: 'unpaid',
    workspace_id: _cfg.workspaceId, sync_uuid: genUUID(), updated_at: isoNow(),
  });
  for (const it of items) {
    await pgPost('supplier_bill_items', {
      id: nextId(), bill_id: billId,
      description: it.description, quantity: it.quantity,
      unit_price: it.unit_price, vat_applicable: it.vat_applicable ? 1 : 0,
      vat_amount: itemVatAmount(it), total: itemTotal(it),
      workspace_id: _cfg.workspaceId, sync_uuid: genUUID(), updated_at: isoNow(),
    });
  }
  return billId;
}

export async function updateSupplierBill(
  id: number,
  bill: {
    bill_number: string; supplier_id: number | null;
    date: string; due_date?: string | null;
    trn?: string | null; lpo_no?: string | null; notes?: string | null;
    amount_paid?: number;
  },
  items: LineItemDraft[],
) {
  if (!_cfg) throw new Error('Not connected');
  const t = calcLineTotals(items, 0);
  const amountPaid = bill.amount_paid ?? 0;
  const balanceDue = Math.max(0, t.total - amountPaid);
  const status = balanceDue <= 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid';
  await pgPatch('supplier_bills', id, {
    bill_number: bill.bill_number, supplier_id: bill.supplier_id ?? null,
    date: bill.date, due_date: bill.due_date ?? null,
    trn: bill.trn ?? null, lpo_no: bill.lpo_no ?? null, notes: bill.notes ?? null,
    subtotal: t.subtotal, vat_amount: t.vat_amount, total: t.total,
    balance_due: balanceDue, status, updated_at: isoNow(),
  });
  await pgDeleteWhere('supplier_bill_items', { bill_id: `eq.${id}` });
  for (const it of items) {
    await pgPost('supplier_bill_items', {
      id: nextId(), bill_id: id,
      description: it.description, quantity: it.quantity,
      unit_price: it.unit_price, vat_applicable: it.vat_applicable ? 1 : 0,
      vat_amount: itemVatAmount(it), total: itemTotal(it),
      workspace_id: _cfg.workspaceId, sync_uuid: genUUID(), updated_at: isoNow(),
    });
  }
}

export async function deleteSupplierBill(id: number) {
  return pgSoftDelete('supplier_bills', id);
}

// ── Customer Payment CRUD ─────────────────────────────────────────────────────

export async function createPayment(p: {
  customer_id: number | null; date: string; amount: number;
  method?: string; reference?: string | null; notes?: string | null;
  invoice_id?: number | null;
}) {
  if (!_cfg) throw new Error('Not connected');
  const payId = nextId();
  // Auto-generate a sequential payment number
  const rows = await pg<any>('payments', { select: 'payment_number', order: 'id.desc', limit: '1' });
  let pNum = 'PMT-0001';
  if (rows.length && rows[0].payment_number) {
    const m = rows[0].payment_number.match(/(\d+)$/);
    if (m) pNum = `PMT-${String(parseInt(m[1]) + 1).padStart(4, '0')}`;
  }
  // Update invoice amount_paid / balance_due / status in Supabase
  if (p.invoice_id) {
    const inv = await getInvoice(p.invoice_id);
    if (inv) {
      const newPaid = (inv.amount_paid ?? 0) + p.amount;
      const newBal = Math.max(0, (inv.total ?? 0) - newPaid);
      const newStatus = newBal <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';
      await pgPatch('invoices', p.invoice_id, {
        amount_paid: newPaid, balance_due: newBal, status: newStatus, updated_at: isoNow(),
      });
    }
  }
  return pgPost('payments', {
    id: payId, payment_number: pNum,
    payment_direction: 'received',
    customer_id: p.customer_id ?? null,
    invoice_id: p.invoice_id ?? null,
    date: p.date, amount: p.amount,
    method: p.method ?? 'cash',
    reference: p.reference ?? null,
    notes: p.notes ?? null,
    workspace_id: _cfg.workspaceId, sync_uuid: genUUID(), updated_at: isoNow(),
  });
}

export async function deletePayment(id: number) {
  return pgSoftDelete('payments', id);
}

// ── Supplier Payment CRUD ─────────────────────────────────────────────────────

export async function createSupplierPayment(p: {
  supplier_id: number | null; date: string; amount: number;
  method?: string; reference?: string | null; notes?: string | null;
  bill_id?: number | null;
}) {
  if (!_cfg) throw new Error('Not connected');
  const payId = nextId();
  const rows = await pg<any>('supplier_payments', { select: 'payment_number', order: 'id.desc', limit: '1' });
  let pNum = 'SPMT-0001';
  if (rows.length && rows[0].payment_number) {
    const m = rows[0].payment_number.match(/(\d+)$/);
    if (m) pNum = `SPMT-${String(parseInt(m[1]) + 1).padStart(4, '0')}`;
  }
  // Update linked bill if provided
  if (p.bill_id) {
    const bill = await getSupplierBill(p.bill_id);
    if (bill) {
      const newPaid = (bill.amount_paid ?? 0) + p.amount;
      const newBal = Math.max(0, (bill.total ?? 0) - newPaid);
      const newStatus = newBal <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';
      await pgPatch('supplier_bills', p.bill_id, {
        amount_paid: newPaid, balance_due: newBal, status: newStatus, updated_at: isoNow(),
      });
    }
  }
  return pgPost('supplier_payments', {
    id: payId, payment_number: pNum,
    supplier_id: p.supplier_id ?? null,
    date: p.date, amount: p.amount,
    method: p.method ?? 'cash',
    reference: p.reference ?? null,
    notes: p.notes ?? null,
    workspace_id: _cfg.workspaceId, sync_uuid: genUUID(), updated_at: isoNow(),
  });
}

export async function deleteSupplierPayment(id: number) {
  return pgDelete('supplier_payments', id);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function fmtCurrency(n: number | null | undefined) {
  const v = n ?? 0;
  return 'AED ' + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
export function fmtDate(s: string | null | undefined) {
  if (!s) return '';
  try {
    return new Date(s).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return s.slice(0, 10); }
}

export function amountInWords(amount: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'];
  const tensW = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function b1000(n: number): string {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    if (n < 100) return tensW[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + b1000(n % 100) : '');
  }

  const integer = Math.floor(Math.abs(amount));
  const fils = Math.round((Math.abs(amount) - integer) * 100);
  let words: string;
  if (integer === 0) words = 'Zero';
  else if (integer < 1000) words = b1000(integer);
  else if (integer < 1_000_000) {
    const [h, l] = [Math.floor(integer / 1000), integer % 1000];
    words = b1000(h) + ' Thousand' + (l ? ' ' + b1000(l) : '');
  } else {
    const [h, l] = [Math.floor(integer / 1_000_000), integer % 1_000_000];
    words = b1000(h) + ' Million' + (l ? ' ' + (l < 1000 ? b1000(l) : b1000(Math.floor(l/1000)) + ' Thousand' + (l%1000 ? ' ' + b1000(l%1000) : '')) : '');
  }
  return fils ? `AED ${words} and ${b1000(fils)} Fils Only` : `AED ${words} Only`;
}
