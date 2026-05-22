"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import {
  getSalesReport, getOutstandingReport, getVATReport,
  getCustomerBalanceReport, getPLReport,
  downloadVATPDF, downloadPLPDF,
} from "@/lib/api";
import { BarChart3, TrendingUp, AlertCircle, Users, Receipt, FileText } from "lucide-react";

const TABS = [
  { id: "pl",          label: "Profit & Loss", icon: BarChart3 },
  { id: "sales",       label: "Sales Report",  icon: TrendingUp },
  { id: "outstanding", label: "Outstanding",   icon: AlertCircle },
  { id: "vat",         label: "VAT Report",    icon: Receipt },
  { id: "balance",     label: "Customer Balance", icon: Users },
];

const safe    = (v: unknown): number => Number(v ?? 0);
const safeArr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];

function openPdf(url: string) {
  window.open(url, "_blank");
}

function ReportsContent() {
  const params = useSearchParams();
  const [tab, setTab]         = useState(params.get("tab") || "pl");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");
  const [data, setData]         = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading]   = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const loadReport = () => {
    setLoading(true);
    setData(null);
    setReportError(null);
    const p: Record<string, unknown> = {};
    if (dateFrom) p.date_from = new Date(dateFrom).toISOString();
    if (dateTo)   p.date_to   = new Date(dateTo).toISOString();

    const fetcher =
      tab === "pl"          ? getPLReport(p) :
      tab === "sales"       ? getSalesReport(p) :
      tab === "outstanding" ? getOutstandingReport() :
      tab === "vat"         ? getVATReport(p) :
      getCustomerBalanceReport();

    fetcher
      .then((r) => { if (r.data && typeof r.data === "object") setData(r.data); else setData({}); })
      .catch(() => setReportError("Unable to load report. Please try again."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadReport(); }, [tab]);

  const pdfParams = () => {
    const p: Record<string, string> = {};
    if (dateFrom) p.date_from = new Date(dateFrom).toISOString();
    if (dateTo)   p.date_to   = new Date(dateTo).toISOString();
    return p;
  };

  return (
    <div>
      <Header title="Reports" />
      <div className="p-6 space-y-5">

        {/* Tab bar */}
        <div className="flex gap-2 border-b border-bg-border pb-0 flex-wrap">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  tab === t.id
                    ? "border-brand-indigo text-brand-indigo"
                    : "border-transparent text-text-secondary hover:text-text-primary"
                }`}
              >
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* Date filters */}
        {(tab === "pl" || tab === "sales" || tab === "vat") && (
          <div className="flex items-end gap-4 flex-wrap">
            <div>
              <label className="label">From Date</label>
              <input className="input w-40" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="label">To Date</label>
              <input className="input w-40" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <button className="btn-primary" onClick={loadReport}>Refresh</button>
            {tab === "vat" && (
              <button
                className="btn-secondary flex items-center gap-2"
                onClick={() => openPdf(downloadVATPDF(pdfParams()))}
              >
                <FileText size={15} /> Generate VAT PDF
              </button>
            )}
            {tab === "pl" && (
              <button
                className="btn-secondary flex items-center gap-2"
                onClick={() => openPdf(downloadPLPDF(pdfParams()))}
              >
                <FileText size={15} /> Download P&amp;L PDF
              </button>
            )}
          </div>
        )}

        {loading && <div className="card text-center py-12 text-text-muted">Loading report...</div>}
        {reportError && (
          <div className="card border border-red-500/20 bg-red-500/5 text-center py-8">
            <p className="text-red-400 font-medium">{reportError}</p>
            <button className="btn-secondary mt-3 text-sm" onClick={loadReport}>Retry</button>
          </div>
        )}

        {/* ── Profit & Loss ──────────────────────────────────────────────── */}
        {tab === "pl" && data && !reportError && (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total Sales",    value: safe(data.total_sales),         color: "text-brand-indigo" },
                { label: "Total Expenses", value: safe(data.total_expenses),      color: "text-red-400" },
                { label: "Net Profit",     value: safe(data.net_profit),
                  color: safe(data.net_profit) >= 0 ? "text-emerald-400" : "text-red-400" },
                { label: "VAT Collected",  value: safe(data.total_vat_collected), color: "text-amber-400" },
              ].map((s) => (
                <div key={s.label} className="card">
                  <p className="text-text-muted text-xs uppercase tracking-wide">{s.label}</p>
                  <p className={`text-xl font-bold mt-1 ${s.color}`}>AED {safe(s.value).toFixed(2)}</p>
                </div>
              ))}
            </div>

            {/* P&L Statement */}
            <div className="card p-0 overflow-hidden">
              <div className="px-4 py-3 bg-brand-indigo/10 border-b border-bg-border">
                <h3 className="font-semibold text-text-primary text-sm">Profit & Loss Statement</h3>
              </div>
              <table className="w-full">
                <tbody>
                  {[
                    { label: "INCOME", isHeader: true },
                    { label: "Total Sales (excl. VAT)", value: safe(data.total_sales), indent: true },
                    { label: "EXPENSES", isHeader: true },
                    { label: "Daily / Operating Expenses", value: safe(data.total_daily_expenses), indent: true },
                    { label: "Supplier Bills / Purchases",  value: safe(data.total_supplier_bills), indent: true },
                    { label: "Total Expenses", value: safe(data.total_expenses), indent: true, bold: true },
                    { label: "NET PROFIT / (LOSS)", value: safe(data.net_profit),
                      isHeader: true, profit: true },
                    { label: "VAT Collected (5%)", value: safe(data.total_vat_collected), indent: true, amber: true },
                  ].map((row, i) => (
                    <tr key={i} className={row.isHeader && !row.profit ? "bg-brand-indigo/10" : row.profit ? "bg-brand-indigo text-white" : i % 2 === 0 ? "bg-transparent" : "bg-bg-card/30"}>
                      <td className={`px-4 py-2.5 text-sm ${row.indent ? "pl-8" : "font-semibold"} ${row.profit ? "text-white font-bold" : ""}`}>
                        {row.label}
                      </td>
                      {row.value !== undefined ? (
                        <td className={`px-4 py-2.5 text-sm text-right font-${row.bold ? "bold" : "medium"} ${
                          row.profit
                            ? row.value >= 0 ? "text-emerald-300" : "text-red-300"
                            : row.amber ? "text-amber-400"
                            : row.value < 0 ? "text-red-400" : "text-text-primary"
                        }`}>
                          AED {row.value.toFixed(2)}
                        </td>
                      ) : (
                        <td />
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Monthly Breakdown */}
            {safeArr(data.monthly_breakdown).length > 0 && (
              <div className="card p-0 overflow-hidden">
                <div className="px-4 py-3 bg-brand-indigo/10 border-b border-bg-border">
                  <h3 className="font-semibold text-text-primary text-sm">Monthly Breakdown</h3>
                </div>
                <table className="w-full">
                  <thead className="table-head">
                    <tr>
                      <th>Month</th>
                      <th className="text-right">Sales (AED)</th>
                      <th className="text-right">Expenses (AED)</th>
                      <th className="text-right">Net Profit (AED)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {safeArr(data.monthly_breakdown).map((row) => {
                      const r = row as Record<string, unknown>;
                      const net = safe(r.net);
                      return (
                        <tr key={String(r.month)} className="table-row">
                          <td className="font-medium">{String(r.month)}</td>
                          <td className="text-right text-brand-indigo">{safe(r.sales).toFixed(2)}</td>
                          <td className="text-right text-red-400">{safe(r.expenses).toFixed(2)}</td>
                          <td className={`text-right font-bold ${net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {net.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Expense Categories */}
            {safeArr(data.expense_categories).length > 0 && (
              <div className="card p-0 overflow-hidden">
                <div className="px-4 py-3 bg-brand-indigo/10 border-b border-bg-border">
                  <h3 className="font-semibold text-text-primary text-sm">Expense by Category</h3>
                </div>
                <table className="w-full">
                  <thead className="table-head">
                    <tr><th>Category</th><th className="text-right">Amount (AED)</th></tr>
                  </thead>
                  <tbody>
                    {safeArr(data.expense_categories).map((cat) => {
                      const c = cat as Record<string, unknown>;
                      return (
                        <tr key={String(c.category)} className="table-row">
                          <td className="capitalize">{String(c.category).replace(/_/g, " ")}</td>
                          <td className="text-right text-red-400">{safe(c.total).toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Sales Report ─────────────────────────────────────────────────── */}
        {tab === "sales" && data && !reportError && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Net Sales",       value: `AED ${safe(data.total_net).toFixed(2)}`,      color: "text-brand-indigo" },
                { label: "Taxable Amount",  value: `AED ${safe(data.total_sales).toFixed(2)}`,    color: "text-text-primary" },
                { label: "VAT Collected",   value: `AED ${safe(data.total_vat).toFixed(2)}`,      color: "text-amber-400" },
                { label: "Discount Given",  value: `AED ${safe(data.total_discount).toFixed(2)}`, color: "text-text-secondary" },
              ].map((s) => (
                <div key={s.label} className="card">
                  <p className="text-text-muted text-xs uppercase tracking-wide">{s.label}</p>
                  <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>
            <div className="card p-0 overflow-hidden">
              <table className="w-full">
                <thead className="table-head">
                  <tr><th>Invoice #</th><th>Date</th><th>Customer</th><th className="text-right">Subtotal</th><th className="text-right">VAT</th><th className="text-right">Total</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {safeArr(data.invoices).length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-10 text-text-muted">No sales data.</td></tr>
                  ) : safeArr(data.invoices).map((inv) => {
                    const i = inv as Record<string, unknown>;
                    return (
                      <tr key={String(i.invoice_number)} className="table-row">
                        <td className="font-mono text-brand-indigo">{String(i.invoice_number ?? "")}</td>
                        <td className="text-text-secondary">{String(i.date ?? "")}</td>
                        <td>{String(i.customer_name || "CASH SALE")}</td>
                        <td className="text-right">{safe(i.subtotal).toFixed(2)}</td>
                        <td className="text-right text-amber-400">{safe(i.vat_amount).toFixed(2)}</td>
                        <td className="text-right font-medium">{safe(i.total).toFixed(2)}</td>
                        <td><span className={`status-badge border ${i.status === "paid" ? "text-status-paid bg-status-paid/10 border-status-paid/20" : "text-status-unpaid bg-status-unpaid/10 border-status-unpaid/20"}`}>{String(i.status ?? "")}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── Outstanding ──────────────────────────────────────────────────── */}
        {tab === "outstanding" && data && !reportError && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="card">
                <p className="text-text-muted text-xs uppercase tracking-wide">Total Outstanding</p>
                <p className="text-2xl font-bold text-status-unpaid mt-1">AED {safe(data.total_outstanding).toFixed(2)}</p>
              </div>
              <div className="card">
                <p className="text-text-muted text-xs uppercase tracking-wide">Pending Invoices</p>
                <p className="text-2xl font-bold text-amber-400 mt-1">{safe(data.invoice_count)}</p>
              </div>
            </div>
            <div className="card p-0 overflow-hidden">
              <table className="w-full">
                <thead className="table-head">
                  <tr><th>Invoice #</th><th>Customer</th><th>Date</th><th>Due Date</th><th className="text-right">Total</th><th className="text-right">Paid</th><th className="text-right">Balance</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {safeArr(data.invoices).length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-10 text-text-muted">No outstanding invoices.</td></tr>
                  ) : safeArr(data.invoices).map((inv) => {
                    const i = inv as Record<string, unknown>;
                    return (
                      <tr key={String(i.invoice_number)} className="table-row">
                        <td className="font-mono text-brand-indigo">{String(i.invoice_number ?? "")}</td>
                        <td className="font-medium">{String(i.customer_name || "CASH SALE")}</td>
                        <td className="text-text-secondary">{String(i.date ?? "")}</td>
                        <td className="text-text-secondary">{String(i.due_date || "—")}</td>
                        <td className="text-right">{safe(i.total).toFixed(2)}</td>
                        <td className="text-right text-emerald-400">{safe(i.amount_paid).toFixed(2)}</td>
                        <td className="text-right font-bold text-status-unpaid">{safe(i.balance_due).toFixed(2)}</td>
                        <td><span className="status-badge border text-status-partial bg-status-partial/10 border-status-partial/20">{String(i.status ?? "")}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── VAT Report ───────────────────────────────────────────────────── */}
        {tab === "vat" && data && !reportError && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="card">
                <p className="text-text-muted text-xs uppercase tracking-wide">Total Taxable Sales</p>
                <p className="text-2xl font-bold text-text-primary mt-1">AED {safe(data.total_taxable).toFixed(2)}</p>
              </div>
              <div className="card">
                <p className="text-text-muted text-xs uppercase tracking-wide">VAT Payable (5%)</p>
                <p className="text-2xl font-bold text-amber-400 mt-1">AED {safe(data.total_vat).toFixed(2)}</p>
              </div>
            </div>
            <div className="card p-0 overflow-hidden">
              <table className="w-full">
                <thead className="table-head">
                  <tr><th>Invoice #</th><th>Date</th><th>Customer</th><th>Customer TRN</th><th className="text-right">Taxable</th><th className="text-right">VAT (5%)</th><th className="text-right">Total</th></tr>
                </thead>
                <tbody>
                  {safeArr(data.invoices).length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-10 text-text-muted">No VAT report data.</td></tr>
                  ) : safeArr(data.invoices).map((inv) => {
                    const i = inv as Record<string, unknown>;
                    return (
                      <tr key={String(i.invoice_number)} className="table-row">
                        <td className="font-mono text-brand-indigo">{String(i.invoice_number ?? "")}</td>
                        <td className="text-text-secondary">{String(i.date ?? "")}</td>
                        <td>{String(i.customer_name || "CASH SALE")}</td>
                        <td className="font-mono text-xs text-text-secondary">{String(i.customer_trn || "—")}</td>
                        <td className="text-right">{safe(i.subtotal).toFixed(2)}</td>
                        <td className="text-right text-amber-400 font-medium">{safe(i.vat_amount).toFixed(2)}</td>
                        <td className="text-right font-medium">{safe(i.total).toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── Customer Balance ─────────────────────────────────────────────── */}
        {tab === "balance" && data && !reportError && (
          <>
            <div className="card">
              <p className="text-text-muted text-xs uppercase tracking-wide">Total AR Balance</p>
              <p className="text-2xl font-bold text-amber-400 mt-1">AED {safe(data.total_balance).toFixed(2)}</p>
            </div>
            <div className="card p-0 overflow-hidden">
              <table className="w-full">
                <thead className="table-head">
                  <tr><th>Customer</th><th>Phone</th><th className="text-right">Total Invoiced</th><th className="text-right">Total Paid</th><th className="text-right">Balance</th></tr>
                </thead>
                <tbody>
                  {safeArr(data.customers).length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-10 text-text-muted">No customer balances.</td></tr>
                  ) : safeArr(data.customers).map((c) => {
                    const cust = c as Record<string, unknown>;
                    const bal = safe(cust.balance);
                    return (
                      <tr key={String(cust.id)} className="table-row">
                        <td className="font-medium">{String(cust.name || "Unknown")}</td>
                        <td className="text-text-secondary">{String(cust.phone || "—")}</td>
                        <td className="text-right">{safe(cust.total_invoiced).toFixed(2)}</td>
                        <td className="text-right text-emerald-400">{safe(cust.total_paid).toFixed(2)}</td>
                        <td className={`text-right font-bold ${bal > 0 ? "text-amber-400" : "text-emerald-400"}`}>{bal.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  return <Suspense><ReportsContent /></Suspense>;
}
