"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { getSupplierPayments, deleteSupplierPayment, downloadSupplierPaymentPDF } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Trash2, HandCoins, Search, Download } from "lucide-react";

interface SupplierPayment {
  id: number;
  payment_number: string;
  supplier: { name: string } | null;
  date: string;
  amount: number;
  method: string;
  reference: string;
}

export default function SupplierPaymentsPage() {
  const router = useRouter();
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [search, setSearch] = useState("");

  const load = () =>
    getSupplierPayments().then((r) => setPayments(r.data)).catch(() => toast.error("Failed to load payments"));

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this supplier payment? This will affect the supplier balance.")) return;
    try {
      await deleteSupplierPayment(id);
      toast.success("Payment deleted.");
      load();
    } catch {
      toast.error("Failed to delete.");
    }
  };

  const filtered = payments.filter(
    (p) =>
      p.payment_number.toLowerCase().includes(search.toLowerCase()) ||
      (p.supplier?.name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <Header title="Supplier Payments" />
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="relative w-72">
            <Search size={15} className="absolute left-3 top-2.5 text-text-muted" />
            <input
              className="input pl-9"
              placeholder="Search payments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="btn-primary" onClick={() => router.push("/supplier-payments/new")}>
            <Plus size={15} /> New Payment
          </button>
        </div>

        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="table-head">
              <tr>
                <th>Payment No</th>
                <th>Supplier</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Reference</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-text-muted">
                    <HandCoins size={32} className="mx-auto mb-2 opacity-30" />
                    <p>No supplier payments found.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="table-row">
                    <td className="font-mono text-sm font-semibold">{p.payment_number}</td>
                    <td>{p.supplier?.name || "—"}</td>
                    <td className="text-text-secondary">
                      {new Date(p.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="font-semibold text-green-400">AED {p.amount.toFixed(2)}</td>
                    <td className="text-text-secondary capitalize">{(p.method || "—").replace("_", " ")}</td>
                    <td className="text-text-secondary">{p.reference || "—"}</td>
                    <td>
                      <div className="flex gap-2">
                        <a
                          href={downloadSupplierPaymentPDF(p.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-text-muted hover:text-green-400"
                          title="Download PDF"
                        >
                          <Download size={14} />
                        </a>
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="text-text-muted hover:text-red-400"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
