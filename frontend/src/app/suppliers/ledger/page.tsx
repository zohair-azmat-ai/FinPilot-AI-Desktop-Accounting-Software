"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import { getSupplierLedger } from "@/lib/api";
import toast from "react-hot-toast";
import { ArrowLeft, BookOpen } from "lucide-react";

interface LedgerEntry {
  date: string;
  type: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

interface LedgerData {
  supplier: { id: number; name: string; trn: string; address: string; phone: string; email: string };
  opening_balance: number;
  closing_balance: number;
  entries: LedgerEntry[];
}

export default function SupplierLedgerPage() {
  const params = useSearchParams();
  const router = useRouter();
  const supplierId = params.get("id") ? Number(params.get("id")) : null;
  const [data, setData] = useState<LedgerData | null>(null);

  useEffect(() => {
    if (!supplierId) return;
    getSupplierLedger(supplierId)
      .then((r) => setData(r.data))
      .catch(() => toast.error("Failed to load supplier ledger"));
  }, [supplierId]);

  if (!supplierId) {
    return (
      <div>
        <Header title="Supplier Ledger" />
        <div className="p-6 text-text-muted">No supplier selected.</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <Header title="Supplier Ledger" />
        <div className="p-6 text-text-muted">Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <Header title={`Ledger — ${data.supplier.name}`} />
      <div className="p-6">
        <button onClick={() => router.push("/suppliers")} className="btn-secondary mb-5">
          <ArrowLeft size={14} /> Back to Suppliers
        </button>

        {/* Supplier info */}
        <div className="card p-5 mb-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold">{data.supplier.name}</h2>
              {data.supplier.trn && <p className="text-text-secondary text-sm">TRN: {data.supplier.trn}</p>}
              {data.supplier.phone && <p className="text-text-secondary text-sm">{data.supplier.phone}</p>}
              {data.supplier.address && <p className="text-text-secondary text-sm">{data.supplier.address}</p>}
            </div>
            <div className="text-right">
              <p className="text-text-muted text-sm">Opening Balance</p>
              <p className="text-lg font-semibold">AED {data.opening_balance.toFixed(2)}</p>
              <p className="text-text-muted text-sm mt-2">Current Balance</p>
              <p className="text-2xl font-bold text-amber-400">AED {data.closing_balance.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Ledger table */}
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="table-head">
              <tr>
                <th>Date</th>
                <th>Reference</th>
                <th>Description</th>
                <th className="text-right">Debit (Bill)</th>
                <th className="text-right">Credit (Payment)</th>
                <th className="text-right">Balance</th>
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

              {data.entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-text-muted">
                    <BookOpen size={28} className="mx-auto mb-2 opacity-30" />
                    <p>No transactions yet.</p>
                  </td>
                </tr>
              ) : (
                data.entries.map((e, idx) => (
                  <tr key={idx} className="table-row">
                    <td className="text-text-secondary text-sm">
                      {new Date(e.date).toLocaleDateString("en-GB", {
                        day: "2-digit", month: "short", year: "numeric",
                      })}
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
                ))
              )}

              {/* Closing row */}
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
      </div>
    </div>
  );
}
