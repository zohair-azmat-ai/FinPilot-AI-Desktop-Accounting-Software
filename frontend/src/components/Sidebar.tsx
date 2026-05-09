"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Building2, Users, Truck, Package,
  FileText, Receipt, CreditCard, BookOpen, BarChart3,
  FileBarChart, Bot, Settings, Database, ChevronRight,
  Landmark, ArrowDownLeft, ArrowUpRight as ArrowUpRightIcon,
  CheckSquare, Wallet, TrendingDown, ClipboardList, ShoppingCart, HardDrive, KeyRound,
  FileInput, HandCoins
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/" },
  { label: "Company", icon: Building2, href: "/company" },
  { type: "divider", label: "TRANSACTIONS" },
  { label: "Quotations", icon: FileText, href: "/quotations" },
  { label: "Invoices", icon: Receipt, href: "/invoices" },
  { label: "Payments", icon: CreditCard, href: "/payments" },
  { label: "Delivery Notes", icon: ClipboardList, href: "/delivery-notes" },
  { label: "Purchase Orders", icon: ShoppingCart, href: "/purchase-orders" },
  { type: "divider", label: "PAYABLES" },
  { label: "Supplier Bills", icon: FileInput, href: "/supplier-bills" },
  { label: "Supplier Payments", icon: HandCoins, href: "/supplier-payments" },
  { type: "divider", label: "BANK / CASH" },
  { label: "Bank Accounts", icon: Landmark, href: "/bank" },
  { label: "Transactions", icon: ArrowDownLeft, href: "/bank/transactions" },
  { label: "Cheques", icon: CheckSquare, href: "/bank/cheques" },
  { label: "Expenses", icon: TrendingDown, href: "/bank/expenses" },
  { label: "Daily Expenses", icon: TrendingDown, href: "/expenses/daily" },
  { label: "Bank Statement", icon: Wallet, href: "/bank/statement" },
  { type: "divider", label: "MASTER DATA" },
  { label: "Customers", icon: Users, href: "/customers" },
  { label: "Suppliers", icon: Truck, href: "/suppliers" },
  { label: "Items / Services", icon: Package, href: "/items" },
  { type: "divider", label: "ACCOUNTS" },
  { label: "Ledger", icon: BookOpen, href: "/ledger" },
  { label: "Statements", icon: FileBarChart, href: "/statements" },
  { label: "Reports", icon: BarChart3, href: "/reports" },
  { type: "divider", label: "TOOLS" },
  { label: "AI Command", icon: Bot, href: "/ai" },
  { label: "Backup & Restore", icon: HardDrive, href: "/backup" },
  { label: "License", icon: KeyRound, href: "/activate" },
  { label: "Settings", icon: Settings, href: "/company" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <aside className="w-60 bg-bg-secondary border-r border-bg-border flex flex-col h-screen fixed left-0 top-0 z-40">
      {/* Logo */}
      <div className="p-5 border-b border-bg-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-brand flex items-center justify-center shadow-glow-sm">
            <span className="text-white font-bold text-sm">FP</span>
          </div>
          <div>
            <h1 className="text-white font-bold text-base leading-none">FinPilot</h1>
            <span className="text-brand-indigo text-xs font-medium">AI Accounting</span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {NAV_ITEMS.map((item, idx) => {
          if (item.type === "divider") {
            return (
              <div key={idx} className="pt-4 pb-1.5 px-3">
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                  {item.label}
                </span>
              </div>
            );
          }

          const Icon = item.icon!;
          const active = isActive(item.href!);

          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href!)}
              className={`w-full text-left ${active ? "sidebar-item-active" : "sidebar-item"}`}
            >
              <Icon size={16} className={active ? "text-brand-indigo" : ""} />
              <span>{item.label}</span>
              {active && <ChevronRight size={14} className="ml-auto text-brand-indigo" />}
            </button>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-bg-border">
        <div className="card p-3 bg-gradient-card">
          <div className="flex items-center gap-2 mb-1">
            <Database size={14} className="text-brand-indigo" />
            <span className="text-xs font-medium text-text-primary">Local Database</span>
          </div>
          <span className="text-[11px] text-text-muted">SQLite • Offline Ready</span>
        </div>
      </div>
    </aside>
  );
}
