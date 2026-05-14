"use client";

import { useRef, useState, useEffect } from "react";
import Header from "@/components/Header";
import {
  downloadBackup, restoreBackup, apiErr,
  getCloudStatus, cloudConnect, cloudDisconnect, cloudSyncNow, cloudRestore, getCloudSchema,
  getCloudPdfUrl, setCloudPdfUrl, api,
} from "@/lib/api";
import {
  HardDrive, Download, Upload, AlertTriangle, CheckCircle,
  Cloud, CloudOff, RefreshCw, Unlink, Link, Copy, ChevronDown, ChevronUp, ImageUp,
} from "lucide-react";
import toast from "react-hot-toast";

interface CloudStatus {
  state: "offline" | "syncing" | "synced" | "error";
  last_sync: string | null;
  error: string | null;
  connected: boolean;
  workspace_id: string | null;
}

const STATE_COLOR: Record<string, string> = {
  synced:  "text-emerald-400",
  syncing: "text-amber-400",
  error:   "text-red-400",
  offline: "text-text-muted",
};
const STATE_LABEL: Record<string, string> = {
  synced: "Synced", syncing: "Syncing…", error: "Sync Error", offline: "Offline",
};

export default function BackupPage() {
  const [tab, setTab] = useState<"local" | "cloud">("local");

  // ── Local backup state ────────────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null);
  const [restoring, setRestoring] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleDownload = () => {
    window.open(downloadBackup(), "_blank");
    toast.success("Backup download started");
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirmed) {
      toast.error("Please confirm you understand restoring will overwrite all current data.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setRestoring(true);
    try {
      await restoreBackup(file);
      toast.success("Database restored! Please restart the app.");
    } catch {
      toast.error("Restore failed. Ensure the backup file is valid.");
    } finally {
      setRestoring(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ── Cloud sync state ──────────────────────────────────────────────────────
  const [cloudStatus, setCloudStatus] = useState<CloudStatus | null>(null);
  const [url, setUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [restoreConfirmed, setRestoreConfirmed] = useState(false);
  const [cloudRestoring, setCloudRestoring] = useState(false);
  const [schema, setSchema] = useState("");
  const [showSchema, setShowSchema] = useState(false);
  const [schemaCopied, setSchemaCopied] = useState(false);
  const [cloudPdfUrlInput, setCloudPdfUrlInput] = useState("");
  const [pushingAssets, setPushingAssets] = useState(false);

  useEffect(() => {
    const saved = getCloudPdfUrl();
    if (saved) setCloudPdfUrlInput(saved);
  }, []);

  const loadCloudStatus = async () => {
    try {
      const r = await getCloudStatus();
      setCloudStatus(r.data);
    } catch { /* backend offline */ }
  };

  useEffect(() => {
    loadCloudStatus();
    const id = setInterval(loadCloudStatus, 15_000);
    return () => clearInterval(id);
  }, []);

  const handleConnect = async () => {
    if (!url.trim() || !anonKey.trim() || !workspaceId.trim()) {
      toast.error("All three fields are required.");
      return;
    }
    setConnecting(true);
    try {
      const r = await cloudConnect({ url: url.trim(), anon_key: anonKey.trim(), workspace_id: workspaceId.trim() });
      if (r.data.ok) {
        toast.success("Connected to Supabase! Initial sync started.");
        setUrl(""); setAnonKey("");
        loadCloudStatus();
      } else {
        toast.error(r.data.error || "Connection failed.");
      }
    } catch (e) {
      toast.error(apiErr(e, "Connection failed."));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await cloudDisconnect();
      toast.success("Disconnected from cloud.");
      loadCloudStatus();
    } catch (e) {
      toast.error(apiErr(e));
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const r = await cloudSyncNow();
      if (r.data.ok) {
        toast.success("Sync complete!");
      } else {
        toast.error(r.data.error || "Sync failed.");
      }
      loadCloudStatus();
    } catch (e) {
      toast.error(apiErr(e, "Sync failed."));
    } finally {
      setSyncing(false);
    }
  };

  const handleCloudRestore = async () => {
    if (!restoreConfirmed) {
      toast.error("Please confirm you understand this will overwrite all local data.");
      return;
    }
    setCloudRestoring(true);
    try {
      const r = await cloudRestore();
      if (r.data.ok) {
        toast.success("Restore complete! Please restart the app to reload data.");
        setRestoreConfirmed(false);
      } else {
        toast.error(r.data.error || "Restore failed.");
      }
    } catch (e) {
      toast.error(apiErr(e, "Restore failed."));
    } finally {
      setCloudRestoring(false);
    }
  };

  const handleGetSchema = async () => {
    try {
      const r = await getCloudSchema();
      setSchema(r.data.sql);
      setShowSchema(true);
    } catch (e) {
      toast.error(apiErr(e, "Could not generate schema."));
    }
  };

  const copySchema = () => {
    navigator.clipboard.writeText(schema).then(() => {
      setSchemaCopied(true);
      setTimeout(() => setSchemaCopied(false), 2000);
    });
  };

  const connected = cloudStatus?.connected;

  return (
    <div>
      <Header title="Backup & Restore" />
      <div className="p-6 max-w-2xl space-y-5">

        {/* Tab switcher */}
        <div className="flex gap-1 bg-bg-secondary border border-bg-border rounded-xl p-1 w-fit">
          {(["local", "cloud"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
                tab === t ? "bg-bg-card text-text-primary" : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {t === "cloud" ? "☁ Cloud Backup" : "💾 Local Backup"}
            </button>
          ))}
        </div>

        {/* ── LOCAL TAB ─────────────────────────────────────────────────── */}
        {tab === "local" && (
          <>
            <div className="card space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-brand-indigo/10 flex items-center justify-center text-brand-indigo">
                  <HardDrive size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-text-primary">Create Backup</h3>
                  <p className="text-xs text-text-secondary">Download a full backup of your database as a .zip file</p>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-bg-secondary border border-bg-border text-sm text-text-secondary">
                The backup contains your entire database including invoices, customers, suppliers, payments, and all settings.
              </div>
              <button onClick={handleDownload} className="btn-primary w-full justify-center">
                <Download size={15} /> Download Backup (.zip)
              </button>
            </div>

            <div className="card space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-400">
                  <Upload size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-text-primary">Restore from Backup</h3>
                  <p className="text-xs text-text-secondary">Replace current database with a backup file</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                <AlertTriangle size={18} className="text-red-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-red-300">
                  <p className="font-semibold mb-1">Warning: This action cannot be undone</p>
                  <p className="text-red-400/80">Restoring will permanently replace all current data. The current database will be saved as a pre-restore backup in the FinPilot folder.</p>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => setConfirmed(!confirmed)}
                  className={`relative w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${confirmed ? "bg-red-500 border-red-500" : "border-bg-border"}`}
                >
                  {confirmed && <CheckCircle size={14} className="text-white" />}
                </div>
                <span className="text-sm text-text-primary">I understand this will overwrite all current data</span>
              </label>
              <input ref={fileRef} type="file" accept=".zip" className="hidden" onChange={handleRestore} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={restoring || !confirmed}
                className="btn-secondary w-full justify-center text-red-400 border-red-500/30 hover:border-red-500/60 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Upload size={15} />
                {restoring ? "Restoring..." : "Select Backup File (.zip)"}
              </button>
            </div>

            <div className="p-3 rounded-lg bg-bg-secondary border border-bg-border text-xs text-text-muted">
              Backups are stored in <code className="text-brand-indigo">%USERPROFILE%\FinPilot\backups\</code>. Create a backup before any major data changes.
            </div>
          </>
        )}

        {/* ── CLOUD TAB ─────────────────────────────────────────────────── */}
        {tab === "cloud" && (
          <>
            {/* Status banner */}
            {cloudStatus && (
              <div className={`card flex items-center justify-between`}>
                <div className="flex items-center gap-3">
                  {connected ? <Cloud size={20} className="text-brand-indigo" /> : <CloudOff size={20} className="text-text-muted" />}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-text-primary">
                        {connected ? "Connected" : "Not Connected"}
                      </span>
                      <span className={`text-xs font-medium ${STATE_COLOR[cloudStatus.state] ?? "text-text-muted"}`}>
                        · {STATE_LABEL[cloudStatus.state] ?? cloudStatus.state}
                      </span>
                    </div>
                    {connected && cloudStatus.workspace_id && (
                      <p className="text-xs text-text-muted mt-0.5">Workspace: {cloudStatus.workspace_id}</p>
                    )}
                    {connected && cloudStatus.last_sync && (
                      <p className="text-xs text-text-muted">
                        Last sync: {new Date(cloudStatus.last_sync).toLocaleString()}
                      </p>
                    )}
                    {cloudStatus.error && (
                      <p className="text-xs text-red-400 mt-0.5">{cloudStatus.error}</p>
                    )}
                  </div>
                </div>
                {connected && (
                  <button
                    onClick={handleSyncNow}
                    disabled={syncing}
                    className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5"
                  >
                    <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
                    {syncing ? "Syncing…" : "Sync Now"}
                  </button>
                )}
              </div>
            )}

            {/* Connect form — shown when not connected */}
            {!connected && (
              <div className="card space-y-4">
                <div>
                  <h3 className="font-semibold text-text-primary mb-1">Connect to Supabase</h3>
                  <p className="text-xs text-text-secondary">
                    Create a free Supabase project at supabase.com, run the schema SQL below, then enter your credentials.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="label">Supabase Project URL</label>
                    <input
                      className="input text-sm font-mono"
                      placeholder="https://xxxxxxxxxxxx.supabase.co"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">Anon (Public) Key</label>
                    <input
                      className="input text-sm font-mono"
                      placeholder="eyJhbGci..."
                      value={anonKey}
                      onChange={(e) => setAnonKey(e.target.value)}
                      type="password"
                    />
                  </div>
                  <div>
                    <label className="label">Workspace ID</label>
                    <input
                      className="input text-sm"
                      placeholder="e.g. my-company-2026 (unique per installation)"
                      value={workspaceId}
                      onChange={(e) => setWorkspaceId(e.target.value)}
                    />
                    <p className="text-xs text-text-muted mt-1">
                      Use a unique ID per company — this isolates your data from other installations using the same Supabase project.
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="btn-primary w-full justify-center"
                >
                  <Link size={14} />
                  {connecting ? "Connecting…" : "Connect & Start Syncing"}
                </button>

                {/* Schema SQL accordion */}
                <div className="border border-bg-border rounded-xl overflow-hidden">
                  <button
                    onClick={showSchema ? () => setShowSchema(false) : handleGetSchema}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm text-text-secondary hover:text-text-primary transition-colors"
                  >
                    <span className="font-medium">Get Supabase Schema SQL</span>
                    {showSchema ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {showSchema && schema && (
                    <div className="border-t border-bg-border p-3 space-y-2">
                      <p className="text-xs text-text-muted">
                        Paste this into Supabase → SQL Editor → Run before connecting.
                      </p>
                      <div className="relative">
                        <pre className="text-xs bg-bg-primary rounded-lg p-3 overflow-auto max-h-48 text-text-secondary font-mono whitespace-pre">
                          {schema}
                        </pre>
                        <button
                          onClick={copySchema}
                          className="absolute top-2 right-2 btn-secondary px-2 py-1 text-xs flex items-center gap-1"
                        >
                          {schemaCopied ? <CheckCircle size={11} className="text-emerald-400" /> : <Copy size={11} />}
                          {schemaCopied ? "Copied!" : "Copy"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Connected controls */}
            {connected && (
              <>
                <div className="card space-y-4">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-10 h-10 rounded-xl bg-brand-indigo/10 flex items-center justify-center text-brand-indigo">
                      <Cloud size={20} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-text-primary">Restore from Cloud</h3>
                      <p className="text-xs text-text-secondary">Pull all data from Supabase and replace local database</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                    <AlertTriangle size={18} className="text-red-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-red-300">
                      <p className="font-semibold mb-1">Warning: Overwrites all local data</p>
                      <p className="text-red-400/80">A local backup snapshot is created automatically before restore. Use this to recover from accidental deletion or to sync a new PC.</p>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div
                      onClick={() => setRestoreConfirmed(!restoreConfirmed)}
                      className={`relative w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${restoreConfirmed ? "bg-red-500 border-red-500" : "border-bg-border"}`}
                    >
                      {restoreConfirmed && <CheckCircle size={14} className="text-white" />}
                    </div>
                    <span className="text-sm text-text-primary">I understand this will overwrite all local data</span>
                  </label>
                  <button
                    onClick={handleCloudRestore}
                    disabled={cloudRestoring || !restoreConfirmed}
                    className="btn-secondary w-full justify-center text-red-400 border-red-500/30 hover:border-red-500/60 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Download size={15} />
                    {cloudRestoring ? "Restoring from Cloud…" : "Restore from Cloud"}
                  </button>
                </div>

                <div className="card space-y-3">
                  <h3 className="font-semibold text-text-primary text-sm">Disconnect Cloud</h3>
                  <p className="text-xs text-text-secondary">
                    Stops background sync. Your Supabase data is preserved — you can reconnect any time.
                  </p>
                  <button
                    onClick={handleDisconnect}
                    className="btn-secondary flex items-center gap-2 text-sm text-text-secondary"
                  >
                    <Unlink size={14} /> Disconnect
                  </button>
                </div>
              </>
            )}

            {/* Cloud PDF Backend */}
            <div className="card space-y-4">
              <div>
                <h3 className="font-semibold text-text-primary">Cloud PDF Backend</h3>
                <p className="text-xs text-text-secondary mt-1">
                  Set the Hugging Face Space URL to generate PDFs via cloud. When configured, invoice / quotation / DN / PO PDF buttons use this URL instead of the local backend — works even when the local PC backend is off.
                </p>
              </div>
              <div>
                <label className="label">Cloud PDF Backend URL</label>
                <input
                  className="input text-sm font-mono"
                  placeholder="https://zohairazmat-finpilot-ai-backend.hf.space"
                  value={cloudPdfUrlInput}
                  onChange={(e) => setCloudPdfUrlInput(e.target.value)}
                />
                <p className="text-xs text-text-muted mt-1">
                  Leave blank to always use the local backend (http://127.0.0.1:8001).
                </p>
              </div>
              <button
                onClick={() => {
                  const trimmed = cloudPdfUrlInput.trim().replace(/\/$/, "");
                  setCloudPdfUrl(trimmed);
                  toast.success(trimmed ? "Cloud PDF Backend URL saved." : "Cloud PDF Backend URL cleared.");
                }}
                className="btn-primary w-full justify-center"
              >
                Save Cloud PDF Backend
              </button>

              <div className="border-t border-bg-border pt-3">
                <p className="text-xs text-text-muted mb-2">
                  Upload your letterhead and stamp images to the cloud backend so cloud-generated PDFs show the same branding as desktop PDFs.
                </p>
                <button
                  onClick={async () => {
                    const trimmed = cloudPdfUrlInput.trim().replace(/\/$/, "") || getCloudPdfUrl();
                    if (!trimmed) {
                      toast.error("Set and save a Cloud PDF Backend URL first.");
                      return;
                    }
                    setPushingAssets(true);
                    try {
                      const r = await api.post("/api/cloud/push-assets", { hf_url: trimmed });
                      const res = r.data?.results || {};
                      const lhOk = res.letterhead?.ok;
                      const stOk = res.stamp?.ok;
                      if (lhOk && stOk) {
                        toast.success("Letterhead & stamp uploaded to cloud backend.");
                      } else {
                        const errs = [
                          !lhOk && `Letterhead: ${res.letterhead?.error || "failed"}`,
                          !stOk && `Stamp: ${res.stamp?.error || "failed"}`,
                        ].filter(Boolean).join("  |  ");
                        toast.error(`Asset upload partial: ${errs}`);
                      }
                    } catch (e) {
                      toast.error(apiErr(e, "Asset upload failed — check HF Space URL."));
                    } finally {
                      setPushingAssets(false);
                    }
                  }}
                  disabled={pushingAssets}
                  className="btn-secondary w-full justify-center disabled:opacity-40"
                >
                  <ImageUp size={14} />
                  {pushingAssets ? "Uploading assets…" : "Push Assets to Cloud (Letterhead & Stamp)"}
                </button>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-bg-secondary border border-bg-border text-xs text-text-muted space-y-1">
              <p>• Sync runs automatically every 2 minutes when connected.</p>
              <p>• Cloud sync is additive — deleted rows are NOT removed from Supabase.</p>
              <p>• Each workspace ID is isolated; use a different ID per company or installation.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
