"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import { getItems, createItem, updateItem, deleteItem } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Edit2, Trash2, Package, X, Search, Check } from "lucide-react";

interface Item {
  id: number; name: string; description: string; unit: string;
  price: number; vat_applicable: boolean;
}

const emptyForm = { name: "", description: "", unit: "Nos", price: 0, vat_applicable: true };

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = () => getItems().then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(emptyForm); setEditing(null); setShowModal(true); };
  const openEdit = (i: Item) => { setForm(i); setEditing(i); setShowModal(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) { await updateItem(editing.id, form); toast.success("Item updated!"); }
      else { await createItem(form); toast.success("Item added!"); }
      setShowModal(false); load();
    } catch { toast.error("Failed to save."); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this item?")) return;
    try { await deleteItem(id); toast.success("Deleted."); load(); }
    catch { toast.error("Failed to delete."); }
  };

  const filtered = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  const UNITS = ["Nos", "Pcs", "Kg", "L", "m", "m²", "m³", "Box", "Set", "Job", "Service", "Hour", "Day"];

  return (
    <div>
      <Header title="Items / Services" />
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="relative w-72">
            <Search size={15} className="absolute left-3 top-2.5 text-text-muted" />
            <input className="input pl-9" placeholder="Search items..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={openNew}><Plus size={15} /> Add Item</button>
        </div>

        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="table-head">
              <tr><th>Name</th><th>Description</th><th>Unit</th><th>Price (AED)</th><th>VAT</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-text-muted">
                  <Package size={32} className="mx-auto mb-2 opacity-30" /><p>No items found.</p>
                </td></tr>
              ) : filtered.map((item) => (
                <tr key={item.id} className="table-row">
                  <td className="font-medium">{item.name}</td>
                  <td className="text-text-secondary text-xs max-w-xs truncate">{item.description || "—"}</td>
                  <td><span className="text-xs bg-bg-secondary border border-bg-border px-2 py-0.5 rounded">{item.unit}</span></td>
                  <td className="font-mono">{item.price.toFixed(2)}</td>
                  <td>{item.vat_applicable
                    ? <span className="flex items-center gap-1 text-emerald-400 text-xs"><Check size={12} /> 5%</span>
                    : <span className="text-text-muted text-xs">Exempt</span>}
                  </td>
                  <td><div className="flex gap-2">
                    <button onClick={() => openEdit(item)} className="text-text-muted hover:text-brand-indigo"><Edit2 size={14} /></button>
                    <button onClick={() => handleDelete(item.id)} className="text-text-muted hover:text-red-400"><Trash2 size={14} /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-bg-border">
              <h3 className="font-semibold">{editing ? "Edit Item" : "Add Item / Service"}</h3>
              <button onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="label">Item Name *</label>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Aluminium Profile" required />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea className="input h-16 resize-none" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Unit</label>
                  <select className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Default Price (AED)</label>
                  <input className="input" type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.vat_applicable} onChange={(e) => setForm({ ...form, vat_applicable: e.target.checked })} className="w-4 h-4 accent-brand-indigo" />
                <span className="text-sm text-text-primary">VAT Applicable (5%)</span>
              </label>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" className="btn-primary flex-1 justify-center">{editing ? "Update" : "Add Item"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
