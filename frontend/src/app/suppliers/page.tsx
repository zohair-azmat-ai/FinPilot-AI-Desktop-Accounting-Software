"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import { getSuppliers, createSupplier, updateSupplier, deleteSupplier } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Edit2, Trash2, Truck, X, Search } from "lucide-react";

interface Supplier {
  id: number; name: string; trn: string; attn: string;
  phone: string; email: string; address: string; opening_balance: number;
}

const emptyForm = { name: "", trn: "", attn: "", phone: "", email: "", address: "", opening_balance: 0 };

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = () => getSuppliers().then((r) => setSuppliers(r.data));
  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(emptyForm); setEditing(null); setShowModal(true); };
  const openEdit = (s: Supplier) => { setForm(s); setEditing(s); setShowModal(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) { await updateSupplier(editing.id, form); toast.success("Supplier updated!"); }
      else { await createSupplier(form); toast.success("Supplier added!"); }
      setShowModal(false); load();
    } catch { toast.error("Failed to save."); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this supplier?")) return;
    try { await deleteSupplier(id); toast.success("Deleted."); load(); }
    catch { toast.error("Failed to delete."); }
  };

  const filtered = suppliers.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <Header title="Suppliers" />
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="relative w-72">
            <Search size={15} className="absolute left-3 top-2.5 text-text-muted" />
            <input className="input pl-9" placeholder="Search suppliers..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={openNew}><Plus size={15} /> Add Supplier</button>
        </div>

        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="table-head">
              <tr><th>Name</th><th>TRN</th><th>Phone</th><th>Email</th><th>Opening Balance</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-text-muted">
                  <Truck size={32} className="mx-auto mb-2 opacity-30" /><p>No suppliers found.</p>
                </td></tr>
              ) : filtered.map((s) => (
                <tr key={s.id} className="table-row">
                  <td className="font-medium">{s.name}</td>
                  <td className="text-text-secondary font-mono text-xs">{s.trn || "—"}</td>
                  <td className="text-text-secondary">{s.phone || "—"}</td>
                  <td className="text-text-secondary">{s.email || "—"}</td>
                  <td>AED {s.opening_balance.toFixed(2)}</td>
                  <td><div className="flex gap-2">
                    <button onClick={() => openEdit(s)} className="text-text-muted hover:text-brand-indigo"><Edit2 size={14} /></button>
                    <button onClick={() => handleDelete(s.id)} className="text-text-muted hover:text-red-400"><Trash2 size={14} /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-bg-border">
              <h3 className="font-semibold">{editing ? "Edit Supplier" : "Add Supplier"}</h3>
              <button onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="label">Name *</label>
                  <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
                <div><label className="label">TRN</label>
                  <input className="input" value={form.trn} onChange={(e) => setForm({ ...form, trn: e.target.value })} /></div>
                <div><label className="label">Attention</label>
                  <input className="input" value={form.attn} onChange={(e) => setForm({ ...form, attn: e.target.value })} /></div>
                <div><label className="label">Phone</label>
                  <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div><label className="label">Email</label>
                  <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div className="col-span-2"><label className="label">Address</label>
                  <textarea className="input h-16 resize-none" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
                <div><label className="label">Opening Balance (AED)</label>
                  <input className="input" type="number" step="0.01" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: parseFloat(e.target.value) || 0 })} /></div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" className="btn-primary flex-1 justify-center">{editing ? "Update" : "Add Supplier"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
