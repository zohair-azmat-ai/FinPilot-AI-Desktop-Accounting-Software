"use client";

import { useEffect, useState, useRef } from "react";
import Header from "@/components/Header";
import {
  getExpenses, getExpenseSummary, createExpense, updateExpense, deleteExpense,
  getExpenseParties, getBankAccounts,
} from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Trash2, X, TrendingDown, Pencil, Search, ChevronDown } from "lucide-react";

interface DailyExpense {
  id: number;
  expense_number: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  payment_method: string;
  bank_account?: { name: string };
  party_name: string;
  reference: string;
  notes: string;
  expense_type: string;
}
interface BankAccount { id: number; name: string; account_type: string; }

const DAILY_CATEGORIES: Record<string, string> = {
  material:          "Material",
  tools:             "Tools",
  labour_advance:    "Labour Advance",
  internet_bill:     "Internet / Landline Bill",
  sewa_bill:         "SEWA Bill",
  worker_ticket:     "Worker Ticket / Visa / Travel",
  supplier_purchase: "Supplier Purchase",
  company_purchase:  "Company Purchase",
  petrol:            "Petrol / Fuel",
  parking:           "Parking",
  courier:           "Courier",
  supplies:          "Supplies",
  tea:               "Tea / Refreshments",
  labour_lunch:      "Labour Lunch",
  other:             "Other",
};

const CAT_ICONS: Record<string, string> = {
  material:          "📦",
  tools:             "🔩",
  labour_advance:    "💵",
  internet_bill:     "🌐",
  sewa_bill:         "💧",
  worker_ticket:     "🎫",
  supplier_purchase: "🛒",
  company_purchase:  "🏭",
  petrol:            "⛽",
  parking:           "🅿️",
  courier:           "📬",
  supplies:          "🗂️",
  tea:               "☕",
  labour_lunch:      "🍱",
  other:             "📝",
  // legacy keys so old records still display
  tools_old:         "🔧",
  other_daily:       "📝",
};

const emptyForm = {
  date: new Date().toISOString().split("T")[0],
  category: "material",
  description: "",
  amount: 0,
  payment_method: "cash",
  bank_account_id: "",
  party_name: "",
  reference: "",
  notes: "",
};

// ── Party / Supplier combobox ────────────────────────────────────────────────
function PartyCombobox({
  value, onChange, parties,
}: { value: string; onChange: (v: string) => void; parties: string[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = query
    ? parties.filter((p) => p.toLowerCase().includes(query.toLowerCase()))
    : parties;

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          className="input pr-8"
          placeholder="Type or select party / supplier..."
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        />
        <button
          type="button"
          className="absolute right-2 top-2.5 text-text-muted"
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronDown size={14} />
        </button>
      </div>
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-bg-card border border-bg-border rounded-lg shadow-lg max-h-44 overflow-y-auto">
          {filtered.map((p) => (
            <li
              key={p}
              className="px-3 py-2 text-sm cursor-pointer hover:bg-bg-secondary text-text-primary"
              onMouseDown={() => { onChange(p); setQuery(p); setOpen(false); }}
            >
              {p}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function DailyExpensesPage() {
  const [expenses, setExpenses]   = useState<DailyExpense[]>([]);
  const [summary, setSummary]     = useState<{ total: number; count: number; by_category: Record<string, number> } | null>(null);
  const [accounts, setAccounts]   = useState<BankAccount[]>([]);
  const [parties, setParties]     = useState<string[]>([]);
  const [form, setForm]           = useState(emptyForm);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId]       = useState<number | null>(null);
  const [dateFrom, setDateFrom]   = useState(new Date().toISOString().split("T")[0]);
  const [dateTo, setDateTo]       = useState(new Date().toISOString().split("T")[0]);
  const [search, setSearch]       = useState("");
  const [filterPayType, setFilterPayType] = useState("");  // "" | "cash" | "bank"
  const [filterAccount, setFilterAccount] = useState("");
  const [loading, setLoading]     = useState(true);

  const buildParams = () => {
    const p: Record<string, unknown> = { expense_type: "daily" };
    if (dateFrom) p.date_from = new Date(dateFrom).toISOString();
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      p.date_to = end.toISOString();
    }
    if (filterPayType)  p.payment_type    = filterPayType;
    if (filterAccount)  p.bank_account_id = parseInt(filterAccount);
    return p;
  };

  const load = () => {
    setLoading(true);
    const p = buildParams();
    Promise.all([getExpenses(p), getExpenseSummary(p)])
      .then(([eRes, sRes]) => { setExpenses(eRes.data); setSummary(sRes.data); })
      .finally(() => setLoading(false));
  };

  const refreshParties = () =>
    getExpenseParties().then((r) => setParties(r.data.parties || []));

  useEffect(() => {
    getBankAccounts().then((r) => setAccounts(r.data || []));
    refreshParties();
  }, []);

  useEffect(() => { load(); }, [dateFrom, dateTo, filterPayType, filterAccount]);

  const openNew = () => {
    setForm({ ...emptyForm, date: new Date().toISOString().split("T")[0] });
    setEditId(null);
    setShowModal(true);
  };

  const openEdit = (exp: DailyExpense) => {
    setForm({
      date:           exp.date.split("T")[0],
      category:       exp.category,
      description:    exp.description,
      amount:         exp.amount,
      payment_method: exp.payment_method,
      bank_account_id: "",
      party_name:     exp.party_name || "",
      reference:      exp.reference || "",
      notes:          exp.notes || "",
    });
    setEditId(exp.id);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description.trim()) return toast.error("Description required");
    if (!form.amount || form.amount <= 0) return toast.error("Enter a valid amount");
    const bankId = form.payment_method !== "cash" && form.bank_account_id
      ? parseInt(form.bank_account_id)
      : null;
    const payload = {
      ...form,
      date:            new Date(form.date).toISOString(),
      amount:          parseFloat(String(form.amount)),
      expense_type:    "daily",
      bank_account_id: bankId,
      supplier_id:     null,
      party_name:      form.party_name.trim(),
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
      refreshParties();
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
    e.expense_number.toLowerCase().includes(search.toLowerCase()) ||
    (e.party_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const displayTotal = filtered.reduce((s, e) => s + e.amount, 0);
  const bankAccounts = accounts.filter((a) => a.account_type !== "cash");

  return (
    <div>
      <Header title="Daily Expenses" />
      <div className="p-6 space-y-5">

        {/* ── Controls bar ── */}
        <div className="card p-4 space-y-3">
          {/* Date range */}
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-xs text-text-muted">From</label>
            <input className="input w-36" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <label className="text-xs text-text-muted">To</label>
            <input className="input w-36" type="date" value={dateTo}   onChange={(e) => setDateTo(e.target.value)} />
            <button
              className="btn-secondary text-xs py-1.5"
              onClick={() => { const t = new Date().toISOString().split("T")[0]; setDateFrom(t); setDateTo(t); }}
            >
              Today
            </button>

            {/* Search */}
            <div className="relative w-52">
              <Search size={14} className="absolute left-3 top-2.5 text-text-muted" />
              <input className="input pl-9 text-sm" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>

            <button className="btn-primary ml-auto" onClick={openNew}><Plus size={15} /> Add Daily Expense</button>
          </div>

          {/* Payment type filter */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-text-muted">Filter:</span>
            <div className="flex items-center gap-1 bg-bg-secondary border border-bg-border rounded-lg p-0.5">
              {[["", "All"], ["cash", "💵 Cash"], ["bank", "🏦 Bank"]].map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => { setFilterPayType(v); setFilterAccount(""); }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    filterPayType === v
                      ? "bg-brand-indigo text-white shadow"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Account filter — only when Bank is selected */}
            {filterPayType === "bank" && bankAccounts.length > 0 && (
              <select
                className="input w-44 text-sm"
                value={filterAccount}
                onChange={(e) => setFilterAccount(e.target.value)}
              >
                <option value="">All Bank Accounts</option>
                {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* ── Summary cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card col-span-2 md:col-span-1">
            <p className="text-text-muted text-xs uppercase tracking-wide">Total</p>
            <p className="text-2xl font-bold text-red-400 mt-1">AED {displayTotal.toFixed(2)}</p>
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

        {/* ── Category breakdown ── */}
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

        {/* ── Table ── */}
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="table-head">
              <tr>
                <th>Ref</th>
                <th>Date</th>
                <th>Category</th>
                <th>Party / Supplier</th>
                <th>Description</th>
                <th>Method</th>
                <th>Account</th>
                <th className="text-right">Amount (AED)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-8 text-text-muted">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-text-muted">
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
                  <td className="text-text-secondary text-sm max-w-[110px] truncate">{exp.party_name || "—"}</td>
                  <td className="text-sm max-w-[160px] truncate">{exp.description}</td>
                  <td className="text-text-secondary text-xs capitalize">{exp.payment_method.replace(/_/g, " ")}</td>
                  <td className="text-text-secondary text-xs">{exp.bank_account?.name || "Cash"}</td>
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
                  <td colSpan={7} className="px-4 py-3 text-sm font-bold text-text-secondary">
                    Total ({filtered.length} entries)
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-red-400">
                    AED {displayTotal.toFixed(2)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal max-w-xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-bg-border">
              <h3 className="font-semibold">{editId ? "Edit Daily Expense" : "Add Daily Expense"}</h3>
              <button onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">

              {/* Category grid */}
              <div>
                <label className="label">Category *</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {Object.entries(DAILY_CATEGORIES).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, category: key }))}
                      className={`py-2 px-2 rounded-lg text-xs font-medium border transition-all text-center ${
                        form.category === key
                          ? "border-brand-indigo bg-brand-indigo/10 text-brand-indigo"
                          : "border-bg-border text-text-secondary hover:border-brand-indigo/40"
                      }`}
                    >
                      <div className="text-base mb-0.5">{CAT_ICONS[key] || "📁"}</div>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date + Amount */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Date</label>
                  <input className="input" type="date" value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Amount (AED) *</label>
                  <input className="input" type="number" min="0" step="0.01"
                    value={form.amount || ""}
                    onChange={(e) => setForm((f) => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                    required />
                </div>
              </div>

              {/* Party / Supplier */}
              <div>
                <label className="label">Party / Supplier</label>
                <PartyCombobox
                  value={form.party_name}
                  onChange={(v) => setForm((f) => ({ ...f, party_name: v }))}
                  parties={parties}
                />
                <p className="text-text-muted text-xs mt-1">
                  Type a new name to save it, or pick from previous entries.
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="label">Description / Item *</label>
                <input className="input" value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. Steel pipes — workshop repair" required />
              </div>

              {/* Payment Method */}
              <div>
                <label className="label">Payment Method</label>
                <div className="flex gap-2">
                  {[
                    ["cash",          "💵 Cash"],
                    ["bank_transfer", "🏦 Bank Transfer"],
                    ["cheque",        "📝 Cheque"],
                    ["online",        "💳 Online"],
                  ].map(([v, label]) => (
                    <button
                      key={v} type="button"
                      onClick={() => setForm((f) => ({
                        ...f,
                        payment_method: v,
                        bank_account_id: v === "cash" ? "" : f.bank_account_id,
                      }))}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                        form.payment_method === v
                          ? "border-brand-indigo bg-brand-indigo/10 text-brand-indigo"
                          : "border-bg-border text-text-secondary hover:border-brand-indigo/40"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bank Account — only for non-cash */}
              {form.payment_method !== "cash" && (
                <div>
                  <label className="label">Bank Account</label>
                  <select className="input" value={form.bank_account_id}
                    onChange={(e) => setForm((f) => ({ ...f, bank_account_id: e.target.value }))}>
                    <option value="">— Select account —</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}

              {/* Reference */}
              <div>
                <label className="label">Reference / Receipt No.</label>
                <input className="input" value={form.reference}
                  onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                  placeholder="Optional" />
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
