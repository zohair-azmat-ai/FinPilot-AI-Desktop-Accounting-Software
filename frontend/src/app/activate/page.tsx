"use client";

import { useState, useEffect } from "react";
import { getLicenseStatus, getLicenseHwid, activateLicense } from "@/lib/api";
import { KeyRound, ShieldCheck, AlertTriangle, Copy, CheckCircle } from "lucide-react";

interface LicenseStatus {
  status: "licensed" | "trial" | "expired" | "invalid";
  hw_id: string;
  days_left: number | null;
  key?: string;
}

export default function ActivatePage() {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [hwid, setHwid] = useState("");
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [s, h] = await Promise.all([getLicenseStatus(), getLicenseHwid()]);
      setStatus(s.data);
      setHwid(h.data.hw_id);
    } catch {
      setMsg({ type: "err", text: "Could not connect to backend." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleActivate = async () => {
    if (!key.trim()) return;
    setSaving(true);
    setMsg(null);
    try {
      const r = await activateLicense(key.trim());
      if (r.data.success) {
        setMsg({ type: "ok", text: "License activated successfully! FinPilot AI is now fully unlocked." });
        load();
      } else {
        setMsg({ type: "err", text: r.data.error || "Activation failed." });
      }
    } catch {
      setMsg({ type: "err", text: "Activation failed. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  const copyHwid = () => {
    navigator.clipboard.writeText(hwid).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const statusColor = {
    licensed: "text-emerald-400",
    trial: "text-amber-400",
    expired: "text-red-400",
    invalid: "text-red-400",
  };

  const statusLabel = {
    licensed: "Licensed",
    trial: "Trial Mode",
    expired: "Trial Expired",
    invalid: "Invalid License",
  };

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-5">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="w-14 h-14 rounded-2xl bg-brand-indigo/10 flex items-center justify-center mx-auto mb-3">
            <KeyRound size={28} className="text-brand-indigo" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">FinPilot AI Activation</h1>
          <p className="text-text-muted text-sm">Enter your license key to unlock all features</p>
        </div>

        {/* Status card */}
        {!loading && status && (
          <div className="card space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-text-muted text-sm">Current Status</span>
              <span className={`font-semibold text-sm ${statusColor[status.status]}`}>
                {statusLabel[status.status]}
              </span>
            </div>
            {status.status === "trial" && status.days_left !== null && (
              <p className="text-xs text-amber-400/80">
                {status.days_left} day{status.days_left !== 1 ? "s" : ""} remaining in trial period.
              </p>
            )}
            {status.status === "licensed" && (
              <div className="flex items-center gap-1.5 text-emerald-400 text-xs">
                <ShieldCheck size={13} />
                Full access enabled
              </div>
            )}
            {(status.status === "expired" || status.status === "invalid") && (
              <p className="text-xs text-red-400/80">
                Please enter a valid license key to continue using FinPilot AI.
              </p>
            )}
          </div>
        )}

        {/* Hardware ID */}
        <div className="card space-y-2">
          <label className="label">Your Machine ID (share with your vendor to get a key)</label>
          <div className="flex items-center gap-2">
            <input
              className="input font-mono text-sm flex-1"
              value={hwid}
              readOnly
            />
            <button
              onClick={copyHwid}
              className="btn-secondary px-3 py-2 flex-shrink-0"
              title="Copy Machine ID"
            >
              {copied ? <CheckCircle size={15} className="text-emerald-400" /> : <Copy size={15} />}
            </button>
          </div>
        </div>

        {/* Activation form */}
        <div className="card space-y-4">
          <div>
            <label className="label">License Key</label>
            <input
              className="input font-mono tracking-widest"
              placeholder="FPAI-UAE-YYYY-XXXX-XXXX"
              value={key}
              onChange={(e) => setKey(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleActivate()}
            />
          </div>

          {msg && (
            <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
              msg.type === "ok"
                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                : "bg-red-500/10 border border-red-500/20 text-red-400"
            }`}>
              {msg.type === "ok"
                ? <ShieldCheck size={15} className="mt-0.5 flex-shrink-0" />
                : <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />}
              {msg.text}
            </div>
          )}

          <button
            className="btn-primary w-full justify-center"
            onClick={handleActivate}
            disabled={saving || !key.trim()}
          >
            {saving ? "Activating..." : "Activate License"}
          </button>
        </div>

        <p className="text-center text-xs text-text-muted">
          Contact your software vendor with your Machine ID to obtain a license key.
        </p>
      </div>
    </div>
  );
}
