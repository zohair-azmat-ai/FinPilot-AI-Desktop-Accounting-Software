"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import {
  getExpenses, getExpenseSummary, getExpenseCategories,
  createExpense, deleteExpense, getBankAccounts, getSuppliers
} from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Trash2, X, TrendingDown, Search } from "lucide-react";

interface Expense {
  id: number; expense_number: string; date: string; category: string;
  description: string; amount: number; payment_method: string;
  bank_account?: { name: string }; reference: string;
}
interface BankAccount { id: number; name: string; account_type: string; }
interface Supplier { id: number; name: string; }

const CATEGORY_LABELS: Record<string, string> = {
  office_expense: "Office Expense", rent: "Rent", salary: "Salary",
  fuel: "Fuel", maintenance: "Maintenance", utilities: "Utilities",
  travel: "Travel", marketing: "Marketing", insurance: "Insurance", custom: "Custom"
};

const CATEGORY_ICONS: Record<string, string> = {
  office_expense: "🖊️", rent: "🏢", salary: "👤", fuel: "⛽",
  maintenance: "🔧", utilities: "💡", travel: "✈️", marketing: "📢",
  insurance: "🛡️", custom: "📁"
};

const emptyForm = {
  date: new Date().toISOString().split("T")[0],
  category: "office_expense", description: "", amount: 0,
  payment_method: "cash", bank_account_id: "", supplier_id: "",
  reference: "", notes: ""
};

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<{ total: number; count: number; by_category: Record<string, number> } | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [showModal, setShowModal] = useState(false);
  const [filterCat, setFilterCat] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    const p: Record<string, unknown> = {};
    if (filterCat) p.category = filterCat;
    if (dateFrom) p.date_from = new Date(dateFrom).toISOString();
    if (dateTo) p.date_to = new Date(dateTo).toISOString();
    Promise.all([getExpenses(p), getExpenseSummary(p)])
      .then(([eRes, sRes]) => { setExpenses(eRes.data); setSummary(sRes.data); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    getExpenseCategories().then((r) => setCategories(r.data.categories));
    getBankAccounts().then((r) => setAccounts(r.data));
    getSuppliers().then((r) => setSuppliers(r.data));
  }, []);

  useEffect(() => { load(); }, [filterCat, dateFrom, dateTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description.trim()) return toast.error("Description is required");
    if (!form.amount || form.amount <= 0) return toast.error("Enter valid amount");
    try {
      await createExpense({
        ...form,
        date: new Date(form.date).toISOString(),
        amount: parseFloat(String(form.amount)),
        bank_account_id: form.bank_account_id ? parseInt(form.bank_account_id) : null,
        supplier_id: form.supplier_id ? parseInt(form.supplier_id) : null,
      });
      toast.success("Expense recorded!");
      setShowModal(false);
      setForm(emptyForm);
      load();
    } catch { toast.error("Failed to save expense."); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this expense?")) return;
    try { await deleteExpense(id); toast.success("Deleted."); load(); }
    catch { toast.error("Failed."); }
  };

  const filtered = expenses.filter((e) =>
    e.description.toLowerCase().includes(search.toLowerCase()) ||
    e.expense_number.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <Header title="Expenses" />
      <div className="p-6 space-y-5">
        {/* Summary */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card">
              <p className="text-text-muted text-xs uppercase tracking-wide">Total Expenses</p>
              <p className="text-2xl font-bold text-red-400 mt-1">AED {summary.total.toFixed(2)}</p>
              <p className="text-text-muted text-xs mt-1">{summary.count} entries</p>
            </div>
            {/* Top 2 categories */}
            {Object.entries(summary.by_category).slice(0, 2).map(([cat, amt]) => (
              <div key={cat} className="card">
                <p className="text-text-muted text-xs uppercase tracking-wide flex items-center gap-1">
                  {CATEGORY_ICONS[cat] || "📁"} {CATEGORY_LABELS[cat] || cat}
                </p>
                <p className="text-xl font-bold text-amber-400 mt-1">AED {amt.toFixed(2)}</p>
              </div>
            ))}
          </div>
        )}

        {/* Category breakdown bar */}
        {summary && Object.keys(summary.by_category).length > 0 && (
          <div className="card">
            <p className="text-xs text-text-muted uppercase tracking-wide mb-3">By Category</p>
            <div className="space-y-2">
              {Object.entries(summary.by_category).map(([cat, amt]) => {
                const pct = summary.total > 0 ? (amt / summary.total) * 100 : 0;
                return (
                  <div key={cat}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-text-secondary">{CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat] || cat}</span>
                      <span className="text-text-primary font-medium">AED {amt.toFixed(2)} <span className="text-text-muted">({pct.toFixed(1)}%)</span></span>
                    </div>
                    <div className="h-1.5 bg-bg-border rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-brand rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative w-56">
            <Search size={15} className="absolute left-3 top-2.5 text-text-muted" />
            <input className="input pl-9" placeholder="Search expenses..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input w-40" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>)}
          </select>
          <div className="flex gap-2">
            <div>
              <input className="input w-36" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="From" />
            </div>
            <div>
              <input className="input w-36" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="To" />
            </div>
          </div>
          <button className="btn-primary ml-auto" onClick={() => setShowModal(true)}><Plus size={15} /> Add Expense</button>
        </div>

        {/* Table */}
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="table-head">
              <tr><th>Ref</th><th>Date</th><th>Category</th><th>Description</th><th>Method</th><th>Account</th><th className="text-right">Amount</th><th></th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-8 text-text-muted">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-text-muted">
                  <TrendingDown size={32} className="mx-auto mb-2 opacity-30" /><p>No expenses found.</p>
                </td></tr>
              ) : filtered.map((exp) => (
                <tr key={exp.id} className="table-row">
                  <td className="font-mono text-xs text-brand-purple">{exp.expense_number}</td>
                  <td className="text-text-secondary text-sm">{new Date(exp.date).toLocaleDateString("en-AE")}</td>
                  <td>
                    <span className="text-xs bg-bg-secondary border border-bg-border px-2 py-0.5 rounded">
                      {CATEGORY_ICONS[exp.category]} {CATEGORY_LABELS[exp.category] || exp.category}
                    </span>
                  </td>
                  <td className="max-w-[200px] truncate text-sm">{exp.description}</td>
                  <td className="text-text-secondary text-xs capitalize">{exp.payment_method.replace(/_/g, " ")}</td>
                  <td className="text-text-secondary text-xs">{exp.bank_account?.name || "Cash"}</td>
                  <td className="text-right font-bold text-red-400">AED {exp.amount.toFixed(2)}</td>
                  <td><button onClick={() => handleDelete(exp.id)} className="text-text-muted hover:text-red-400"><Trash2 size={13} /></button></td>
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
              <h3 className="font-semibold">Add Expense</h3>
              <button onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="label">Category *</label>
                <div className="grid grid-cols-3 gap-2">
                  {categories.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, category: c }))}
                      className={`py-2 px-3 rounded-lg text-xs font-medium border transition-all text-left ${
                        form.category === c
                          ? "border-brand-indigo bg-brand-indigo/10 text-brand-indigo"
                          : "border-bg-border text-text-secondary hover:border-brand-indigo/40"
                      }`}
                    >
                      {CATEGORY_ICONS[c]} {CATEGORY_LABELS[c] || c}
                    </button>
                  ))}
                </div>
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
                <input className="input" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Monthly office rent - May 2026" required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Payment Method</label>
                  <select className="input" value={form.payment_method} onChange={(e) => setForm(f => ({ ...f, payment_method: e.target.value }))}>
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                    <option value="online">Online</option>
                  </select>
                </div>
                <div>
                  <label className="label">Paid From Account</label>
                  <select className="input" value={form.bank_account_id} onChange={(e) => setForm(f => ({ ...f, bank_account_id: e.target.value }))}>
                    <option value="">Cash (no account)</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Supplier / Vendor</label>
                  <select className="input" value={form.supplier_id} onChange={(e) => setForm(f => ({ ...f, supplier_id: e.target.value }))}>
                    <option value="">— Optional —</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Reference</label>
                  <input className="input" value={form.reference} onChange={(e) => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="Receipt / ref no." />
                </div>
              </div>

              <div>
                <label className="label">Notes</label>
                <textarea className="input h-14 resize-none" value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" className="btn-primary flex-1 justify-center"><TrendingDown size={15} /> Add Expense</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
