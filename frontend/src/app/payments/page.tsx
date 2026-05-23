"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import {
  getPayments, getCustomers, getSuppliers, getInvoices, getCashInvoices,
  getBankAccounts, createPayment, deletePayment, downloadPaymentPDF
} from "@/lib/api";
import toast from "react-hot-toast";
import {
  Plus, CreditCard, Trash2, FileDown, X, Search,
  ArrowDownLeft, ArrowUpRight, Star
} from "lucide-react";

interface Payment {
  id: number;
  payment_number: string;
  payment_direction: string;
  customer?: { name: string };
  supplier?: { name: string };
  bank_account_id?: number;
  is_advance: boolean;
  date: string;
  amount: number;
  method: string;
  reference: string;
  allocations: { invoice_id: number; amount: number }[];
}
interface Customer { id: number; name: string; }
interface Supplier { id: number; name: string; }
interface Invoice { id: number; invoice_number: string; balance_due: number; customer_id: number; }
interface BankAccount { id: number; name: string; account_type: string; }

const emptyForm = {
  payment_direction: "received",
  customer_id: "",
  supplier_id: "",
  bank_account_id: "",
  is_advance: false,
  date: new Date().toISOString().split("T")[0],
  amount: 0,
  method: "cash",
  reference: "",
  notes: "",
};

function PaymentsContent() {
  const params = useSearchParams();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [tab, setTab] = useState<"received" | "paid">("received");
  const [form, setForm] = useState({
    ...emptyForm,
    customer_id: params.get("customer_id") || "",
    payment_direction: "received",
  });
  const [allocations, setAllocations] = useState<Record<number, number>>({});
  const [showModal, setShowModal] = useState(!!params.get("new"));
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    getPayments({ payment_direction: tab }).then((r) => setPayments(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => {
    getCustomers().then((r) => setCustomers(r.data));
    getSuppliers().then((r) => setSuppliers(r.data));
    getBankAccounts().then((r) => setAccounts(r.data));
  }, []);

  useEffect(() => { load(); }, [tab]);

  useEffect(() => {
    if (form.payment_direction === "received") {
      if (form.customer_id === "cash_sale") {
        getCashInvoices("unpaid")
          .then((r) => setInvoices(r.data.filter((inv: Invoice) => inv.balance_due > 0)))
          .catch(() => setInvoices([]));
      } else if (form.customer_id) {
        getInvoices({ customer_id: parseInt(form.customer_id) })
          .then((r) => setInvoices(r.data.filter((inv: Invoice) => inv.balance_due > 0)))
          .catch(() => setInvoices([]));
      } else {
        setInvoices([]);
      }
    } else {
      setInvoices([]);
    }
    setAllocations({});
  }, [form.customer_id, form.payment_direction]);

  const totalAllocated = Object.values(allocations).reduce((s, v) => s + (v || 0), 0);

  const toggleAlloc = (invId: number, balanceDue: number) => {
    setAllocations((prev) => {
      const next = { ...prev };
      if (next[invId] !== undefined) {
        delete next[invId];
      } else {
        next[invId] = parseFloat(balanceDue.toFixed(2));
      }
      return next;
    });
  };

  const updateAllocAmount = (invId: number, val: number) => {
    setAllocations((prev) => ({ ...prev, [invId]: val }));
  };

  const handleOpen = () => {
    setForm({ ...emptyForm, payment_direction: tab });
    setAllocations({});
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const direction = form.payment_direction;
    const isCashSale = form.customer_id === "cash_sale";
    if (direction === "received" && !form.customer_id) return toast.error("Select a customer");
    if (direction === "paid" && !form.supplier_id) return toast.error("Select a supplier");
    if (!form.amount || form.amount <= 0) return toast.error("Enter valid amount");

    const allocationList = Object.entries(allocations)
      .filter(([, amt]) => amt > 0)
      .map(([invId, amt]) => ({ invoice_id: parseInt(invId), amount: amt }));

    try {
      await createPayment({
        payment_direction: direction,
        customer_id: isCashSale ? null : (form.customer_id ? parseInt(form.customer_id) : null),
        supplier_id: form.supplier_id ? parseInt(form.supplier_id) : null,
        bank_account_id: form.bank_account_id ? parseInt(form.bank_account_id) : null,
        is_advance: form.is_advance,
        date: new Date(form.date).toISOString(),
        amount: parseFloat(String(form.amount)),
        method: form.method,
        reference: form.reference,
        notes: form.notes,
        allocations: allocationList,
      });
      toast.success(direction === "received" ? "Receipt recorded!" : "Payment recorded!");
      setShowModal(false);
      setForm({ ...emptyForm, payment_direction: tab });
      setAllocations({});
      load();
    } catch {
      toast.error("Failed to save.");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this payment? All allocations and ledger entries will be reversed.")) return;
    try { await deletePayment(id); toast.success("Deleted."); load(); }
    catch { toast.error("Failed."); }
  };

  const filtered = payments.filter((p) =>
    p.payment_number.toLowerCase().includes(search.toLowerCase()) ||
    (p.customer?.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (p.supplier?.name || "").toLowerCase().includes(search.toLowerCase())
  );

  const totalAmt = filtered.reduce((s, p) => s + p.amount, 0);

  return (
    <div>
      <Header title="Payments & Receipts" />
      <div className="p-6 space-y-5">
        {/* Tabs */}
        <div className="flex gap-2">
          {(["received", "paid"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border-2 transition-all ${
                tab === t
                  ? t === "received"
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                    : "border-red-500 bg-red-500/10 text-red-400"
                  : "border-bg-border text-text-secondary hover:border-brand-indigo/40"
              }`}
            >
              {t === "received" ? <><ArrowDownLeft size={14} /> Receipts (From Customer)</> : <><ArrowUpRight size={14} /> Payments (To Supplier)</>}
            </button>
          ))}
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-4">
          <div className="card">
            <p className="text-text-muted text-xs uppercase tracking-wide">{tab === "received" ? "Total Received" : "Total Paid"}</p>
            <p className={`text-2xl font-bold mt-1 ${tab === "received" ? "text-emerald-400" : "text-red-400"}`}>
              AED {totalAmt.toFixed(2)}
            </p>
          </div>
          <div className="card">
            <p className="text-text-muted text-xs uppercase tracking-wide">Transactions</p>
            <p className="text-2xl font-bold text-text-primary mt-1">{filtered.length}</p>
          </div>
        </div>

        {/* Filters + action */}
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search size={15} className="absolute left-3 top-2.5 text-text-muted" />
            <input
              className="input pl-9"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="btn-primary ml-auto" onClick={handleOpen}>
            <Plus size={15} /> {tab === "received" ? "Record Receipt" : "Record Payment"}
          </button>
        </div>

        {/* Table */}
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="table-head">
              <tr>
                <th>Ref #</th>
                <th>{tab === "received" ? "Customer" : "Supplier"}</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Invoices</th>
                <th>Flags</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-8 text-text-muted">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-text-muted">
                  <CreditCard size={32} className="mx-auto mb-2 opacity-30" />
                  <p>No {tab === "received" ? "receipts" : "payments"} yet.</p>
                </td></tr>
              ) : filtered.map((p) => (
                <tr key={p.id} className="table-row">
                  <td className={`font-mono ${tab === "received" ? "text-emerald-400" : "text-red-400"}`}>
                    {p.payment_number}
                  </td>
                  <td className="font-medium">
                    {p.customer?.name || p.supplier?.name || "—"}
                  </td>
                  <td className="text-text-secondary text-sm">
                    {new Date(p.date).toLocaleDateString("en-AE")}
                  </td>
                  <td className={`font-bold ${tab === "received" ? "text-emerald-400" : "text-red-400"}`}>
                    AED {p.amount.toFixed(2)}
                  </td>
                  <td>
                    <span className="text-xs bg-bg-secondary border border-bg-border px-2 py-0.5 rounded capitalize">
                      {p.method.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="text-xs text-text-secondary">
                    {p.allocations.length > 0 ? `${p.allocations.length} inv.` : p.is_advance ? "Advance" : "General"}
                  </td>
                  <td>
                    {p.is_advance && (
                      <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full flex items-center gap-1 w-fit">
                        <Star size={10} /> Advance
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button
                        onClick={() => window.open(downloadPaymentPDF(p.id), "_blank")}
                        className="text-text-muted hover:text-brand-indigo"
                        title="Download PDF"
                      >
                        <FileDown size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="text-text-muted hover:text-red-400"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-bg-border">
              <h3 className="font-semibold">
                {form.payment_direction === "received" ? "Record Customer Receipt" : "Record Supplier Payment"}
              </h3>
              <button onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Direction toggle */}
              <div className="flex gap-3">
                {(["received", "paid"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setForm(f => ({ ...f, payment_direction: t, customer_id: "", supplier_id: "" }));
                      setAllocations({});
                    }}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all flex items-center justify-center gap-2 ${
                      form.payment_direction === t
                        ? t === "received"
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                          : "border-red-500 bg-red-500/10 text-red-400"
                        : "border-bg-border text-text-secondary"
                    }`}
                  >
                    {t === "received" ? <><ArrowDownLeft size={14} /> From Customer</> : <><ArrowUpRight size={14} /> To Supplier</>}
                  </button>
                ))}
              </div>

              {/* Party selector */}
              {form.payment_direction === "received" ? (
                <div>
                  <label className="label">Customer *</label>
                  <select className="input" value={form.customer_id} onChange={(e) => setForm(f => ({ ...f, customer_id: e.target.value }))}>
                    <option value="">— Select Customer —</option>
                    <option value="cash_sale">💵 CASH SALE (no customer)</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="label">Supplier *</label>
                  <select className="input" value={form.supplier_id} onChange={(e) => setForm(f => ({ ...f, supplier_id: e.target.value }))}>
                    <option value="">— Select Supplier —</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}

              {/* Date + Amount */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Date</label>
                  <input className="input" type="date" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Amount (AED) *</label>
                  <input
                    className="input"
                    type="number" min="0" step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                    required
                  />
                </div>
              </div>

              {/* Method + Reference */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Payment Method</label>
                  <select className="input" value={form.method} onChange={(e) => setForm(f => ({ ...f, method: e.target.value }))}>
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                    <option value="online">Online</option>
                  </select>
                </div>
                <div>
                  <label className="label">Reference / Cheque No.</label>
                  <input className="input" value={form.reference} onChange={(e) => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="Optional" />
                </div>
              </div>

              {/* Bank account */}
              <div>
                <label className="label">Linked Bank / Cash Account</label>
                <select className="input" value={form.bank_account_id} onChange={(e) => setForm(f => ({ ...f, bank_account_id: e.target.value }))}>
                  <option value="">— None (no auto bank entry) —</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.account_type === "cash" ? "💵" : "🏦"} {a.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Advance toggle (received only) */}
              {form.payment_direction === "received" && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, is_advance: !f.is_advance }))}
                    className={`w-10 h-5 rounded-full transition-colors relative ${form.is_advance ? "bg-amber-500" : "bg-bg-border"}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${form.is_advance ? "left-5" : "left-0.5"}`} />
                  </button>
                  <span className="text-sm text-text-secondary">Mark as Advance Payment</span>
                  {form.is_advance && <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">Advance</span>}
                </div>
              )}

              {/* Invoice allocations (received only, customer or cash_sale selected) */}
              {form.payment_direction === "received" && form.customer_id && !form.is_advance && invoices.length > 0 && (
                <div>
                  <label className="label">Allocate to Invoices</label>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {invoices.map((inv) => {
                      const checked = allocations[inv.id] !== undefined;
                      return (
                        <div key={inv.id} className={`flex items-center gap-3 p-2 rounded-lg border transition-all ${checked ? "border-brand-indigo/40 bg-brand-indigo/5" : "border-bg-border"}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAlloc(inv.id, inv.balance_due)}
                            className="w-4 h-4 accent-indigo-500"
                          />
                          <span className="text-xs font-mono text-brand-indigo flex-1">{inv.invoice_number}</span>
                          <span className="text-xs text-text-muted">Due: AED {inv.balance_due.toFixed(2)}</span>
                          {checked && (
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="input w-28 text-xs py-1"
                              value={allocations[inv.id]}
                              onChange={(e) => updateAllocAmount(inv.id, parseFloat(e.target.value) || 0)}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {totalAllocated > 0 && (
                    <p className="text-xs text-text-muted mt-1">
                      Allocated: AED {totalAllocated.toFixed(2)} / Entered: AED {form.amount.toFixed(2)}
                    </p>
                  )}
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="label">Notes</label>
                <textarea className="input h-14 resize-none" value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button
                  type="submit"
                  className={`flex-1 justify-center flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm text-white ${
                    form.payment_direction === "received" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-red-600 hover:bg-red-500"
                  }`}
                >
                  {form.payment_direction === "received"
                    ? <><ArrowDownLeft size={15} /> Record Receipt</>
                    : <><ArrowUpRight size={15} /> Record Payment</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PaymentsPage() {
  return <Suspense><PaymentsContent /></Suspense>;
}
