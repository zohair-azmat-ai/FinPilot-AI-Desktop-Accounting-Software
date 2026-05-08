"use client";

import { useRef, useState } from "react";
import Header from "@/components/Header";
import { downloadBackup, restoreBackup } from "@/lib/api";
import { HardDrive, Download, Upload, AlertTriangle, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";

export default function BackupPage() {
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
      toast.success("Database restored successfully! Please restart the app.");
    } catch {
      toast.error("Restore failed. Ensure the backup file is valid.");
    } finally {
      setRestoring(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      <Header title="Backup & Restore" />
      <div className="p-6 max-w-2xl space-y-5">

        {/* Backup */}
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

        {/* Restore */}
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
              <p className="text-red-400/80">Restoring will permanently replace all current data with the backup. The current database will be saved as a pre-restore backup in the FinPilot folder.</p>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <div
              onClick={() => setConfirmed(!confirmed)}
              className={`relative w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${confirmed ? "bg-red-500 border-red-500" : "border-bg-border"}`}
            >
              {confirmed && <CheckCircle size={14} className="text-white" />}
            </div>
            <span className="text-sm text-text-primary">
              I understand this will overwrite all current data
            </span>
          </label>

          <input
            ref={fileRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={handleRestore}
          />
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
          Backups are stored in <code className="text-brand-indigo">%USERPROFILE%\FinPilot\backups\</code>. It is recommended to create a backup before any major data changes.
        </div>
      </div>
    </div>
  );
}
