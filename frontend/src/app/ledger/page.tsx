"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import { getCustomers, getCustomerLedger } from "@/lib/api";
import { BookOpen, TrendingUp, TrendingDown } from "lucide-react";

interface Customer { id: number; name: string; }
interface LedgerEntry {
  id: number; date: string; description: string;
  debit: number; credit: number; balance: number; entry_type: string;
}

function LedgerContent() {
  const params = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedId, setSelectedId] = useState(params.get("customer_id") || "");
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { getCustomers().then((r) => setCustomers(r.data)); }, []);

  useEffect(() => {
    if (!selectedId) { setEntries([]); return; }
    setLoading(true);
    getCustomerLedger(parseInt(selectedId))
      .then((r) => setEntries(r.data))
      .finally(() => setLoading(false));
  }, [selectedId]);

  const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
  const closingBalance = entries.length > 0 ? entries[entries.length - 1].balance : 0;

  return (
    <div>
      <Header title="Ledger" />
      <div className="p-6 space-y-5">
        <div className="card max-w-sm">
          <label className="label">Select Customer</label>
          <select className="input" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">— Select Customer —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {selectedId && (
          <>
            <div className="grid grid-cols-3 gap-4">
              <div className="card">
                <p className="text-text-muted text-xs uppercase tracking-wide">Total Debit</p>
                <p className="text-xl font-bold text-status-unpaid mt-1">AED {totalDebit.toFixed(2)}</p>
              </div>
              <div className="card">
                <p className="text-text-muted text-xs uppercase tracking-wide">Total Credit</p>
                <p className="text-xl font-bold text-status-paid mt-1">AED {totalCredit.toFixed(2)}</p>
              </div>
              <div className="card">
                <p className="text-text-muted text-xs uppercase tracking-wide">Balance</p>
                <p className={`text-xl font-bold mt-1 ${closingBalance >= 0 ? "text-amber-400" : "text-emerald-400"}`}>
                  AED {Math.abs(closingBalance).toFixed(2)}
                  <span className="text-xs ml-1 font-normal">{closingBalance >= 0 ? "Dr" : "Cr"}</span>
                </p>
              </div>
            </div>

            <div className="card p-0 overflow-hidden">
              <table className="w-full">
                <thead className="table-head">
                  <tr><th>Date</th><th>Description</th><th>Type</th><th className="text-right">Debit (AED)</th><th className="text-right">Credit (AED)</th><th className="text-right">Balance (AED)</th></tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="text-center py-8 text-text-muted">Loading...</td></tr>
                  ) : entries.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-12 text-text-muted">
                      <BookOpen size={32} className="mx-auto mb-2 opacity-30" />
                      <p>No ledger entries for this customer.</p>
                    </td></tr>
                  ) : entries.map((entry) => (
                    <tr key={entry.id} className="table-row">
                      <td className="text-text-secondary">{new Date(entry.date).toLocaleDateString("en-AE")}</td>
                      <td>{entry.description}</td>
                      <td>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${entry.entry_type === "invoice" ? "text-blue-400 bg-blue-500/10 border-blue-500/20" : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"}`}>
                          {entry.entry_type}
                        </span>
                      </td>
                      <td className="text-right">
                        {entry.debit > 0 ? <span className="text-status-unpaid font-medium">{entry.debit.toFixed(2)}</span> : <span className="text-text-muted">—</span>}
                      </td>
                      <td className="text-right">
                        {entry.credit > 0 ? <span className="text-status-paid font-medium">{entry.credit.toFixed(2)}</span> : <span className="text-text-muted">—</span>}
                      </td>
                      <td className="text-right font-medium">
                        <span className={entry.balance >= 0 ? "text-amber-400" : "text-emerald-400"}>
                          {entry.balance.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!selectedId && (
          <div className="card text-center py-16 text-text-muted">
            <BookOpen size={40} className="mx-auto mb-3 opacity-20" />
            <p>Select a customer to view their ledger</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LedgerPage() {
  return <Suspense><LedgerContent /></Suspense>;
}
