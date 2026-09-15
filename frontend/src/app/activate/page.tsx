"use client";

import { useState, useEffect } from "react";
import { getLicenseStatus, requestActivation, importLicenseResponse } from "@/lib/api";
import { KeyRound, ShieldCheck, AlertTriangle, Copy, CheckCircle, Code2 } from "lucide-react";

interface LicenseStatus {
  status: "licensed" | "trial" | "expired" | "invalid" | "developer_unlimited" | "hw_id_error";
  hw_id: string;
  days_left: number | null;
  customer_id?: string;
  license_type?: string;
  error?: string;
}

export default function ActivatePage() {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [customerId, setCustomerId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [requestBlob, setRequestBlob] = useState("");
  const [copied, setCopied] = useState(false);

  const [responseBlob, setResponseBlob] = useState("");
  const [importing, setImporting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const s = await getLicenseStatus();
      setStatus(s.data);
    } catch {
      setMsg({ type: "err", text: "Could not connect to backend." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleGenerateRequest = async () => {
    if (!customerId.trim()) return;
    setGenerating(true);
    setMsg(null);
    try {
      const r = await requestActivation(customerId.trim());
      if (r.data.ok) {
        setRequestBlob(r.data.request);
      } else {
        setMsg({ type: "err", text: r.data.error || "Could not generate activation request." });
      }
    } catch {
      setMsg({ type: "err", text: "Could not generate activation request." });
    } finally {
      setGenerating(false);
    }
  };

  const handleImportResponse = async () => {
    if (!responseBlob.trim()) return;
    setImporting(true);
    setMsg(null);
    try {
      const r = await importLicenseResponse(responseBlob.trim());
      if (r.data.success) {
        setMsg({ type: "ok", text: "License activated successfully! FinPilot AI is now fully unlocked." });
        setResponseBlob("");
        load();
      } else {
        setMsg({ type: "err", text: r.data.error || "Activation failed." });
      }
    } catch {
      setMsg({ type: "err", text: "Activation failed. Please try again." });
    } finally {
      setImporting(false);
    }
  };

  const copyRequest = () => {
    navigator.clipboard.writeText(requestBlob).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Developer machine — show a minimal info panel, no activation form
  if (!loading && status?.status === "developer_unlimited") {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-5">
          <div className="text-center space-y-1">
            <div className="w-14 h-14 rounded-2xl bg-brand-indigo/10 flex items-center justify-center mx-auto mb-3">
              <Code2 size={28} className="text-brand-indigo" />
            </div>
            <h1 className="text-2xl font-bold text-text-primary">Developer Build</h1>
            <p className="text-text-muted text-sm">Unlimited access — no activation required</p>
          </div>
          <div className="card space-y-3">
            <div className="flex items-center gap-2 text-emerald-400">
              <ShieldCheck size={16} />
              <span className="font-semibold text-sm">Developer Unlimited</span>
            </div>
            <p className="text-text-secondary text-xs">
              This machine is registered as a developer device. All features are permanently unlocked with no expiry.
            </p>
            <div className="bg-bg-border/50 rounded px-3 py-2 font-mono text-xs text-text-muted">
              Machine ID: {status.hw_id}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const statusColor: Record<string, string> = {
    licensed: "text-emerald-400",
    trial: "text-amber-400",
    expired: "text-red-400",
    invalid: "text-red-400",
    hw_id_error: "text-red-400",
  };

  const statusLabel: Record<string, string> = {
    licensed: "Licensed",
    trial: "Trial Mode",
    expired: "Trial Expired",
    invalid: "Invalid License",
    hw_id_error: "Hardware ID Unavailable",
  };

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-5 py-10">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="w-14 h-14 rounded-2xl bg-brand-indigo/10 flex items-center justify-center mx-auto mb-3">
            <KeyRound size={28} className="text-brand-indigo" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">FinPilot AI Activation</h1>
          <p className="text-text-muted text-sm">Fully offline — no internet connection is used to activate</p>
        </div>

        {/* Status card */}
        {!loading && status && (
          <div className="card space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-text-muted text-sm">Current Status</span>
              <span className={`font-semibold text-sm ${statusColor[status.status] ?? ""}`}>
                {statusLabel[status.status] ?? status.status}
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
                Full access enabled{status.customer_id ? ` — ${status.customer_id}` : ""}
              </div>
            )}
            {(status.status === "expired" || status.status === "invalid") && (
              <p className="text-xs text-red-400/80">
                {status.error || "Please activate FinPilot AI to continue."}
              </p>
            )}
            {status.status === "hw_id_error" && (
              <p className="text-xs text-red-400/80">
                {status.error || "Could not read this machine's hardware ID. Hardware identification failed — activation cannot proceed on this machine."}
              </p>
            )}
          </div>
        )}

        {status?.status !== "hw_id_error" && status?.status !== "licensed" && (
          <>
            {/* Step 1: generate activation request */}
            <div className="card space-y-3">
              <div>
                <h3 className="font-semibold text-text-primary mb-1">Step 1 — Generate Activation Request</h3>
                <p className="text-xs text-text-secondary">
                  Enter your Customer/Deployment ID and generate a request to send to your vendor. It contains no secret information.
                </p>
              </div>
              <div>
                <label className="label">Customer / Deployment ID</label>
                <input
                  className="input text-sm font-mono"
                  placeholder="e.g. DARALSALAM, ALSIWAN"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value.toUpperCase())}
                />
              </div>
              <button
                className="btn-primary w-full justify-center"
                onClick={handleGenerateRequest}
                disabled={generating || !customerId.trim()}
              >
                {generating ? "Generating..." : "Generate Activation Request"}
              </button>

              {requestBlob && (
                <div className="space-y-2">
                  <label className="label">Activation Request — copy and send this to your vendor</label>
                  <textarea
                    readOnly
                    className="input font-mono text-xs h-24 resize-none"
                    value={requestBlob}
                    onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                  />
                  <button onClick={copyRequest} className="btn-secondary w-full justify-center text-sm">
                    {copied ? <CheckCircle size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    {copied ? "Copied!" : "Copy Request"}
                  </button>
                </div>
              )}
            </div>

            {/* Step 2: import signed response */}
            <div className="card space-y-3">
              <div>
                <h3 className="font-semibold text-text-primary mb-1">Step 2 — Import License Response</h3>
                <p className="text-xs text-text-secondary">
                  Paste the signed license response your vendor sends back, then activate.
                </p>
              </div>
              <textarea
                className="input font-mono text-xs h-24 resize-none"
                placeholder="FPAI-LIC-1-...."
                value={responseBlob}
                onChange={(e) => setResponseBlob(e.target.value)}
              />
              <button
                className="btn-primary w-full justify-center"
                onClick={handleImportResponse}
                disabled={importing || !responseBlob.trim()}
              >
                {importing ? "Activating..." : "Activate License"}
              </button>
            </div>
          </>
        )}

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

        <p className="text-center text-xs text-text-muted">
          Activation is fully offline. Contact your software vendor to exchange the request and response above.
        </p>
      </div>
    </div>
  );
}
