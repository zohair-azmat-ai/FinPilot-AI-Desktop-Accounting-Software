"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import { getSuppliers, getSupplierLedger } from "@/lib/api";
import { BookOpen } from "lucide-react";

interface Supplier { id: number; name: string; }
interface LedgerEntry {
  date: string; type: string; reference: string;
  description: string; debit: number; credit: number; balance: number;
}
interface LedgerData {
  supplier: { id: number; name: string; trn: string; phone: string; address: string };
  opening_balance: number;
  closing_balance: number;
  entries: LedgerEntry[];
}

function SupplierLedgerContent() {
  const params = useSearchParams();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedId, setSelectedId] = useState(params.get("supplier_id") || "");
  const [data, setData] = useState<LedgerData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { getSuppliers().then((r) => setSuppliers(r.data)); }, []);

  useEffect(() => {
    if (!selectedId) { setData(null); return; }
    setLoading(true);
    getSupplierLedger(parseInt(selectedId))
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, [selectedId]);

  const totalBills = data?.entries.reduce((s, e) => s + e.debit, 0) ?? 0;
  const totalPaid = data?.entries.reduce((s, e) => s + e.credit, 0) ?? 0;

  return (
    <div>
      <Header title="Supplier Ledger" />
      <div className="p-6 space-y-5">
        <div className="card max-w-sm">
          <label className="label">Select Supplier</label>
          <select className="input" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">— Select Supplier —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {selectedId && data && (
          <>
            <div className="grid grid-cols-3 gap-4">
              <div className="card">
                <p className="text-text-muted text-xs uppercase tracking-wide">Total Bills</p>
                <p className="text-xl font-bold text-red-400 mt-1">AED {totalBills.toFixed(2)}</p>
              </div>
              <div className="card">
                <p className="text-text-muted text-xs uppercase tracking-wide">Total Paid</p>
                <p className="text-xl font-bold text-green-400 mt-1">AED {totalPaid.toFixed(2)}</p>
              </div>
              <div className="card">
                <p className="text-text-muted text-xs uppercase tracking-wide">Balance Due</p>
                <p className="text-xl font-bold text-amber-400 mt-1">AED {data.closing_balance.toFixed(2)}</p>
              </div>
            </div>

            <div className="card p-0 overflow-hidden">
              <table className="w-full">
                <thead className="table-head">
                  <tr>
                    <th>Date</th>
                    <th>Reference</th>
                    <th>Description</th>
                    <th className="text-right">Debit (Bill)</th>
                    <th className="text-right">Credit (Payment)</th>
                    <th className="text-right">Balance (AED)</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Opening balance row */}
                  <tr className="table-row bg-bg-border/30">
                    <td className="text-text-muted text-xs">—</td>
                    <td className="font-mono text-xs">Opening</td>
                    <td className="text-text-secondary">Opening Balance</td>
                    <td className="text-right">—</td>
                    <td className="text-right">—</td>
                    <td className="text-right font-semibold">AED {data.opening_balance.toFixed(2)}</td>
                  </tr>

                  {loading ? (
                    <tr><td colSpan={6} className="text-center py-8 text-text-muted">Loading...</td></tr>
                  ) : data.entries.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-12 text-text-muted">
                      <BookOpen size={32} className="mx-auto mb-2 opacity-30" />
                      <p>No transactions yet.</p>
                    </td></tr>
                  ) : data.entries.map((e, idx) => (
                    <tr key={idx} className="table-row">
                      <td className="text-text-secondary text-sm">
                        {new Date(e.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="font-mono text-sm">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                          e.type === "bill" ? "bg-red-900/40 text-red-300" : "bg-green-900/40 text-green-300"
                        }`}>
                          {e.reference}
                        </span>
                      </td>
                      <td className="text-text-secondary text-sm">{e.description}</td>
                      <td className="text-right">
                        {e.debit > 0 ? <span className="text-red-400">AED {e.debit.toFixed(2)}</span> : "—"}
                      </td>
                      <td className="text-right">
                        {e.credit > 0 ? <span className="text-green-400">AED {e.credit.toFixed(2)}</span> : "—"}
                      </td>
                      <td className="text-right font-semibold">
                        <span className={e.balance > 0 ? "text-amber-400" : "text-green-400"}>
                          AED {e.balance.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {data.entries.length > 0 && (
                    <tr className="table-row bg-bg-border/30 border-t-2 border-bg-border">
                      <td colSpan={5} className="font-bold text-right pr-4">Closing Balance</td>
                      <td className="text-right font-bold text-amber-400 text-base">
                        AED {data.closing_balance.toFixed(2)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {selectedId && loading && !data && (
          <div className="card text-center py-16 text-text-muted">Loading...</div>
        )}

        {!selectedId && (
          <div className="card text-center py-16 text-text-muted">
            <BookOpen size={40} className="mx-auto mb-3 opacity-20" />
            <p>Select a supplier to view their ledger</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SupplierLedgerPage() {
  return <Suspense><SupplierLedgerContent /></Suspense>;
}
