"use client";

import { useEffect, useState, useRef } from "react";
import Header from "@/components/Header";
import {
  getExpenses, getExpenseSummary, getExpenseCategories, getExpenseParties,
  createExpense, deleteExpense, getBankAccounts,
} from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Trash2, X, TrendingDown, Search, ChevronDown } from "lucide-react";

interface Expense {
  id: number; expense_number: string; date: string; category: string;
  description: string; amount: number; payment_method: string;
  bank_account?: { name: string }; party_name: string; reference: string;
}
interface BankAccount { id: number; name: string; account_type: string; }

const CATEGORY_LABELS: Record<string, string> = {
  office_expense: "Office Expense", rent: "Rent", salary: "Salary",
  fuel: "Fuel", maintenance: "Maintenance", utilities: "Utilities",
  travel: "Travel", marketing: "Marketing", insurance: "Insurance",
  labour_advance: "Labour Advance", internet_bill: "Internet / Landline Bill",
  sewa_bill: "SEWA Bill", worker_ticket: "Worker Ticket / Visa / Travel",
  supplier_purchase: "Supplier Purchase", company_purchase: "Company Purchase",
  material: "Material", tools: "Tools",
  tea: "Tea / Refreshments", petrol: "Petrol", parking: "Parking",
  labour_lunch: "Labour Lunch", courier: "Courier", supplies: "Supplies",
  other: "Other", other_daily: "Other (Daily)", custom: "Custom",
};

const CATEGORY_ICONS: Record<string, string> = {
  office_expense: "🖊️", rent: "🏢", salary: "👤", fuel: "⛽",
  maintenance: "🔧", utilities: "💡", travel: "✈️", marketing: "📢",
  insurance: "🛡️", labour_advance: "💵", internet_bill: "🌐",
  sewa_bill: "💧", worker_ticket: "🎫", supplier_purchase: "🛒",
  company_purchase: "🏭", material: "📦", tools: "🔩",
  tea: "☕", petrol: "⛽", parking: "🅿️", labour_lunch: "🍱",
  courier: "📬", supplies: "🗂️", other: "📁", other_daily: "📁", custom: "📁",
};

const emptyForm = {
  date: new Date().toISOString().split("T")[0],
  category: "other",
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
export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<{ total: number; count: number; by_category: Record<string, number> } | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [parties, setParties] = useState<string[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [showModal, setShowModal] = useState(false);
  const [filterCat, setFilterCat] = useState("");
  const [filterPayType, setFilterPayType] = useState("");   // "" | "cash" | "bank"
  const [filterAccount, setFilterAccount] = useState("");   // "" | account id
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const buildParams = () => {
    const p: Record<string, unknown> = {};
    if (filterCat)       p.category        = filterCat;
    if (filterPayType)   p.payment_type     = filterPayType;
    if (filterAccount)   p.bank_account_id  = parseInt(filterAccount);
    if (dateFrom)        p.date_from        = new Date(dateFrom).toISOString();
    if (dateTo)          p.date_to          = new Date(dateTo).toISOString();
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
    getExpenseCategories().then((r) => setCategories(r.data.categories || []));
    getBankAccounts().then((r) => setAccounts(r.data || []));
    refreshParties();
  }, []);

  useEffect(() => { load(); }, [filterCat, filterPayType, filterAccount, dateFrom, dateTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description.trim()) return toast.error("Description is required");
    if (!form.amount || form.amount <= 0) return toast.error("Enter valid amount");
    const bankId = form.payment_method !== "cash" && form.bank_account_id
      ? parseInt(form.bank_account_id)
      : null;
    try {
      await createExpense({
        ...form,
        date: new Date(form.date).toISOString(),
        amount: parseFloat(String(form.amount)),
        bank_account_id: bankId,
        party_name: form.party_name.trim(),
      });
      toast.success("Expense recorded!");
      setShowModal(false);
      setForm(emptyForm);
      load();
      refreshParties();
    } catch { toast.error("Failed to save expense."); }
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

  // Cash accounts = accounts with type "cash" or named "cash"; bank accounts = rest
  const cashAccounts  = accounts.filter((a) => a.account_type === "cash");
  const bankAccounts  = accounts.filter((a) => a.account_type !== "cash");

  return (
    <div>
      <Header title="Expenses" />
      <div className="p-6 space-y-5">

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card">
              <p className="text-text-muted text-xs uppercase tracking-wide">Total Expenses</p>
              <p className="text-2xl font-bold text-red-400 mt-1">AED {summary.total.toFixed(2)}</p>
              <p className="text-text-muted text-xs mt-1">{summary.count} entries</p>
            </div>
            {Object.entries(summary.by_category).slice(0, 2).map(([cat, amt]) => (
              <div key={cat} className="card">
                <p className="text-text-muted text-xs uppercase tracking-wide flex items-center gap-1">
                  {CATEGORY_ICONS[cat] || "📁"} {CATEGORY_LABELS[cat] || cat}
                </p>
                <p className="text-xl font-bold text-amber-400 mt-1">AED {(amt as number).toFixed(2)}</p>
              </div>
            ))}
          </div>
        )}

        {/* Category breakdown */}
        {summary && Object.keys(summary.by_category).length > 0 && (
          <div className="card">
            <p className="text-xs text-text-muted uppercase tracking-wide mb-3">By Category</p>
            <div className="space-y-2">
              {Object.entries(summary.by_category).map(([cat, amt]) => {
                const pct = summary.total > 0 ? ((amt as number) / summary.total) * 100 : 0;
                return (
                  <div key={cat}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-text-secondary">{CATEGORY_ICONS[cat] || "📁"} {CATEGORY_LABELS[cat] || cat}</span>
                      <span className="text-text-primary font-medium">
                        AED {(amt as number).toFixed(2)} <span className="text-text-muted">({pct.toFixed(1)}%)</span>
                      </span>
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

        {/* ── Filters ── */}
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative w-52">
              <Search size={14} className="absolute left-3 top-2.5 text-text-muted" />
              <input className="input pl-9 text-sm" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>

            {/* Payment Method filter */}
            <div className="flex items-center gap-1 bg-bg-secondary border border-bg-border rounded-lg p-0.5">
              {[["", "All"], ["cash", "Cash"], ["bank", "Bank"]].map(([v, label]) => (
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

            {/* Account filter — only relevant when "bank" is selected */}
            {filterPayType === "bank" && bankAccounts.length > 0 && (
              <select
                className="input w-44 text-sm"
                value={filterAccount}
                onChange={(e) => setFilterAccount(e.target.value)}
              >
                <option value="">All Bank Accounts</option>
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            )}

            {/* Category filter */}
            <select className="input w-44 text-sm" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
              <option value="">All Categories</option>
              {categories.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>)}
            </select>

            {/* Date range */}
            <input className="input w-34 text-sm" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <input className="input w-34 text-sm" type="date" value={dateTo}   onChange={(e) => setDateTo(e.target.value)} />

            <button className="btn-primary ml-auto" onClick={() => setShowModal(true)}>
              <Plus size={15} /> Add Expense
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="table-head">
              <tr>
                <th>Ref</th><th>Date</th><th>Category</th>
                <th>Party / Supplier</th><th>Description</th>
                <th>Method</th><th>Account</th>
                <th className="text-right">Amount</th><th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-8 text-text-muted">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-text-muted">
                  <TrendingDown size={32} className="mx-auto mb-2 opacity-30" /><p>No expenses found.</p>
                </td></tr>
              ) : filtered.map((exp) => (
                <tr key={exp.id} className="table-row">
                  <td className="font-mono text-xs text-brand-purple">{exp.expense_number}</td>
                  <td className="text-text-secondary text-sm">{new Date(exp.date).toLocaleDateString("en-AE")}</td>
                  <td>
                    <span className="text-xs bg-bg-secondary border border-bg-border px-2 py-0.5 rounded">
                      {CATEGORY_ICONS[exp.category] || "📁"} {CATEGORY_LABELS[exp.category] || exp.category}
                    </span>
                  </td>
                  <td className="text-text-secondary text-sm max-w-[120px] truncate">{exp.party_name || "—"}</td>
                  <td className="max-w-[180px] truncate text-sm">{exp.description}</td>
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

      {/* ── Add Expense Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal max-w-xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-bg-border">
              <h3 className="font-semibold">Add Expense</h3>
              <button onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">

              {/* Category grid */}
              <div>
                <label className="label">Category *</label>
                <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto pr-1">
                  {categories.map((c) => (
                    <button
                      key={c} type="button"
                      onClick={() => setForm((f) => ({ ...f, category: c }))}
                      className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition-all text-left ${
                        form.category === c
                          ? "border-brand-indigo bg-brand-indigo/10 text-brand-indigo"
                          : "border-bg-border text-text-secondary hover:border-brand-indigo/40"
                      }`}
                    >
                      {CATEGORY_ICONS[c] || "📁"} {CATEGORY_LABELS[c] || c}
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
                  placeholder="e.g. Monthly rent — May 2026" required />
              </div>

              {/* Payment Method */}
              <div>
                <label className="label">Payment Method</label>
                <div className="flex gap-2">
                  {[["cash", "💵 Cash"], ["bank_transfer", "🏦 Bank Transfer"], ["cheque", "📝 Cheque"], ["online", "💳 Online"]].map(([v, label]) => (
                    <button
                      key={v} type="button"
                      onClick={() => setForm((f) => ({ ...f, payment_method: v, bank_account_id: v === "cash" ? "" : f.bank_account_id }))}
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

              {/* Bank Account — only shown for non-cash */}
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

              {/* Reference + Notes */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Reference / Receipt No.</label>
                  <input className="input" value={form.reference}
                    onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                    placeholder="Optional" />
                </div>
                <div>
                  <label className="label">Notes</label>
                  <input className="input" value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Optional" />
                </div>
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
