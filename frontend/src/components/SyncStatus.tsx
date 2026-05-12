"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCloudStatus } from "@/lib/api";

interface CloudStatus {
  state: "offline" | "syncing" | "synced" | "error";
  last_sync: string | null;
  error: string | null;
  connected: boolean;
  workspace_id: string | null;
}

const DOT: Record<string, string> = {
  synced:  "bg-emerald-400",
  syncing: "bg-amber-400 animate-pulse",
  error:   "bg-red-400",
  offline: "bg-bg-border",
};

const LABEL: Record<string, string> = {
  synced:  "Synced",
  syncing: "Syncing…",
  error:   "Sync Error",
  offline: "Cloud Off",
};

const TEXT: Record<string, string> = {
  synced:  "text-emerald-400",
  syncing: "text-amber-400",
  error:   "text-red-400",
  offline: "text-text-muted",
};

export default function SyncStatus() {
  const [status, setStatus] = useState<CloudStatus | null>(null);
  const router = useRouter();

  useEffect(() => {
    const poll = async () => {
      try {
        const r = await getCloudStatus();
        setStatus(r.data);
      } catch {
        // backend not ready yet
      }
    };
    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, []);

  if (!status) return null;

  const state = status.state;
  const label = LABEL[state] ?? state;

  return (
    <button
      onClick={() => router.push("/backup")}
      title={
        status.connected
          ? status.last_sync
            ? `Last synced: ${new Date(status.last_sync).toLocaleString()}`
            : "Connected — not yet synced"
          : "Cloud backup not configured — click to set up"
      }
      className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-bg-card transition-colors"
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT[state] ?? "bg-bg-border"}`} />
      <span className={`text-xs font-medium hidden md:block ${TEXT[state] ?? "text-text-muted"}`}>
        {label}
      </span>
    </button>
  );
}
