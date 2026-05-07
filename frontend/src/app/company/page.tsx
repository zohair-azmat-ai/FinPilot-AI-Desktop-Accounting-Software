"use client";

import { useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import { getCompany, saveCompany, uploadStamp } from "@/lib/api";
import toast from "react-hot-toast";
import { Building2, Hash, Save, Stamp, Upload } from "lucide-react";

export default function CompanyPage() {
  const [form, setForm] = useState({
    name: "", trn: "", address: "", phone: "", email: "",
    letterhead_mode: true, vat_rate: 5.0,
    invoice_prefix: "", invoice_current_number: 0,
    dn_prefix: "DN-", dn_current_number: 0,
    show_dn_stamp: false,
    quotation_prefix: "QUO-", quotation_current_number: 0,
  });
  const [saving, setSaving] = useState(false);
  const [stampUploading, setStampUploading] = useState(false);
  const stampInputRef = useRef<HTMLInputElement>(null);

  const handleStampUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStampUploading(true);
    try {
      await uploadStamp(file);
      toast.success("Stamp uploaded successfully!");
    } catch {
      toast.error("Failed to upload stamp.");
    } finally {
      setStampUploading(false);
      if (stampInputRef.current) stampInputRef.current.value = "";
    }
  };

  useEffect(() => {
    getCompany().then((res) => setForm(res.data)).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveCompany(form);
      toast.success("Company settings saved!");
    } catch {
      toast.error("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Header title="Company Setup" />
      <div className="p-6 max-w-2xl">
        <div className="card space-y-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-brand-indigo/10 flex items-center justify-center text-brand-indigo">
              <Building2 size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-text-primary">Company Information</h3>
              <p className="text-xs text-text-secondary">This appears on invoices and statements</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="label">Company Name *</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Gulf Trading LLC" />
            </div>
            <div>
              <label className="label">TRN (Tax Registration No.)</label>
              <input className="input" value={form.trn} onChange={(e) => setForm({ ...form, trn: e.target.value })} placeholder="e.g. 100234567890001" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+971 4 XXX XXXX" />
            </div>
            <div className="md:col-span-2">
              <label className="label">Email</label>
              <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="accounts@company.ae" />
            </div>
            <div className="md:col-span-2">
              <label className="label">Address</label>
              <textarea className="input h-20 resize-none" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Office address, UAE" />
            </div>
          </div>

          <div className="border-t border-bg-border pt-4 space-y-4">
            <h4 className="font-medium text-text-primary text-sm">Accounting Settings</h4>
            <div className="flex items-center justify-between p-3 rounded-lg bg-bg-secondary border border-bg-border">
              <div>
                <p className="text-sm font-medium text-text-primary">VAT Rate</p>
                <p className="text-xs text-text-muted">UAE standard VAT rate</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  className="input w-20 text-center"
                  value={form.vat_rate}
                  onChange={(e) => setForm({ ...form, vat_rate: parseFloat(e.target.value) })}
                />
                <span className="text-text-secondary text-sm">%</span>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-bg-secondary border border-bg-border">
              <div>
                <p className="text-sm font-medium text-text-primary">Letterhead Mode</p>
                <p className="text-xs text-text-muted">Print company header on PDFs</p>
              </div>
              <button
                onClick={() => setForm({ ...form, letterhead_mode: !form.letterhead_mode })}
                className={`relative w-12 h-6 rounded-full transition-colors ${form.letterhead_mode ? "bg-brand-indigo" : "bg-bg-border"}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.letterhead_mode ? "translate-x-6" : "translate-x-0.5"}`} />
              </button>
            </div>
          </div>

          <button onClick={handleSave} disabled={saving} className="btn-primary w-full justify-center">
            <Save size={15} />
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>

        {/* Invoice Series */}
        <div className="card space-y-4 mt-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-brand-indigo/10 flex items-center justify-center text-brand-indigo">
              <Hash size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-text-primary">Invoice Series</h3>
              <p className="text-xs text-text-secondary">Controls how invoice numbers are generated</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Invoice Prefix (optional)</label>
              <input
                className="input"
                value={form.invoice_prefix}
                onChange={(e) => setForm({ ...form, invoice_prefix: e.target.value })}
                placeholder='e.g. INV- (leave blank for none)'
              />
            </div>
            <div>
              <label className="label">Current / Starting Invoice No.</label>
              <input
                className="input"
                type="number"
                min="1"
                step="1"
                value={form.invoice_current_number || ""}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  setForm({ ...form, invoice_current_number: isNaN(v) || v < 1 ? 0 : v });
                }}
                placeholder="e.g. 8850"
              />
            </div>
          </div>
          {form.invoice_current_number > 0 ? (
            <div className="rounded-lg bg-brand-indigo/5 border border-brand-indigo/20 px-4 py-3">
              <p className="text-xs text-text-muted">Next invoice will be:</p>
              <p className="text-lg font-bold text-brand-indigo mt-0.5">
                {form.invoice_prefix || ""}{form.invoice_current_number}
              </p>
            </div>
          ) : (
            <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 px-4 py-3">
              <p className="text-xs text-amber-400">
                Enter a starting number (e.g. 8850) to enable invoice series. Until set, the system uses legacy auto-increment.
              </p>
            </div>
          )}
          <button onClick={handleSave} disabled={saving} className="btn-primary w-full justify-center">
            <Save size={15} />
            {saving ? "Saving..." : "Save Invoice Series"}
          </button>
        </div>

        {/* Quotation Series */}
        <div className="card space-y-4 mt-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-brand-indigo/10 flex items-center justify-center text-brand-indigo">
              <Hash size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-text-primary">Quotation Series</h3>
              <p className="text-xs text-text-secondary">Controls how quotation numbers are generated</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Quotation Prefix</label>
              <input
                className="input"
                value={form.quotation_prefix}
                onChange={(e) => setForm({ ...form, quotation_prefix: e.target.value })}
                placeholder='e.g. QUO- (default)'
              />
            </div>
            <div>
              <label className="label">Current / Starting Quotation No.</label>
              <input
                className="input"
                type="number"
                min="1"
                step="1"
                value={form.quotation_current_number || ""}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  setForm({ ...form, quotation_current_number: isNaN(v) || v < 1 ? 0 : v });
                }}
                placeholder="e.g. 500"
              />
            </div>
          </div>
          {form.quotation_current_number > 0 ? (
            <div className="rounded-lg bg-brand-indigo/5 border border-brand-indigo/20 px-4 py-3">
              <p className="text-xs text-text-muted">Next quotation will be:</p>
              <p className="text-lg font-bold text-brand-indigo mt-0.5">
                {form.quotation_prefix || "QUO-"}{String(form.quotation_current_number).padStart(4, "0")}
              </p>
            </div>
          ) : (
            <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 px-4 py-3">
              <p className="text-xs text-amber-400">
                Enter a starting number (e.g. 500) to enable quotation series. Until set, the system auto-increments from the last quotation.
              </p>
            </div>
          )}
          <button onClick={handleSave} disabled={saving} className="btn-primary w-full justify-center">
            <Save size={15} />
            {saving ? "Saving..." : "Save Quotation Series"}
          </button>
        </div>

        {/* Delivery Note Series */}
        <div className="card space-y-4 mt-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-brand-indigo/10 flex items-center justify-center text-brand-indigo">
              <Hash size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-text-primary">Delivery Note Series</h3>
              <p className="text-xs text-text-secondary">Controls how delivery note numbers are generated</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Delivery Note Prefix</label>
              <input
                className="input"
                value={form.dn_prefix}
                onChange={(e) => setForm({ ...form, dn_prefix: e.target.value })}
                placeholder='e.g. DN- (default)'
              />
            </div>
            <div>
              <label className="label">Current / Starting DN No.</label>
              <input
                className="input"
                type="number"
                min="1"
                step="1"
                value={form.dn_current_number || ""}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  setForm({ ...form, dn_current_number: isNaN(v) || v < 1 ? 0 : v });
                }}
                placeholder="e.g. 9948"
              />
            </div>
          </div>
          {form.dn_current_number > 0 ? (
            <div className="rounded-lg bg-brand-indigo/5 border border-brand-indigo/20 px-4 py-3">
              <p className="text-xs text-text-muted">Next delivery note will be:</p>
              <p className="text-lg font-bold text-brand-indigo mt-0.5">
                {form.dn_prefix || "DN-"}{String(form.dn_current_number).padStart(4, "0")}
              </p>
            </div>
          ) : (
            <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 px-4 py-3">
              <p className="text-xs text-amber-400">
                Enter a starting number (e.g. 9948) to enable DN series. Until set, the system auto-increments from the last DN.
              </p>
            </div>
          )}
          <div className="flex items-center justify-between p-3 rounded-lg bg-bg-secondary border border-bg-border">
            <div>
              <p className="text-sm font-medium text-text-primary">Show Stamp on Delivery Notes</p>
              <p className="text-xs text-text-muted">Print company stamp on DN PDFs</p>
            </div>
            <button
              onClick={() => setForm({ ...form, show_dn_stamp: !form.show_dn_stamp })}
              className={`relative w-12 h-6 rounded-full transition-colors ${form.show_dn_stamp ? "bg-brand-indigo" : "bg-bg-border"}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.show_dn_stamp ? "translate-x-6" : "translate-x-0.5"}`} />
            </button>
          </div>
          <button onClick={handleSave} disabled={saving} className="btn-primary w-full justify-center">
            <Save size={15} />
            {saving ? "Saving..." : "Save DN Series"}
          </button>
        </div>

        {/* Stamp Upload */}
        <div className="card space-y-4 mt-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-brand-indigo/10 flex items-center justify-center text-brand-indigo">
              <Stamp size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-text-primary">Company Stamp</h3>
              <p className="text-xs text-text-secondary">PNG image printed on invoices when stamp is enabled</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-bg-secondary border border-bg-border">
            <div className="flex-1">
              <p className="text-sm text-text-primary">Upload stamp image (PNG recommended)</p>
              <p className="text-xs text-text-muted">Replaces existing stamp immediately</p>
            </div>
            <input
              ref={stampInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleStampUpload}
            />
            <button
              onClick={() => stampInputRef.current?.click()}
              disabled={stampUploading}
              className="btn-secondary py-1.5 px-3 text-sm"
            >
              <Upload size={14} />
              {stampUploading ? "Uploading..." : "Upload Stamp"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
