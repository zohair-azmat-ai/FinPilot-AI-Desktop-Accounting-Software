"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import {
  getBankAccounts, getBankAccountsSummary, createBankAccount,
  updateBankAccount, deleteBankAccount
} from "@/lib/api";
import toast from "react-hot-toast";
import {
  Plus, Edit2, Trash2, Landmark, X, Wallet,
  ArrowDownLeft, ArrowUpRight, TrendingDown, ChevronRight
} from "lucide-react";

interface BankAccount {
  id: number; name: string; bank_name: string; account_number: string;
  iban: string; account_type: string; opening_balance: number; is_active: boolean;
}
interface AccountSummary { id: number; name: string; bank_name: string; account_type: string; current_balance: number; }

const emptyForm = { name: "", bank_name: "", account_number: "", iban: "", account_type: "bank", opening_balance: 0, is_active: true };

export default function BankPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [summary, setSummary] = useState<{ accounts: AccountSummary[]; total_balance: number } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [acctRes, sumRes] = await Promise.all([getBankAccounts(), getBankAccountsSummary()]);
      setAccounts(acctRes.data);
      setSummary(sumRes.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(emptyForm); setEditing(null); setShowModal(true); };
  const openEdit = (a: BankAccount) => { setForm(a); setEditing(a); setShowModal(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Account name is required");
    try {
      if (editing) { await updateBankAccount(editing.id, form); toast.success("Account updated!"); }
      else { await createBankAccount(form); toast.success("Account added!"); }
      setShowModal(false); load();
    } catch { toast.error("Failed to save."); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this bank account? All linked transactions will be removed.")) return;
    try { await deleteBankAccount(id); toast.success("Deleted."); load(); }
    catch { toast.error("Failed to delete."); }
  };

  const fmt = (n: number) => `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 2 })}`;

  const quickLinks = [
    { label: "Record Money In", icon: ArrowDownLeft, href: "/bank/transactions?type=received", color: "text-emerald-400" },
    { label: "Record Money Out", icon: ArrowUpRight, href: "/bank/transactions?type=paid", color: "text-red-400" },
    { label: "Manage Cheques", icon: Wallet, href: "/bank/cheques", color: "text-blue-400" },
    { label: "Add Expense", icon: TrendingDown, href: "/bank/expenses", color: "text-amber-400" },
  ];

  return (
    <div>
      <Header title="Bank / Cash" />
      <div className="p-6 space-y-5">
        {/* Total balance card */}
        {summary && (
          <div className="card bg-gradient-to-br from-brand-indigo/20 to-brand-purple/10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-text-muted text-xs uppercase tracking-wide">Total Balance Across All Accounts</p>
                <p className="text-3xl font-bold text-gradient mt-1">{fmt(summary.total_balance)}</p>
              </div>
              <Landmark size={40} className="text-brand-indigo opacity-30" />
            </div>
          </div>
        )}

        {/* Quick links */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {quickLinks.map((ql) => {
            const Icon = ql.icon;
            return (
              <button
                key={ql.label}
                onClick={() => router.push(ql.href)}
                className="card flex items-center gap-3 hover:border-brand-indigo/40 transition-all group"
              >
                <Icon size={18} className={ql.color} />
                <span className="text-sm font-medium text-text-primary">{ql.label}</span>
                <ChevronRight size={13} className="ml-auto text-text-muted group-hover:text-brand-indigo" />
              </button>
            );
          })}
        </div>

        {/* Account cards grid */}
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-text-primary">Bank & Cash Accounts</h3>
          <button className="btn-primary" onClick={openNew}><Plus size={15} /> Add Account</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card animate-pulse h-36" />
            ))
          ) : accounts.length === 0 ? (
            <div className="card col-span-3 text-center py-16 text-text-muted">
              <Landmark size={40} className="mx-auto mb-3 opacity-20" />
              <p>No accounts yet. Add a bank or cash account.</p>
              <button className="btn-primary mt-4 mx-auto" onClick={openNew}><Plus size={14} /> Add Account</button>
            </div>
          ) : (
            accounts.map((acct) => {
              const bal = summary?.accounts.find(a => a.id === acct.id)?.current_balance ?? 0;
              return (
                <div key={acct.id} className="card hover:border-brand-indigo/30 transition-all">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${acct.account_type === "cash" ? "bg-amber-500/10 text-amber-400" : "bg-brand-indigo/10 text-brand-indigo"}`}>
                        {acct.account_type === "cash" ? <Wallet size={16} /> : <Landmark size={16} />}
                      </div>
                      <div>
                        <p className="font-semibold text-text-primary text-sm">{acct.name}</p>
                        <p className="text-xs text-text-muted">{acct.bank_name || (acct.account_type === "cash" ? "Cash Account" : "Bank")}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(acct)} className="text-text-muted hover:text-brand-indigo p-1"><Edit2 size={13} /></button>
                      <button onClick={() => handleDelete(acct.id)} className="text-text-muted hover:text-red-400 p-1"><Trash2 size={13} /></button>
                    </div>
                  </div>
                  <div className="space-y-1 mb-3">
                    {acct.account_number && (
                      <p className="text-xs text-text-secondary font-mono">Acc: {acct.account_number}</p>
                    )}
                    {acct.iban && (
                      <p className="text-xs text-text-secondary font-mono truncate">IBAN: {acct.iban}</p>
                    )}
                  </div>
                  <div className="pt-3 border-t border-bg-border flex items-center justify-between">
                    <span className="text-xs text-text-muted">Current Balance</span>
                    <span className={`font-bold text-lg ${bal >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {fmt(bal)}
                    </span>
                  </div>
                  <button
                    onClick={() => router.push(`/bank/statement?account_id=${acct.id}`)}
                    className="mt-2 w-full text-xs text-brand-indigo hover:text-brand-glow flex items-center justify-center gap-1 py-1"
                  >
                    View Statement <ChevronRight size={11} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-bg-border">
              <h3 className="font-semibold">{editing ? "Edit Account" : "Add Bank / Cash Account"}</h3>
              <button onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="label">Account Type</label>
                <div className="flex gap-3">
                  {["bank", "cash"].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm({ ...form, account_type: t })}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                        form.account_type === t
                          ? "border-brand-indigo bg-brand-indigo/10 text-brand-indigo"
                          : "border-bg-border text-text-secondary hover:border-brand-indigo/40"
                      }`}
                    >
                      {t === "bank" ? "🏦 Bank Account" : "💵 Cash Account"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Account Name *</label>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Emirates NBD Current" required />
              </div>
              {form.account_type === "bank" && (
                <>
                  <div>
                    <label className="label">Bank Name</label>
                    <input className="input" value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} placeholder="e.g. Emirates NBD" />
                  </div>
                  <div>
                    <label className="label">Account Number</label>
                    <input className="input font-mono" value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} placeholder="0123456789" />
                  </div>
                  <div>
                    <label className="label">IBAN</label>
                    <input className="input font-mono" value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} placeholder="AE070331234567890123456" />
                  </div>
                </>
              )}
              <div>
                <label className="label">Opening Balance (AED)</label>
                <input className="input" type="number" step="0.01" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" className="btn-primary flex-1 justify-center">{editing ? "Update" : "Add Account"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
