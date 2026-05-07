"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import {
  getBankAccounts, getBankTransactions, createBankTransaction,
  deleteBankTransaction, getCustomers, getSuppliers, getInvoices
} from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Trash2, X, Search, ArrowDownLeft, ArrowUpRight, Filter } from "lucide-react";

interface BankAccount { id: number; name: string; account_type: string; }
interface Txn {
  id: number; transaction_number: string; bank_account?: { name: string };
  date: string; transaction_type: string; method: string; description: string;
  amount: number; party_name: string; balance_after: number; reference: string;
}
interface Customer { id: number; name: string; }
interface Supplier { id: number; name: string; }
interface Invoice { id: number; invoice_number: string; balance_due: number; customer_id: number; }

const METHODS_IN  = ["cash", "bank_transfer", "cheque", "online"];
const METHODS_OUT = ["cash", "bank_transfer", "cheque", "online"];

function TransactionsContent() {
  const params = useSearchParams();
  const defaultType = params.get("type") || "";

  const [txns, setTxns] = useState<Txn[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filterAccount, setFilterAccount] = useState("");
  const [filterType, setFilterType] = useState(defaultType);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(!!params.get("new") || !!defaultType);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    bank_account_id: "", date: new Date().toISOString().split("T")[0],
    transaction_type: defaultType || "received",
    method: "bank_transfer", description: "", amount: 0,
    party_name: "", customer_id: "", supplier_id: "", invoice_id: "",
    reference: "", notes: ""
  });

  const load = () => {
    setLoading(true);
    const p: Record<string, unknown> = {};
    if (filterAccount) p.bank_account_id = parseInt(filterAccount);
    if (filterType) p.transaction_type = filterType;
    getBankTransactions(p).then((r) => setTxns(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => {
    getBankAccounts().then((r) => setAccounts(r.data));
    getCustomers().then((r) => setCustomers(r.data));
    getSuppliers().then((r) => setSuppliers(r.data));
    getInvoices().then((r) => setInvoices(r.data));
  }, []);

  useEffect(() => { load(); }, [filterAccount, filterType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.bank_account_id) return toast.error("Select a bank/cash account");
    if (!form.description.trim()) return toast.error("Description is required");
    if (!form.amount || form.amount <= 0) return toast.error("Enter valid amount");
    try {
      await createBankTransaction({
        ...form,
        bank_account_id: parseInt(form.bank_account_id),
        customer_id: form.customer_id ? parseInt(form.customer_id) : null,
        supplier_id: form.supplier_id ? parseInt(form.supplier_id) : null,
        invoice_id: form.invoice_id ? parseInt(form.invoice_id) : null,
        amount: parseFloat(String(form.amount)),
        date: new Date(form.date).toISOString()
      });
      toast.success(form.transaction_type === "received" ? "Money In recorded!" : "Money Out recorded!");
      setShowModal(false);
      setForm(f => ({ ...f, description: "", amount: 0, party_name: "", customer_id: "", supplier_id: "", invoice_id: "", reference: "", notes: "" }));
      load();
    } catch { toast.error("Failed to save transaction."); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this transaction? Balance will be recalculated.")) return;
    try { await deleteBankTransaction(id); toast.success("Deleted."); load(); }
    catch { toast.error("Failed."); }
  };

  const filtered = txns.filter((t) =>
    t.description.toLowerCase().includes(search.toLowerCase()) ||
    t.party_name.toLowerCase().includes(search.toLowerCase()) ||
    t.transaction_number.toLowerCase().includes(search.toLowerCase())
  );

  const totalIn = filtered.filter(t => t.transaction_type === "received").reduce((s, t) => s + t.amount, 0);
  const totalOut = filtered.filter(t => t.transaction_type === "paid").reduce((s, t) => s + t.amount, 0);

  return (
    <div>
      <Header title="Bank Transactions" />
      <div className="p-6 space-y-5">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="card">
            <p className="text-text-muted text-xs uppercase tracking-wide">Money In</p>
            <p className="text-xl font-bold text-emerald-400 mt-1">AED {totalIn.toFixed(2)}</p>
          </div>
          <div className="card">
            <p className="text-text-muted text-xs uppercase tracking-wide">Money Out</p>
            <p className="text-xl font-bold text-red-400 mt-1">AED {totalOut.toFixed(2)}</p>
          </div>
          <div className="card">
            <p className="text-text-muted text-xs uppercase tracking-wide">Net Flow</p>
            <p className={`text-xl font-bold mt-1 ${totalIn - totalOut >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              AED {(totalIn - totalOut).toFixed(2)}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative w-56">
            <Search size={15} className="absolute left-3 top-2.5 text-text-muted" />
            <input className="input pl-9" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input w-44" value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)}>
            <option value="">All Accounts</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <div className="flex gap-2">
            {["", "received", "paid"].map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                  filterType === t
                    ? t === "received" ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                    : t === "paid" ? "border-red-500 bg-red-500/10 text-red-400"
                    : "border-brand-indigo bg-brand-indigo/10 text-brand-indigo"
                    : "border-bg-border text-text-secondary hover:border-brand-indigo/40"
                }`}
              >
                {t === "" ? "All" : t === "received" ? "↓ Money In" : "↑ Money Out"}
              </button>
            ))}
          </div>
          <button className="btn-primary ml-auto" onClick={() => setShowModal(true)}><Plus size={15} /> New Transaction</button>
        </div>

        {/* Table */}
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="table-head">
              <tr><th>Ref</th><th>Account</th><th>Date</th><th>Description</th><th>Party</th><th>Method</th><th className="text-right">In</th><th className="text-right">Out</th><th className="text-right">Balance</th><th></th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="text-center py-8 text-text-muted">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-12 text-text-muted">No transactions found.</td></tr>
              ) : filtered.map((t) => (
                <tr key={t.id} className="table-row">
                  <td className="font-mono text-xs text-brand-indigo">{t.transaction_number}</td>
                  <td className="text-xs">{t.bank_account?.name || "—"}</td>
                  <td className="text-text-secondary text-xs">{new Date(t.date).toLocaleDateString("en-AE")}</td>
                  <td className="max-w-[180px] truncate text-sm">{t.description}</td>
                  <td className="text-text-secondary text-xs">{t.party_name || "—"}</td>
                  <td><span className="text-xs bg-bg-secondary border border-bg-border px-2 py-0.5 rounded capitalize">{t.method.replace(/_/g, " ")}</span></td>
                  <td className="text-right font-medium text-emerald-400">
                    {t.transaction_type === "received" ? `${t.amount.toFixed(2)}` : "—"}
                  </td>
                  <td className="text-right font-medium text-red-400">
                    {t.transaction_type === "paid" ? `${t.amount.toFixed(2)}` : "—"}
                  </td>
                  <td className="text-right font-mono text-sm">{t.balance_after.toFixed(2)}</td>
                  <td><button onClick={() => handleDelete(t.id)} className="text-text-muted hover:text-red-400"><Trash2 size={13} /></button></td>
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
              <h3 className="font-semibold">Record Transaction</h3>
              <button onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Type toggle */}
              <div className="flex gap-3">
                {(["received", "paid"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, transaction_type: t }))}
                    className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-all flex items-center justify-center gap-2 ${
                      form.transaction_type === t
                        ? t === "received"
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                          : "border-red-500 bg-red-500/10 text-red-400"
                        : "border-bg-border text-text-secondary"
                    }`}
                  >
                    {t === "received" ? <><ArrowDownLeft size={16} /> Money In</> : <><ArrowUpRight size={16} /> Money Out</>}
                  </button>
                ))}
              </div>

              <div>
                <label className="label">Bank / Cash Account *</label>
                <select className="input" value={form.bank_account_id} onChange={(e) => setForm(f => ({ ...f, bank_account_id: e.target.value }))}>
                  <option value="">— Select Account —</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Date</label>
                  <input className="input" type="date" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Amount (AED) *</label>
                  <input className="input" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} required />
                </div>
              </div>

              <div>
                <label className="label">Description *</label>
                <input className="input" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder={form.transaction_type === "received" ? "e.g. Payment received from client" : "e.g. Office rent payment"} required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Method</label>
                  <select className="input" value={form.method} onChange={(e) => setForm(f => ({ ...f, method: e.target.value }))}>
                    {METHODS_IN.map((m) => <option key={m} value={m}>{m.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Reference / Cheque No.</label>
                  <input className="input" value={form.reference} onChange={(e) => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="Optional" />
                </div>
              </div>

              <div>
                <label className="label">Party Name</label>
                <input className="input" value={form.party_name} onChange={(e) => setForm(f => ({ ...f, party_name: e.target.value }))} placeholder="Customer / supplier / other" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {form.transaction_type === "received" && (
                  <div>
                    <label className="label">Link to Customer</label>
                    <select className="input" value={form.customer_id} onChange={(e) => setForm(f => ({ ...f, customer_id: e.target.value }))}>
                      <option value="">— Optional —</option>
                      {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}
                {form.transaction_type === "paid" && (
                  <div>
                    <label className="label">Link to Supplier</label>
                    <select className="input" value={form.supplier_id} onChange={(e) => setForm(f => ({ ...f, supplier_id: e.target.value }))}>
                      <option value="">— Optional —</option>
                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}
                {form.transaction_type === "received" && (
                  <div>
                    <label className="label">Link to Invoice</label>
                    <select className="input" value={form.invoice_id} onChange={(e) => setForm(f => ({ ...f, invoice_id: e.target.value }))}>
                      <option value="">— Optional —</option>
                      {invoices.map((inv) => <option key={inv.id} value={inv.id}>INV #{inv.id} (AED {inv.balance_due.toFixed(2)} due)</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="label">Notes</label>
                <textarea className="input h-16 resize-none" value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" className={`flex-1 justify-center flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm text-white ${form.transaction_type === "received" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-red-600 hover:bg-red-500"}`}>
                  {form.transaction_type === "received" ? <><ArrowDownLeft size={15} /> Record Money In</> : <><ArrowUpRight size={15} /> Record Money Out</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BankTransactionsPage() {
  return <Suspense><TransactionsContent /></Suspense>;
}
