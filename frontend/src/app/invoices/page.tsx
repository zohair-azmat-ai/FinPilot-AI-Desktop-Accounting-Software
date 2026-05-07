"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import { getInvoices, deleteInvoice, downloadInvoicePDF, getCustomers } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Receipt, Edit2, Trash2, FileDown, Filter, Search, DollarSign } from "lucide-react";

interface Invoice {
  id: number; invoice_number: string; customer?: { name: string };
  date: string; total: number; balance_due: number; status: string;
  amount_paid: number; vat_amount: number; discount: number;
}

const statusConfig: Record<string, string> = {
  paid: "text-status-paid bg-status-paid/10 border-status-paid/20",
  unpaid: "text-status-unpaid bg-status-unpaid/10 border-status-unpaid/20",
  partial: "text-status-partial bg-status-partial/10 border-status-partial/20",
};

function InvoicesContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    getInvoices(statusFilter ? { status: statusFilter } : {})
      .then((r) => setInvoices(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [statusFilter]);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this invoice? This will remove ledger entries.")) return;
    try {
      await deleteInvoice(id);
      setInvoices((prev) => prev.filter((inv) => inv.id !== id));
      toast.success("Invoice deleted.");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || "Failed to delete invoice.");
    }
  };

  const filtered = invoices.filter((inv) =>
    inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
    (inv.customer?.name || "").toLowerCase().includes(search.toLowerCase())
  );

  const total_outstanding = filtered.filter(i => i.status !== "paid").reduce((s, i) => s + i.balance_due, 0);

  return (
    <div>
      <Header title="Invoices" />
      <div className="p-6 space-y-5">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total", value: filtered.length, sub: "invoices" },
            { label: "Outstanding", value: `AED ${total_outstanding.toFixed(2)}`, sub: "balance due" },
            { label: "Paid", value: filtered.filter(i => i.status === "paid").length, sub: "invoices" },
          ].map((s) => (
            <div key={s.label} className="card">
              <p className="text-text-muted text-xs uppercase tracking-wide">{s.label}</p>
              <p className="text-xl font-bold text-text-primary mt-1">{s.value}</p>
              <p className="text-text-muted text-xs">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search size={15} className="absolute left-3 top-2.5 text-text-muted" />
            <input className="input pl-9" placeholder="Search invoices..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input w-40" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
          </select>
          <div className="ml-auto">
            <button className="btn-primary" onClick={() => router.push("/invoices/new")}>
              <Plus size={15} /> New Invoice
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="table-head">
              <tr>
                <th>Invoice #</th><th>Customer</th><th>Date</th>
                <th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-8 text-text-muted">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-text-muted">
                  <Receipt size={32} className="mx-auto mb-2 opacity-30" />
                  <p>No invoices found.</p>
                  <button onClick={() => router.push("/invoices/new")} className="mt-3 btn-primary mx-auto">
                    <Plus size={14} /> Create First Invoice
                  </button>
                </td></tr>
              ) : filtered.map((inv) => {
                const sc = statusConfig[inv.status] || statusConfig.unpaid;
                return (
                  <tr key={inv.id} className="table-row">
                    <td className="font-mono text-brand-indigo font-medium">{inv.invoice_number}</td>
                    <td className="font-medium">{inv.customer?.name || "—"}</td>
                    <td className="text-text-secondary">{new Date(inv.date).toLocaleDateString("en-AE")}</td>
                    <td className="font-medium">AED {inv.total.toFixed(2)}</td>
                    <td className="text-emerald-400">AED {inv.amount_paid.toFixed(2)}</td>
                    <td className="text-status-unpaid font-medium">AED {inv.balance_due.toFixed(2)}</td>
                    <td><span className={`status-badge border ${sc}`}>{inv.status}</span></td>
                    <td>
                      <div className="flex gap-2 items-center">
                        <button
                          onClick={() => window.open(downloadInvoicePDF(inv.id), "_blank")}
                          className="text-text-muted hover:text-brand-indigo transition-colors"
                          title="Download PDF"
                        >
                          <FileDown size={14} />
                        </button>
                        <button
                          onClick={() => router.push(`/invoices/new?id=${inv.id}`)}
                          className="text-text-muted hover:text-brand-indigo transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => router.push(`/payments?new=1&invoice_id=${inv.id}&customer_id=${inv.customer ? "" : ""}`)}
                          className="text-text-muted hover:text-emerald-400 transition-colors"
                          title="Add Payment"
                        >
                          <DollarSign size={14} />
                        </button>
                        <button onClick={() => handleDelete(inv.id)} className="text-text-muted hover:text-red-400"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function InvoicesPage() {
  return <Suspense><InvoicesContent /></Suspense>;
}
