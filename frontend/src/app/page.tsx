"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { getDashboard, getBankAccountsSummary } from "@/lib/api";
import {
  TrendingUp, DollarSign, AlertCircle, Users,
  FileText, ArrowUpRight, Landmark, WifiOff
} from "lucide-react";

interface DashboardData {
  total_invoiced: number;
  total_collected: number;
  outstanding: number;
  invoice_count: number;
  customer_count: number;
  overdue_count: number;
  recent_invoices: Array<{
    id: number;
    invoice_number: string;
    customer_name: string;
    total: number;
    balance_due: number;
    status: string;
    date: string;
  }>;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  paid: { label: "Paid", color: "text-status-paid bg-status-paid/10 border-status-paid/20" },
  unpaid: { label: "Unpaid", color: "text-status-unpaid bg-status-unpaid/10 border-status-unpaid/20" },
  partial: { label: "Partial", color: "text-status-partial bg-status-partial/10 border-status-partial/20" },
  overdue: { label: "Overdue", color: "text-red-400 bg-red-500/10 border-red-500/20" },
};

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [bankTotal, setBankTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [backendOffline, setBackendOffline] = useState(false);
  const router = useRouter();

  useEffect(() => {
    getDashboard()
      .then((res) => { setData(res.data); setBackendOffline(false); })
      .catch(() => setBackendOffline(true))
      .finally(() => setLoading(false));
    getBankAccountsSummary()
      .then((res) => setBankTotal(res.data.total_balance))
      .catch(() => {});
  }, []);

  const fmt = (n: number) => `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 2 })}`;

  const cards = data ? [
    {
      title: "Total Invoiced",
      value: fmt(data.total_invoiced),
      icon: TrendingUp,
      color: "from-brand-indigo/20 to-brand-purple/10",
      iconColor: "text-brand-indigo",
      change: `${data.invoice_count} invoices`,
      href: "/invoices",
    },
    {
      title: "Outstanding",
      value: fmt(data.outstanding),
      icon: AlertCircle,
      color: "from-amber-500/20 to-amber-600/10",
      iconColor: "text-amber-400",
      change: `${data.overdue_count} overdue`,
      href: "/reports?tab=outstanding",
    },
    {
      title: "Bank Balance",
      value: bankTotal !== null ? fmt(bankTotal) : "—",
      icon: Landmark,
      color: "from-emerald-500/20 to-emerald-600/10",
      iconColor: "text-emerald-400",
      change: "All accounts",
      href: "/bank",
    },
    {
      title: "Customers",
      value: data.customer_count.toString(),
      icon: Users,
      color: "from-sky-500/20 to-sky-600/10",
      iconColor: "text-sky-400",
      change: "Active accounts",
      href: "/customers",
    },
  ] : [];

  const recentInvoices = data?.recent_invoices ?? [];

  return (
    <div>
      <Header title="Dashboard" />
      <div className="p-6 space-y-6">

        {/* Backend offline banner */}
        {!loading && backendOffline && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400">
            <WifiOff size={18} className="shrink-0" />
            <div>
              <p className="font-semibold text-sm">Backend not connected</p>
              <p className="text-xs text-red-400/70">
                Make sure the backend is running on{" "}
                <span className="font-mono">http://127.0.0.1:8001</span>.
                Launch the app using <span className="font-mono">start.bat</span> or the Desktop shortcut.
              </p>
            </div>
          </div>
        )}

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="card animate-pulse h-28 bg-bg-card" />
              ))
            : backendOffline
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="card h-28 flex items-center justify-center">
                  <p className="text-text-muted text-xs">—</p>
                </div>
              ))
            : cards.map((card) => {
                const Icon = card.icon;
                return (
                  <div
                    key={card.title}
                    onClick={() => card.href && router.push(card.href)}
                    className={`card bg-gradient-to-br ${card.color} border-bg-border cursor-pointer hover:border-brand-indigo/30 transition-all`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-text-secondary text-xs font-medium uppercase tracking-wide">{card.title}</p>
                        <p className="text-2xl font-bold text-text-primary mt-1">{card.value}</p>
                        <p className="text-text-muted text-xs mt-1">{card.change}</p>
                      </div>
                      <div className={`w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center ${card.iconColor}`}>
                        <Icon size={20} />
                      </div>
                    </div>
                  </div>
                );
              })}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "New Invoice", icon: FileText, href: "/invoices/new" },
            { label: "Add Payment", icon: DollarSign, href: "/payments" },
            { label: "Money In", icon: Landmark, href: "/bank/transactions?type=received&new=1" },
            { label: "Add Expense", icon: ArrowUpRight, href: "/bank/expenses" },
          ].map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                onClick={() => router.push(action.href)}
                className="card flex items-center gap-3 hover:border-brand-indigo/40 transition-all group"
              >
                <div className="w-8 h-8 rounded-lg bg-brand-indigo/10 flex items-center justify-center text-brand-indigo group-hover:bg-brand-indigo/20">
                  <Icon size={15} />
                </div>
                <span className="text-sm font-medium text-text-primary">{action.label}</span>
                <ArrowUpRight size={13} className="ml-auto text-text-muted group-hover:text-brand-indigo" />
              </button>
            );
          })}
        </div>

        {/* Recent Invoices */}
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-bg-border">
            <h3 className="font-semibold text-text-primary">Recent Invoices</h3>
            <button
              onClick={() => router.push("/invoices")}
              className="text-xs text-brand-indigo hover:text-brand-glow flex items-center gap-1"
            >
              View all <ArrowUpRight size={12} />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="table-head">
                <tr>
                  <th>Invoice #</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Balance Due</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-text-muted">Loading...</td>
                  </tr>
                ) : backendOffline ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-text-muted">
                      <WifiOff size={32} className="mx-auto mb-2 opacity-30" />
                      <p>Connect the backend to see recent invoices.</p>
                    </td>
                  </tr>
                ) : recentInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-text-muted">
                      <FileText size={32} className="mx-auto mb-2 opacity-30" />
                      <p>No invoices yet. Create your first invoice!</p>
                    </td>
                  </tr>
                ) : (
                  recentInvoices.map((inv) => {
                    const sc = statusConfig[inv.status] || statusConfig.unpaid;
                    return (
                      <tr key={inv.id} className="table-row">
                        <td className="font-mono text-brand-indigo">{inv.invoice_number}</td>
                        <td>{inv.customer_name}</td>
                        <td className="text-text-secondary">{inv.date}</td>
                        <td className="font-medium">AED {inv.total.toFixed(2)}</td>
                        <td className="font-medium text-status-unpaid">AED {inv.balance_due.toFixed(2)}</td>
                        <td>
                          <span className={`status-badge border ${sc.color}`}>{sc.label}</span>
                        </td>
                        <td>
                          <button
                            onClick={() => router.push(`/invoices?id=${inv.id}`)}
                            className="text-text-muted hover:text-brand-indigo transition-colors"
                          >
                            <ArrowUpRight size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
