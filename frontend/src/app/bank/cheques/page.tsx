"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import {
  getCheques, getChequeStats, createCheque, updateChequeStatus, deleteCheque,
  getBankAccounts, getCustomers, getSuppliers
} from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Trash2, X, CheckSquare, Edit2, Search } from "lucide-react";

interface Cheque {
  id: number; cheque_number: string; cheque_date: string; bank_name: string;
  party_name: string; amount: number; cheque_type: string; status: string;
  customer_id?: number; supplier_id?: number; notes: string;
}
interface BankAccount { id: number; name: string; }
interface Customer { id: number; name: string; }
interface Supplier { id: number; name: string; }
interface Stats { pending_received: number; pending_issued: number; cleared_count: number; bounced_count: number; }

const statusColors: Record<string, string> = {
  pending: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  cleared: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  bounced: "text-red-400 bg-red-500/10 border-red-500/20",
  cancelled: "text-gray-400 bg-gray-500/10 border-gray-500/20",
};

const emptyForm = {
  cheque_number: "", cheque_date: new Date().toISOString().split("T")[0],
  bank_name: "", party_name: "", customer_id: "", supplier_id: "",
  bank_account_id: "", amount: 0, cheque_type: "received", status: "pending", notes: ""
};

export default function ChequesPage() {
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [showModal, setShowModal] = useState(false);
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    const p: Record<string, unknown> = {};
    if (filterType) p.cheque_type = filterType;
    if (filterStatus) p.status = filterStatus;
    Promise.all([getCheques(p), getChequeStats()])
      .then(([cRes, sRes]) => { setCheques(cRes.data); setStats(sRes.data); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    getBankAccounts().then((r) => setAccounts(r.data));
    getCustomers().then((r) => setCustomers(r.data));
    getSuppliers().then((r) => setSuppliers(r.data));
  }, []);

  useEffect(() => { load(); }, [filterType, filterStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.cheque_number.trim()) return toast.error("Cheque number is required");
    try {
      await createCheque({
        ...form,
        cheque_date: new Date(form.cheque_date).toISOString(),
        customer_id: form.customer_id ? parseInt(form.customer_id) : null,
        supplier_id: form.supplier_id ? parseInt(form.supplier_id) : null,
        bank_account_id: form.bank_account_id ? parseInt(form.bank_account_id) : null,
        amount: parseFloat(String(form.amount))
      });
      toast.success("Cheque recorded!");
      setShowModal(false);
      setForm(emptyForm);
      load();
    } catch { toast.error("Failed."); }
  };

  const handleStatusChange = async (id: number, status: string) => {
    try {
      await updateChequeStatus(id, status);
      toast.success(`Cheque marked as ${status}`);
      load();
    } catch { toast.error("Failed to update status."); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this cheque?")) return;
    try { await deleteCheque(id); toast.success("Deleted."); load(); }
    catch { toast.error("Failed."); }
  };

  const filtered = cheques.filter((c) =>
    c.cheque_number.toLowerCase().includes(search.toLowerCase()) ||
    c.party_name.toLowerCase().includes(search.toLowerCase()) ||
    c.bank_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <Header title="Cheque Management" />
      <div className="p-6 space-y-5">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Pending Received", value: `AED ${stats.pending_received.toFixed(2)}`, color: "text-amber-400" },
              { label: "Pending Issued", value: `AED ${stats.pending_issued.toFixed(2)}`, color: "text-red-400" },
              { label: "Cleared", value: stats.cleared_count, color: "text-emerald-400" },
              { label: "Bounced", value: stats.bounced_count, color: "text-red-500" },
            ].map((s) => (
              <div key={s.label} className="card">
                <p className="text-text-muted text-xs uppercase tracking-wide">{s.label}</p>
                <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative w-56">
            <Search size={15} className="absolute left-3 top-2.5 text-text-muted" />
            <input className="input pl-9" placeholder="Search cheques..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input w-36" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="">All Types</option>
            <option value="received">Received</option>
            <option value="issued">Issued</option>
          </select>
          <select className="input w-36" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="cleared">Cleared</option>
            <option value="bounced">Bounced</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button className="btn-primary ml-auto" onClick={() => setShowModal(true)}><Plus size={15} /> Add Cheque</button>
        </div>

        {/* Table */}
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="table-head">
              <tr><th>Cheque No.</th><th>Date</th><th>Party</th><th>Bank</th><th>Amount</th><th>Type</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-8 text-text-muted">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-text-muted">
                  <CheckSquare size={32} className="mx-auto mb-2 opacity-30" />
                  <p>No cheques found.</p>
                </td></tr>
              ) : filtered.map((ch) => {
                const sc = statusColors[ch.status] || statusColors.pending;
                return (
                  <tr key={ch.id} className="table-row">
                    <td className="font-mono font-medium text-brand-indigo">{ch.cheque_number}</td>
                    <td className="text-text-secondary text-sm">{new Date(ch.cheque_date).toLocaleDateString("en-AE")}</td>
                    <td className="font-medium">{ch.party_name || "—"}</td>
                    <td className="text-text-secondary text-sm">{ch.bank_name || "—"}</td>
                    <td className="font-bold">AED {ch.amount.toFixed(2)}</td>
                    <td>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${ch.cheque_type === "received" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-red-400 bg-red-500/10 border-red-500/20"}`}>
                        {ch.cheque_type}
                      </span>
                    </td>
                    <td>
                      <select
                        value={ch.status}
                        onChange={(e) => handleStatusChange(ch.id, e.target.value)}
                        className={`text-xs px-2 py-1 rounded-full border bg-transparent cursor-pointer ${sc}`}
                      >
                        <option value="pending">Pending</option>
                        <option value="cleared">Cleared</option>
                        <option value="bounced">Bounced</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </td>
                    <td>
                      <button onClick={() => handleDelete(ch.id)} className="text-text-muted hover:text-red-400"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-bg-border">
              <h3 className="font-semibold">Add Cheque</h3>
              <button onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* Type */}
              <div className="flex gap-3">
                {(["received", "issued"] as const).map((t) => (
                  <button key={t} type="button"
                    onClick={() => setForm(f => ({ ...f, cheque_type: t }))}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all ${form.cheque_type === t ? t === "received" ? "border-emerald-500 bg-emerald-500/10 text-emerald-400" : "border-red-500 bg-red-500/10 text-red-400" : "border-bg-border text-text-secondary"}`}>
                    {t === "received" ? "✅ Cheque Received" : "📤 Cheque Issued"}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Cheque Number *</label>
                  <input className="input font-mono" value={form.cheque_number} onChange={(e) => setForm(f => ({ ...f, cheque_number: e.target.value }))} required placeholder="e.g. 001234" /></div>
                <div><label className="label">Cheque Date</label>
                  <input className="input" type="date" value={form.cheque_date} onChange={(e) => setForm(f => ({ ...f, cheque_date: e.target.value }))} /></div>
                <div><label className="label">Amount (AED) *</label>
                  <input className="input" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} required /></div>
                <div><label className="label">Bank Name</label>
                  <input className="input" value={form.bank_name} onChange={(e) => setForm(f => ({ ...f, bank_name: e.target.value }))} placeholder="e.g. Emirates NBD" /></div>
                <div className="col-span-2"><label className="label">Party Name</label>
                  <input className="input" value={form.party_name} onChange={(e) => setForm(f => ({ ...f, party_name: e.target.value }))} placeholder="Customer / supplier name" /></div>
                {form.cheque_type === "received" && (
                  <div><label className="label">Link to Customer</label>
                    <select className="input" value={form.customer_id} onChange={(e) => setForm(f => ({ ...f, customer_id: e.target.value }))}>
                      <option value="">— Optional —</option>
                      {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select></div>
                )}
                {form.cheque_type === "issued" && (
                  <div><label className="label">Link to Supplier</label>
                    <select className="input" value={form.supplier_id} onChange={(e) => setForm(f => ({ ...f, supplier_id: e.target.value }))}>
                      <option value="">— Optional —</option>
                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select></div>
                )}
                <div><label className="label">Bank Account</label>
                  <select className="input" value={form.bank_account_id} onChange={(e) => setForm(f => ({ ...f, bank_account_id: e.target.value }))}>
                    <option value="">— Optional —</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select></div>
                <div><label className="label">Status</label>
                  <select className="input" value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="pending">Pending</option>
                    <option value="cleared">Cleared</option>
                    <option value="bounced">Bounced</option>
                    <option value="cancelled">Cancelled</option>
                  </select></div>
              </div>
              <div><label className="label">Notes</label>
                <textarea className="input h-14 resize-none" value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" className="btn-primary flex-1 justify-center">Add Cheque</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
