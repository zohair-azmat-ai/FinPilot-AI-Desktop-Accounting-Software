"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import { getExpenses, getExpenseSummary, createExpense, updateExpense, deleteExpense } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Trash2, X, TrendingDown, Pencil, Search } from "lucide-react";

interface DailyExpense {
  id: number;
  expense_number: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  payment_method: string;
  reference: string;
  notes: string;
  expense_type: string;
}

const DAILY_CATEGORIES: Record<string, string> = {
  tea: "Tea / Coffee",
  petrol: "Petrol / Fuel",
  parking: "Parking",
  labour_lunch: "Labour Lunch",
  courier: "Courier",
  supplies: "Supplies",
  tools: "Tools",
  other_daily: "Other",
};

const CAT_ICONS: Record<string, string> = {
  tea: "☕",
  petrol: "⛽",
  parking: "🅿️",
  labour_lunch: "🍱",
  courier: "📦",
  supplies: "🗃️",
  tools: "🔧",
  other_daily: "📝",
};

const emptyForm = {
  date: new Date().toISOString().split("T")[0],
  category: "tea",
  description: "",
  amount: 0,
  payment_method: "cash",
  reference: "",
  notes: "",
};

export default function DailyExpensesPage() {
  const [expenses, setExpenses] = useState<DailyExpense[]>([]);
  const [summary, setSummary] = useState<{ total: number; count: number; by_category: Record<string, number> } | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split("T")[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split("T")[0]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    const p: Record<string, unknown> = { expense_type: "daily" };
    if (dateFrom) p.date_from = new Date(dateFrom).toISOString();
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      p.date_to = end.toISOString();
    }
    Promise.all([getExpenses(p), getExpenseSummary(p)])
      .then(([eRes, sRes]) => {
        setExpenses(eRes.data);
        setSummary(sRes.data);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [dateFrom, dateTo]);

  const openNew = () => {
    setForm({ ...emptyForm, date: new Date().toISOString().split("T")[0] });
    setEditId(null);
    setShowModal(true);
  };

  const openEdit = (exp: DailyExpense) => {
    setForm({
      date: exp.date.split("T")[0],
      category: exp.category,
      description: exp.description,
      amount: exp.amount,
      payment_method: exp.payment_method,
      reference: exp.reference || "",
      notes: exp.notes || "",
    });
    setEditId(exp.id);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description.trim()) return toast.error("Description required");
    if (!form.amount || form.amount <= 0) return toast.error("Enter a valid amount");
    const payload = {
      ...form,
      date: new Date(form.date).toISOString(),
      amount: parseFloat(String(form.amount)),
      expense_type: "daily",
      bank_account_id: null,
      supplier_id: null,
    };
    try {
      if (editId) {
        await updateExpense(editId, payload);
        toast.success("Updated!");
      } else {
        await createExpense(payload);
        toast.success("Expense added!");
      }
      setShowModal(false);
      setForm(emptyForm);
      setEditId(null);
      load();
    } catch {
      toast.error("Failed to save.");
    }
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

  const todayTotal = filtered.reduce((s, e) => s + e.amount, 0);

  return (
    <div>
      <Header title="Daily Expenses" />
      <div className="p-6 space-y-5">

        {/* Date range + quick today button */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-muted">From</label>
            <input className="input w-36" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <label className="text-xs text-text-muted">To</label>
            <input className="input w-36" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <button
            className="btn-secondary text-xs py-1.5"
            onClick={() => {
              const t = new Date().toISOString().split("T")[0];
              setDateFrom(t); setDateTo(t);
            }}
          >
            Today
          </button>
          <div className="relative w-52">
            <Search size={14} className="absolute left-3 top-2.5 text-text-muted" />
            <input className="input pl-9 text-sm" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button className="btn-primary ml-auto" onClick={openNew}><Plus size={15} /> Add Daily Expense</button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card col-span-2 md:col-span-1">
            <p className="text-text-muted text-xs uppercase tracking-wide">Total</p>
            <p className="text-2xl font-bold text-red-400 mt-1">AED {todayTotal.toFixed(2)}</p>
            <p className="text-text-muted text-xs mt-1">{filtered.length} entries</p>
          </div>
          {summary && Object.entries(summary.by_category).slice(0, 3).map(([cat, amt]) => (
            <div key={cat} className="card">
              <p className="text-text-muted text-xs flex items-center gap-1">
                {CAT_ICONS[cat] || "📁"} {DAILY_CATEGORIES[cat] || cat}
              </p>
              <p className="text-lg font-bold text-amber-400 mt-1">AED {(amt as number).toFixed(2)}</p>
            </div>
          ))}
        </div>

        {/* Category breakdown */}
        {summary && Object.keys(summary.by_category).length > 0 && (
          <div className="card">
            <p className="text-xs text-text-muted uppercase tracking-wide mb-3">Breakdown by Category</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(summary.by_category).map(([cat, amt]) => {
                const pct = summary.total > 0 ? ((amt as number) / summary.total) * 100 : 0;
                return (
                  <div key={cat} className="bg-bg-secondary rounded-lg p-3 border border-bg-border">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-base">{CAT_ICONS[cat] || "📁"}</span>
                      <span className="text-xs text-text-secondary">{DAILY_CATEGORIES[cat] || cat}</span>
                    </div>
                    <p className="text-sm font-bold text-text-primary">AED {(amt as number).toFixed(2)}</p>
                    <div className="h-1 bg-bg-border rounded-full mt-2 overflow-hidden">
                      <div className="h-full bg-gradient-brand rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Table */}
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="table-head">
              <tr>
                <th>Ref</th>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th>Method</th>
                <th className="text-right">Amount (AED)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-8 text-text-muted">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-text-muted">
                  <TrendingDown size={32} className="mx-auto mb-2 opacity-30" />
                  <p>No daily expenses found.</p>
                </td></tr>
              ) : filtered.map((exp) => (
                <tr key={exp.id} className="table-row">
                  <td className="font-mono text-xs text-brand-purple">{exp.expense_number}</td>
                  <td className="text-text-secondary text-sm">{new Date(exp.date).toLocaleDateString("en-AE")}</td>
                  <td>
                    <span className="text-xs bg-bg-secondary border border-bg-border px-2 py-0.5 rounded">
                      {CAT_ICONS[exp.category] || "📁"} {DAILY_CATEGORIES[exp.category] || exp.category}
                    </span>
                  </td>
                  <td className="text-sm max-w-[200px] truncate">{exp.description}</td>
                  <td className="text-text-secondary text-xs capitalize">{exp.payment_method.replace(/_/g, " ")}</td>
                  <td className="text-right font-bold text-red-400">AED {exp.amount.toFixed(2)}</td>
                  <td>
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(exp)} className="text-text-muted hover:text-brand-indigo"><Pencil size={13} /></button>
                      <button onClick={() => handleDelete(exp.id)} className="text-text-muted hover:text-red-400"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t border-bg-border bg-bg-secondary">
                  <td colSpan={5} className="px-4 py-3 text-sm font-bold text-text-secondary">
                    Total ({filtered.length} entries)
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-red-400">
                    AED {todayTotal.toFixed(2)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-bg-border">
              <h3 className="font-semibold">{editId ? "Edit Daily Expense" : "Add Daily Expense"}</h3>
              <button onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">

              {/* Category quick-select */}
              <div>
                <label className="label">Category *</label>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(DAILY_CATEGORIES).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, category: key }))}
                      className={`py-2 px-2 rounded-lg text-xs font-medium border transition-all text-center ${
                        form.category === key
                          ? "border-brand-indigo bg-brand-indigo/10 text-brand-indigo"
                          : "border-bg-border text-text-secondary hover:border-brand-indigo/40"
                      }`}
                    >
                      <div className="text-base mb-0.5">{CAT_ICONS[key]}</div>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Date</label>
                  <input
                    className="input"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">Amount (AED) *</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount || ""}
                    onChange={(e) => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="label">Description *</label>
                <input
                  className="input"
                  value={form.description}
                  onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. Tea for workers — morning"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Payment Method</label>
                  <select
                    className="input"
                    value={form.payment_method}
                    onChange={(e) => setForm(f => ({ ...f, payment_method: e.target.value }))}
                  >
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="online">Online</option>
                  </select>
                </div>
                <div>
                  <label className="label">Reference</label>
                  <input
                    className="input"
                    value={form.reference}
                    onChange={(e) => setForm(f => ({ ...f, reference: e.target.value }))}
                    placeholder="Receipt / ref no."
                  />
                </div>
              </div>

              <div>
                <label className="label">Notes</label>
                <textarea
                  className="input h-14 resize-none"
                  value={form.notes}
                  onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" className="btn-primary flex-1 justify-center">
                  <TrendingDown size={15} /> {editId ? "Update" : "Add Expense"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
