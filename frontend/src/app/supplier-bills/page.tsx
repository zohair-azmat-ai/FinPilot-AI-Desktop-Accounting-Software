"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { getSupplierBills, deleteSupplierBill, downloadSupplierBillPDF } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Trash2, FileInput, Search, Download, Eye } from "lucide-react";

interface SupplierBill {
  id: number;
  bill_number: string;
  supplier: { name: string } | null;
  date: string;
  due_date: string | null;
  total: number;
  amount_paid: number;
  balance_due: number;
  status: string;
}

const STATUS_COLORS: Record<string, string> = {
  unpaid: "text-red-400",
  partial: "text-amber-400",
  paid: "text-green-400",
};

export default function SupplierBillsPage() {
  const router = useRouter();
  const [bills, setBills] = useState<SupplierBill[]>([]);
  const [search, setSearch] = useState("");

  const load = () =>
    getSupplierBills().then((r) => setBills(r.data)).catch(() => toast.error("Failed to load bills"));

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this supplier bill? This will affect the supplier balance.")) return;
    try {
      await deleteSupplierBill(id);
      toast.success("Bill deleted.");
      load();
    } catch {
      toast.error("Failed to delete.");
    }
  };

  const filtered = bills.filter(
    (b) =>
      b.bill_number.toLowerCase().includes(search.toLowerCase()) ||
      (b.supplier?.name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <Header title="Supplier Bills" />
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="relative w-72">
            <Search size={15} className="absolute left-3 top-2.5 text-text-muted" />
            <input
              className="input pl-9"
              placeholder="Search bills..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="btn-primary" onClick={() => router.push("/supplier-bills/new")}>
            <Plus size={15} /> New Supplier Bill
          </button>
        </div>

        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="table-head">
              <tr>
                <th>Bill No</th>
                <th>Supplier</th>
                <th>Date</th>
                <th>Due Date</th>
                <th>Total</th>
                <th>Balance Due</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-text-muted">
                    <FileInput size={32} className="mx-auto mb-2 opacity-30" />
                    <p>No supplier bills found.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((b) => (
                  <tr key={b.id} className="table-row">
                    <td className="font-mono text-sm font-semibold">{b.bill_number}</td>
                    <td>{b.supplier?.name || "—"}</td>
                    <td className="text-text-secondary">
                      {new Date(b.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="text-text-secondary">
                      {b.due_date
                        ? new Date(b.due_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                        : "—"}
                    </td>
                    <td>AED {b.total.toFixed(2)}</td>
                    <td className="font-semibold">AED {b.balance_due.toFixed(2)}</td>
                    <td>
                      <span className={`text-xs font-semibold uppercase ${STATUS_COLORS[b.status] || "text-text-muted"}`}>
                        {b.status}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button
                          onClick={() => router.push(`/supplier-bills/new?edit=${b.id}`)}
                          className="text-text-muted hover:text-brand-indigo"
                          title="Edit"
                        >
                          <Eye size={14} />
                        </button>
                        <a
                          href={downloadSupplierBillPDF(b.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-text-muted hover:text-green-400"
                          title="Download PDF"
                        >
                          <Download size={14} />
                        </a>
                        <button
                          onClick={() => handleDelete(b.id)}
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
