"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, ChevronDown, Bot } from "lucide-react";
import { processAICommand } from "@/lib/api";
import SyncStatus from "@/components/SyncStatus";
import toast from "react-hot-toast";

export default function Header({ title }: { title: string }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await processAICommand(query);
      const data = res.data;
      toast.success(data.message);
      if (data.page) {
        setTimeout(() => router.push(data.page), 500);
      }
    } catch {
      toast.error("Command failed. Check if backend is running.");
    } finally {
      setLoading(false);
      setQuery("");
    }
  };

  return (
    <header className="h-16 bg-bg-secondary border-b border-bg-border flex items-center px-6 gap-4 sticky top-0 z-30">
      <h2 className="text-lg font-semibold text-text-primary flex-shrink-0">{title}</h2>

      <form onSubmit={handleSearch} className="flex-1 max-w-xl ml-4">
        <div className="relative flex items-center">
          <Bot size={16} className="absolute left-3 text-brand-indigo" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='AI: "Create invoice for Gulf Extrusion 1000 AED" ...'
            className="input pl-9 pr-4 bg-bg-primary/80 text-sm h-9"
            disabled={loading}
          />
          {loading && (
            <div className="absolute right-3 w-4 h-4 border-2 border-brand-indigo border-t-transparent rounded-full animate-spin" />
          )}
        </div>
      </form>

      <div className="flex items-center gap-3 ml-auto">
        <SyncStatus />
        <button className="w-8 h-8 rounded-lg bg-bg-card border border-bg-border flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors">
          <Bell size={15} />
        </button>
        <div className="flex items-center gap-2 cursor-pointer">
          <div className="w-8 h-8 rounded-full bg-gradient-brand flex items-center justify-center text-white text-xs font-bold">
            FP
          </div>
          <span className="text-sm text-text-secondary hidden md:block">Admin</span>
          <ChevronDown size={14} className="text-text-muted" />
        </div>
      </div>
    </header>
  );
}
