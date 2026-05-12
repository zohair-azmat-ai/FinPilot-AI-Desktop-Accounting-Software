/**
 * Raw PostgREST fetch layer for FinPilot Mobile.
 * Handles both old JWT anon keys (eyJ…) and new publishable keys (sb_publishable_…).
 */

interface Config { url: string; anonKey: string; workspaceId: string; }

let _cfg: Config | null = null;

export function setApiConfig(cfg: Config) { _cfg = cfg; }
export function getApiConfig() { return _cfg; }

function headers(anonKey: string): Record<string, string> {
  const h: Record<string, string> = {
    apikey: anonKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  // Old JWT anon keys are also valid Bearer tokens; new publishable keys are not.
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

// ── Company ───────────────────────────────────────────────────────────────────
export async function getCompany() {
  const d = await pg<any>('companies', { limit: '1' });
  return d[0] ?? null;
}

// ── Customers ─────────────────────────────────────────────────────────────────
export async function getCustomers() {
  return pg<any>('customers', {
    select: 'id,name,phone,email,trn,address,opening_balance',
    order: 'name.asc',
    limit: '500',
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
  };
  if (status && status !== 'all') params.status = `eq.${status}`;
  return pg<any>('invoices', params);
}
export async function getInvoice(id: number) {
  const d = await pg<any>('invoices', { id: `eq.${id}`, limit: '1' });
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
    limit: '100',
  });
}

// ── Supplier bills ────────────────────────────────────────────────────────────
export async function getSupplierBills(supplierId?: number) {
  const params: Record<string, string> = {
    select: 'id,bill_number,date,due_date,total,amount_paid,balance_due,status,supplier_id',
    order: 'date.desc',
    limit: '500',
  };
  if (supplierId) params.supplier_id = `eq.${supplierId}`;
  return pg<any>('supplier_bills', params);
}

// ── Payments ──────────────────────────────────────────────────────────────────
export async function getPayments() {
  return pg<any>('payments', {
    select: 'id,payment_number,date,amount,method,payment_direction',
    order: 'date.desc',
    limit: '500',
  });
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export async function getDashboard() {
  const [company, invoices, bills] = await Promise.all([
    pg<any>('companies', { limit: '1' }),
    pg<any>('invoices', {
      select: 'total,amount_paid,balance_due,status,date,customer_id',
    }),
    pg<any>('supplier_bills', {
      select: 'total,balance_due,status',
    }),
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
    pg<any>('invoices', { select: 'total,amount_paid,date,status' }),
    pg<any>('payments', {
      select: 'amount,date',
      payment_direction: 'eq.received',
    }),
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
    monthlyRevenue: Object.entries(byMonth)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 6),
  };
}

// ── Write helpers ─────────────────────────────────────────────────────────────

// Monotonic ID: Date.now() seed puts values in the billions,
// far above SQLite desktop auto-increment IDs (typically 1-99999).
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
  return pgDelete('customers', id);
}

// ── Invoice CRUD ──────────────────────────────────────────────────────────────

export interface InvoiceItemDraft {
  description: string;
  quantity: number;
  unit_price: number;
  vat_applicable: boolean;
}

export function calcInvoiceTotals(items: InvoiceItemDraft[], discount = 0) {
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const vat_amount = items.reduce((s, i) =>
    s + (i.vat_applicable ? i.quantity * i.unit_price * 0.05 : 0), 0);
  const total = Math.max(0, subtotal + vat_amount - discount);
  return { subtotal, vat_amount, discount, total };
}

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
    is_cash?: boolean; include_stamp?: boolean; require_customer_signature?: boolean;
  },
  items: InvoiceItemDraft[],
) {
  if (!_cfg) throw new Error('Not connected');
  const t = calcInvoiceTotals(items, inv.discount ?? 0);
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
    include_stamp: inv.include_stamp ? 1 : 0,
    require_customer_signature: inv.require_customer_signature ? 1 : 0,
    workspace_id: _cfg.workspaceId, sync_uuid: genUUID(), updated_at: isoNow(),
  });
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    await pgPost('invoice_items', {
      id: nextId(), invoice_id: invoiceId,
      description: it.description,
      quantity: it.quantity, unit_price: it.unit_price,
      vat_applicable: it.vat_applicable ? 1 : 0,
      total: it.quantity * it.unit_price,
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
    is_cash?: boolean; include_stamp?: boolean; require_customer_signature?: boolean;
    amount_paid?: number;
  },
  items: InvoiceItemDraft[],
) {
  if (!_cfg) throw new Error('Not connected');
  const t = calcInvoiceTotals(items, inv.discount ?? 0);
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
      total: it.quantity * it.unit_price,
      workspace_id: _cfg.workspaceId, sync_uuid: genUUID(), updated_at: isoNow(),
    });
  }
}

export async function deleteInvoice(id: number) {
  if (!_cfg) throw new Error('Not connected');
  await pgDeleteWhere('invoice_items', { invoice_id: `eq.${id}` });
  await pgDelete('invoices', id);
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
