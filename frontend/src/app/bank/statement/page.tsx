"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import { getBankAccounts, getBankStatement, downloadBankStatementPDF } from "@/lib/api";
import { Wallet, FileDown, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import toast from "react-hot-toast";

interface BankAccount { id: number; name: string; bank_name: string; account_type: string; }
interface StmtEntry {
  date: string; description: string; party_name: string;
  method: string; money_in: number; money_out: number; balance: number;
}
interface Statement {
  account: { id: number; name: string; bank_name: string; account_number: string; iban: string; account_type: string; };
  date_from: string | null; date_to: string | null;
  opening_balance: number; total_in: number; total_out: number;
  closing_balance: number; entries: StmtEntry[];
}

function BankStatementContent() {
  const params = useSearchParams();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [selectedId, setSelectedId] = useState(params.get("account_id") || "");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [stmt, setStmt] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { getBankAccounts().then((r) => setAccounts(r.data)); }, []);

  const loadStatement = () => {
    if (!selectedId) return;
    setLoading(true);
    const p: Record<string, string> = {};
    if (dateFrom) p.date_from = dateFrom + "T00:00:00";
    if (dateTo) p.date_to = dateTo + "T23:59:59";
    getBankStatement(parseInt(selectedId), p)
      .then((r) => setStmt(r.data))
      .catch(() => toast.error("Failed to load bank statement. Please try again."))
      .finally(() => setLoading(false));
  };

  const handleDownload = () => {
    if (!selectedId) return;
    const p: Record<string, string> = {};
    if (dateFrom) p.date_from = dateFrom + "T00:00:00";
    if (dateTo) p.date_to = dateTo + "T23:59:59";
    window.open(downloadBankStatementPDF(parseInt(selectedId), p), "_blank");
  };

  const selectedAcct = accounts.find((a) => a.id === parseInt(selectedId));

  return (
    <div>
      <Header title="Bank Statement" />
      <div className="p-6 space-y-5">
        {/* Filters */}
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="label">Account *</label>
              <select className="input" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                <option value="">— Select Account —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.account_type === "cash" ? "💵" : "🏦"} {a.name}
                    {a.bank_name ? ` — ${a.bank_name}` : ""}
                  </option>
                ))}
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
                <button className="btn-secondary px-3" onClick={handleDownload} title="Download PDF">
                  <FileDown size={15} />
                </button>
              )}
            </div>
          </div>
        </div>

        {loading && (
          <div className="card text-center py-12 text-text-muted">
            <div className="w-8 h-8 border-2 border-brand-indigo border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p>Loading statement...</p>
          </div>
        )}

        {stmt && !loading && (
          <>
            {/* Account header */}
            <div className="card">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${stmt.account.account_type === "cash" ? "bg-amber-500/10" : "bg-brand-indigo/10"}`}>
                    {stmt.account.account_type === "cash" ? "💵" : "🏦"}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-text-primary">{stmt.account.name}</h3>
                    {stmt.account.bank_name && <p className="text-sm text-text-secondary">{stmt.account.bank_name}</p>}
                    <div className="flex gap-4 mt-1">
                      {stmt.account.account_number && (
                        <span className="text-xs font-mono text-text-muted">Acc: {stmt.account.account_number}</span>
                      )}
                      {stmt.account.iban && (
                        <span className="text-xs font-mono text-text-muted">IBAN: {stmt.account.iban}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-text-muted">Period</p>
                  <p className="text-sm text-text-secondary">
                    {dateFrom || "All"} — {dateTo || "Present"}
                  </p>
                </div>
              </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Opening Balance", value: stmt.opening_balance, color: "text-text-primary" },
                { label: "Total Money In", value: stmt.total_in, color: "text-emerald-400", icon: <ArrowDownLeft size={14} /> },
                { label: "Total Money Out", value: stmt.total_out, color: "text-red-400", icon: <ArrowUpRight size={14} /> },
                { label: "Closing Balance", value: stmt.closing_balance, color: stmt.closing_balance >= 0 ? "text-brand-indigo" : "text-red-400" },
              ].map((s) => (
                <div key={s.label} className="card">
                  <p className="text-text-muted text-xs uppercase tracking-wide flex items-center gap-1">
                    {s.icon}{s.label}
                  </p>
                  <p className={`text-xl font-bold mt-1 ${s.color}`}>
                    AED {Math.abs(s.value).toFixed(2)}
                    {s.label === "Closing Balance" && s.value < 0 && <span className="text-xs ml-1">(Dr)</span>}
                  </p>
                </div>
              ))}
            </div>

            {/* Statement table */}
            <div className="card p-0 overflow-hidden">
              <table className="w-full">
                <thead className="table-head">
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Party</th>
                    <th>Method</th>
                    <th className="text-right text-emerald-400">Money In</th>
                    <th className="text-right text-red-400">Money Out</th>
                    <th className="text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Opening balance row */}
                  <tr className="border-b border-bg-border bg-bg-secondary/30">
                    <td className="px-4 py-3 text-text-secondary text-sm">—</td>
                    <td className="px-4 py-3 text-sm font-semibold text-text-primary">Opening Balance</td>
                    <td className="px-4 py-3 text-sm">—</td>
                    <td className="px-4 py-3 text-sm">—</td>
                    <td className="px-4 py-3 text-right text-sm">—</td>
                    <td className="px-4 py-3 text-right text-sm">—</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-text-primary">
                      {stmt.opening_balance.toFixed(2)}
                    </td>
                  </tr>

                  {stmt.entries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-text-muted">
                        No transactions in this period.
                      </td>
                    </tr>
                  ) : (
                    stmt.entries.map((entry, i) => (
                      <tr key={i} className="table-row">
                        <td className="text-text-secondary text-sm">{entry.date}</td>
                        <td className="text-sm max-w-[200px] truncate">{entry.description}</td>
                        <td className="text-text-secondary text-sm">{entry.party_name || "—"}</td>
                        <td>
                          <span className="text-xs bg-bg-secondary border border-bg-border px-2 py-0.5 rounded capitalize">
                            {entry.method.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="text-right font-medium text-emerald-400">
                          {entry.money_in > 0 ? entry.money_in.toFixed(2) : <span className="text-text-muted">—</span>}
                        </td>
                        <td className="text-right font-medium text-red-400">
                          {entry.money_out > 0 ? entry.money_out.toFixed(2) : <span className="text-text-muted">—</span>}
                        </td>
                        <td className={`text-right font-mono font-medium ${entry.balance >= 0 ? "text-text-primary" : "text-red-400"}`}>
                          {entry.balance.toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}

                  {/* Closing balance row */}
                  <tr className="border-t-2 border-brand-indigo/30 bg-brand-indigo/5">
                    <td className="px-4 py-3 text-sm">—</td>
                    <td className="px-4 py-3 text-sm font-bold text-text-primary">Closing Balance</td>
                    <td className="px-4 py-3 text-sm">—</td>
                    <td className="px-4 py-3 text-sm">—</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-emerald-400">
                      {stmt.total_in.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-red-400">
                      {stmt.total_out.toFixed(2)}
                    </td>
                    <td className={`px-4 py-3 text-right text-sm font-bold ${stmt.closing_balance >= 0 ? "text-brand-indigo" : "text-red-400"}`}>
                      {stmt.closing_balance.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Download button */}
            <div className="flex justify-end">
              <button onClick={handleDownload} className="btn-secondary">
                <FileDown size={15} /> Download PDF Statement
              </button>
            </div>
          </>
        )}

        {!stmt && !loading && (
          <div className="card text-center py-16 text-text-muted">
            <Wallet size={40} className="mx-auto mb-3 opacity-20" />
            <p>Select an account and click Generate to view bank statement</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BankStatementPage() {
  return <Suspense><BankStatementContent /></Suspense>;
}
