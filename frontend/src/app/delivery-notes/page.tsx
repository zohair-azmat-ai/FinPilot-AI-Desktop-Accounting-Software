"use client";

import { useEffect, useState, Suspense } from "react";
import Header from "@/components/Header";
import {
  getCustomers, getDeliveryNotes, createDeliveryNote,
  updateDeliveryNote, deleteDeliveryNote, downloadDeliveryNotePDF,
} from "@/lib/api";
import { Plus, Trash2, FileDown, Edit2, ClipboardList, CheckCircle, Clock } from "lucide-react";

interface Customer { id: number; name: string; }
interface DNItem { description: string; quantity: number; remarks: string; }
interface DeliveryNote {
  id: number; dn_number: string;
  customer_id: number | null; customer: Customer | null;
  date: string; remarks: string; status: string; letterhead: boolean;
  items: (DNItem & { id: number })[];
  created_at: string;
}

const emptyItem = (): DNItem => ({ description: "", quantity: 1, remarks: "" });

function DeliveryNotesContent() {
  const [notes, setNotes] = useState<DeliveryNote[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<DeliveryNote | null>(null);

  // Form state
  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState("");
  const [letterhead, setLetterhead] = useState(true);
  const [items, setItems] = useState<DNItem[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const load = () => {
    setLoading(true);
    Promise.all([getDeliveryNotes(), getCustomers()])
      .then(([dn, cust]) => { setNotes(dn.data); setCustomers(cust.data); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setCustomerId(""); setDate(new Date().toISOString().slice(0, 10));
    setRemarks(""); setLetterhead(true);
    setItems([emptyItem()]);
    setShowModal(true);
  };

  const openEdit = (dn: DeliveryNote) => {
    setEditing(dn);
    setCustomerId(dn.customer_id ? String(dn.customer_id) : "");
    setDate(dn.date.slice(0, 10));
    setRemarks(dn.remarks);
    setLetterhead(dn.letterhead);
    setItems(dn.items.length > 0 ? dn.items.map(i => ({ description: i.description, quantity: i.quantity, remarks: i.remarks })) : [emptyItem()]);
    setShowModal(true);
  };

  const addItem = () => setItems(prev => [...prev, emptyItem()]);
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof DNItem, value: string | number) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));

  const handleSave = async () => {
    if (items.some(i => !i.description.trim())) {
      showToast("Each item must have a description.");
      return;
    }
    setSaving(true);
    const payload = {
      customer_id: customerId ? parseInt(customerId) : null,
      date: date ? new Date(date).toISOString() : null,
      remarks, letterhead,
      items: items.filter(i => i.description.trim()),
    };
    try {
      if (editing) {
        await updateDeliveryNote(editing.id, { ...payload, status: editing.status });
        showToast("Delivery note updated.");
      } else {
        await createDeliveryNote(payload);
        showToast("Delivery note created.");
      }
      setShowModal(false);
      load();
    } catch {
      showToast("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this delivery note?")) return;
    await deleteDeliveryNote(id);
    showToast("Deleted.");
    load();
  };

  const handleMarkDelivered = async (dn: DeliveryNote) => {
    await updateDeliveryNote(dn.id, { status: dn.status === "delivered" ? "draft" : "delivered" });
    load();
  };

  const total = notes.length;
  const delivered = notes.filter(n => n.status === "delivered").length;
  const pending = notes.filter(n => n.status !== "delivered").length;

  return (
    <div>
      <Header title="Delivery Notes" />
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-brand-indigo text-white px-4 py-2 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}

      <div className="p-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="card">
            <p className="text-text-muted text-xs uppercase tracking-wide">Total</p>
            <p className="text-2xl font-bold text-text-primary mt-1">{total}</p>
          </div>
          <div className="card">
            <p className="text-text-muted text-xs uppercase tracking-wide">Delivered</p>
            <p className="text-2xl font-bold text-status-paid mt-1">{delivered}</p>
          </div>
          <div className="card">
            <p className="text-text-muted text-xs uppercase tracking-wide">Pending</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">{pending}</p>
          </div>
        </div>

        {/* Actions bar */}
        <div className="flex justify-end">
          <button className="btn-primary" onClick={openCreate}>
            <Plus size={15} /> New Delivery Note
          </button>
        </div>

        {/* Table */}
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="table-head">
              <tr>
                <th>DN No.</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Items</th>
                <th>Remarks</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-text-muted">Loading...</td></tr>
              ) : notes.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-16 text-text-muted">
                  <ClipboardList size={36} className="mx-auto mb-2 opacity-20" />
                  <p>No delivery notes yet. Click &ldquo;New Delivery Note&rdquo; to get started.</p>
                </td></tr>
              ) : notes.map(dn => (
                <tr key={dn.id} className="table-row">
                  <td className="font-mono text-sm text-brand-indigo font-semibold">{dn.dn_number}</td>
                  <td>{dn.customer?.name || <span className="text-text-muted italic">—</span>}</td>
                  <td className="text-text-secondary">{new Date(dn.date).toLocaleDateString("en-AE")}</td>
                  <td className="text-text-secondary">{dn.items.length} item{dn.items.length !== 1 ? "s" : ""}</td>
                  <td className="text-text-secondary max-w-[140px] truncate">{dn.remarks || "—"}</td>
                  <td>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                      dn.status === "delivered"
                        ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                        : "text-amber-400 bg-amber-500/10 border-amber-500/20"
                    }`}>
                      {dn.status === "delivered" ? "Delivered" : "Pending"}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className="p-1.5 rounded hover:bg-bg-primary text-text-muted hover:text-emerald-400 transition-colors"
                        title={dn.status === "delivered" ? "Mark as Pending" : "Mark as Delivered"}
                        onClick={() => handleMarkDelivered(dn)}
                      >
                        {dn.status === "delivered" ? <Clock size={14} /> : <CheckCircle size={14} />}
                      </button>
                      <a
                        href={downloadDeliveryNotePDF(dn.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded hover:bg-bg-primary text-text-muted hover:text-brand-indigo transition-colors"
                        title="Download PDF"
                      >
                        <FileDown size={14} />
                      </a>
                      <button
                        className="p-1.5 rounded hover:bg-bg-primary text-text-muted hover:text-blue-400 transition-colors"
                        title="Edit"
                        onClick={() => openEdit(dn)}
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        className="p-1.5 rounded hover:bg-bg-primary text-text-muted hover:text-red-400 transition-colors"
                        title="Delete"
                        onClick={() => handleDelete(dn.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto py-8">
          <div className="bg-bg-secondary rounded-xl shadow-2xl border border-bg-border w-full max-w-3xl mx-4">
            <div className="flex items-center justify-between p-5 border-b border-bg-border">
              <h2 className="text-lg font-bold text-text-primary">
                {editing ? `Edit ${editing.dn_number}` : "New Delivery Note"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-text-muted hover:text-text-primary text-xl leading-none">&times;</button>
            </div>

            <div className="p-5 space-y-4">
              {/* Customer + Date + Letterhead */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Customer</label>
                  <select className="input" value={customerId} onChange={e => setCustomerId(e.target.value)}>
                    <option value="">— Walk-in / No Customer —</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Date</label>
                  <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Remarks</label>
                  <input className="input" type="text" placeholder="Optional note" value={remarks} onChange={e => setRemarks(e.target.value)} />
                </div>
                <div className="flex items-end pb-0.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={letterhead} onChange={e => setLetterhead(e.target.checked)}
                      className="w-4 h-4 rounded accent-indigo-500" />
                    <span className="text-sm text-text-secondary">Include company letterhead</span>
                  </label>
                </div>
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">Items</label>
                  <button className="btn-secondary text-xs py-1 px-2" onClick={addItem}>
                    <Plus size={12} /> Add Row
                  </button>
                </div>
                <div className="rounded-lg border border-bg-border overflow-hidden">
                  <table className="w-full">
                    <thead className="table-head">
                      <tr>
                        <th className="w-8">#</th>
                        <th>Description *</th>
                        <th className="w-20">Qty</th>
                        <th>Remarks</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={idx} className="border-b border-bg-border last:border-0">
                          <td className="px-3 py-2 text-text-muted text-sm text-center">{idx + 1}</td>
                          <td className="px-2 py-1.5">
                            <input
                              className="input py-1.5 text-sm"
                              placeholder="Item description"
                              value={item.description}
                              onChange={e => updateItem(idx, "description", e.target.value)}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className="input py-1.5 text-sm text-center"
                              type="number" min="0" step="0.01"
                              value={item.quantity}
                              onChange={e => updateItem(idx, "quantity", parseFloat(e.target.value) || 0)}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className="input py-1.5 text-sm"
                              placeholder="Optional"
                              value={item.remarks}
                              onChange={e => updateItem(idx, "remarks", e.target.value)}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {items.length > 1 && (
                              <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-300">
                                <Trash2 size={13} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex gap-3 p-5 border-t border-bg-border justify-end">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : editing ? "Update" : "Create Delivery Note"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DeliveryNotesPage() {
  return <Suspense><DeliveryNotesContent /></Suspense>;
}
