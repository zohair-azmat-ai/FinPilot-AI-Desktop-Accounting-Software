"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import { getCustomers, getStatement, downloadStatementPDF } from "@/lib/api";
import { FileBarChart, FileDown } from "lucide-react";
import toast from "react-hot-toast";

interface Customer { id: number; name: string; }
interface StatementEntry {
  date: string; description: string;
  debit: number; credit: number; balance: number; entry_type: string;
}

function StatementsContent() {
  const params = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedId, setSelectedId] = useState(params.get("customer_id") || "");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [stmt, setStmt] = useState<{
    customer: { name: string; trn: string; address: string };
    opening_balance: number; closing_balance: number;
    entries: StatementEntry[];
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { getCustomers().then((r) => setCustomers(r.data)); }, []);

  const loadStatement = () => {
    if (!selectedId) return;
    setLoading(true);
    const p: Record<string, string> = {};
    if (dateFrom) p.date_from = dateFrom + "T00:00:00";
    if (dateTo) p.date_to = dateTo + "T23:59:59";
    getStatement(parseInt(selectedId), p)
      .then((r) => setStmt(r.data))
      .catch(() => toast.error("Failed to load statement. Please try again."))
      .finally(() => setLoading(false));
  };

  const handleDownload = () => {
    const p: Record<string, string> = {};
    if (dateFrom) p.date_from = dateFrom + "T00:00:00";
    if (dateTo) p.date_to = dateTo + "T23:59:59";
    window.open(downloadStatementPDF(parseInt(selectedId), p), "_blank");
  };

  return (
    <div>
      <Header title="Account Statement" />
      <div className="p-6 space-y-5">
        {/* Filters */}
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="label">Customer *</label>
              <select className="input" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                <option value="">— Select Customer —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">From Date</label>
              <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="label">To Date</label>
              <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <button className="btn-primary flex-1 justify-center" onClick={loadStatement} disabled={!selectedId}>
                Generate
              </button>
              {stmt && (
                <button className="btn-secondary" onClick={handleDownload} title="Download PDF">
                  <FileDown size={15} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Statement */}
        {loading && (
          <div className="card text-center py-12 text-text-muted">Loading statement...</div>
        )}

        {stmt && !loading && (
          <>
            {/* Customer info */}
            <div className="card flex items-start justify-between">
              <div>
                <p className="text-text-muted text-xs uppercase tracking-wide">Statement For</p>
                <h3 className="text-lg font-bold text-text-primary mt-1">{stmt.customer.name}</h3>
                {stmt.customer.trn && <p className="text-xs text-text-secondary">TRN: {stmt.customer.trn}</p>}
                {stmt.customer.address && <p className="text-xs text-text-secondary">{stmt.customer.address}</p>}
              </div>
              <div className="text-right">
                <p className="text-text-muted text-xs">Period</p>
                <p className="text-sm text-text-primary">{dateFrom || "All"} — {dateTo || "Present"}</p>
              </div>
            </div>

            {/* Balances */}
            <div className="grid grid-cols-2 gap-4">
              <div className="card">
                <p className="text-text-muted text-xs uppercase tracking-wide">Opening Balance</p>
                <p className="text-xl font-bold text-text-primary mt-1">AED {stmt.opening_balance.toFixed(2)}</p>
              </div>
              <div className="card">
                <p className="text-text-muted text-xs uppercase tracking-wide">Closing Balance</p>
                <p className={`text-xl font-bold mt-1 ${stmt.closing_balance >= 0 ? "text-amber-400" : "text-emerald-400"}`}>
                  AED {Math.abs(stmt.closing_balance).toFixed(2)} {stmt.closing_balance >= 0 ? "Dr" : "Cr"}
                </p>
              </div>
            </div>

            {/* Entries table */}
            <div className="card p-0 overflow-hidden">
              <table className="w-full">
                <thead className="table-head">
                  <tr>
                    <th>Date</th><th>Description</th>
                    <th className="text-right">Debit (AED)</th>
                    <th className="text-right">Credit (AED)</th>
                    <th className="text-right">Balance (AED)</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Opening balance row */}
                  <tr className="border-b border-bg-border bg-bg-secondary/30">
                    <td className="px-4 py-3 text-text-secondary text-sm">—</td>
                    <td className="px-4 py-3 text-sm font-semibold text-text-primary">Opening Balance</td>
                    <td className="px-4 py-3 text-right text-sm">—</td>
                    <td className="px-4 py-3 text-right text-sm">—</td>
                    <td className="px-4 py-3 text-right text-sm font-bold">{stmt.opening_balance.toFixed(2)}</td>
                  </tr>
                  {stmt.entries.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-text-muted">No transactions in this period.</td></tr>
                  ) : stmt.entries.map((entry, i) => (
                    <tr key={i} className="table-row">
                      <td className="text-text-secondary">{entry.date}</td>
                      <td>{entry.description}</td>
                      <td className="text-right">
                        {entry.debit > 0 ? <span className="text-status-unpaid font-medium">{entry.debit.toFixed(2)}</span> : <span className="text-text-muted">—</span>}
                      </td>
                      <td className="text-right">
                        {entry.credit > 0 ? <span className="text-status-paid font-medium">{entry.credit.toFixed(2)}</span> : <span className="text-text-muted">—</span>}
                      </td>
                      <td className={`text-right font-medium ${entry.balance >= 0 ? "text-amber-400" : "text-emerald-400"}`}>
                        {entry.balance.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {/* Closing balance row */}
                  <tr className="border-t-2 border-brand-indigo/30 bg-brand-indigo/5">
                    <td className="px-4 py-3 text-sm">—</td>
                    <td className="px-4 py-3 text-sm font-bold text-text-primary">Closing Balance</td>
                    <td className="px-4 py-3 text-right text-sm">—</td>
                    <td className="px-4 py-3 text-right text-sm">—</td>
                    <td className={`px-4 py-3 text-right text-sm font-bold ${stmt.closing_balance >= 0 ? "text-amber-400" : "text-emerald-400"}`}>
                      {stmt.closing_balance.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}

        {!stmt && !loading && (
          <div className="card text-center py-16 text-text-muted">
            <FileBarChart size={40} className="mx-auto mb-3 opacity-20" />
            <p>Select a customer and click Generate to view the statement</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function StatementsPage() {
  return <Suspense><StatementsContent /></Suspense>;
}
