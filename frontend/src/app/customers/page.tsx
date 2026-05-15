"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import { getCustomers, createCustomer, updateCustomer, deleteCustomer } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Edit2, Trash2, Users, X, Search } from "lucide-react";

interface Customer {
  id: number; name: string; trn: string; attn: string;
  phone: string; email: string; address: string; po_box: string; opening_balance: number;
  payment_terms: string;
}

const emptyForm = { name: "", trn: "", attn: "", phone: "", email: "", address: "", po_box: "", opening_balance: 0, payment_terms: "" };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);

  const load = () => getCustomers().then((r) => setCustomers(r.data)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(emptyForm); setEditing(null); setShowModal(true); };
  const openEdit = (c: Customer) => { setForm(c); setEditing(c); setShowModal(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Customer name is required");
    try {
      if (editing) {
        await updateCustomer(editing.id, form);
        toast.success("Customer updated!");
      } else {
        await createCustomer(form);
        toast.success("Customer added!");
      }
      setShowModal(false);
      load();
    } catch {
      toast.error("Failed to save customer.");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this customer?")) return;
    try {
      await deleteCustomer(id);
      toast.success("Customer deleted.");
      load();
    } catch {
      toast.error("Cannot delete — may have linked invoices.");
    }
  };

  const filtered = customers.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search) || c.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <Header title="Customers" />
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="relative w-72">
            <Search size={15} className="absolute left-3 top-2.5 text-text-muted" />
            <input className="input pl-9" placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={openNew}>
            <Plus size={15} /> Add Customer
          </button>
        </div>

        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="table-head">
              <tr>
                <th>Name</th><th>TRN</th><th>ATTN</th><th>Phone</th>
                <th>Email</th><th>Opening Balance</th><th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-8 text-text-muted">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-text-muted">
                    <Users size={32} className="mx-auto mb-2 opacity-30" />
                    <p>No customers found.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id} className="table-row">
                    <td className="font-medium text-text-primary">{c.name}</td>
                    <td className="text-text-secondary font-mono text-xs">{c.trn || "—"}</td>
                    <td className="text-text-secondary">{c.attn || "—"}</td>
                    <td className="text-text-secondary">{c.phone || "—"}</td>
                    <td className="text-text-secondary">{c.email || "—"}</td>
                    <td className="text-text-secondary">AED {c.opening_balance.toFixed(2)}</td>
                    <td>
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(c)} className="text-text-muted hover:text-brand-indigo transition-colors"><Edit2 size={14} /></button>
                        <button onClick={() => handleDelete(c.id)} className="text-text-muted hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-bg-border">
              <h3 className="font-semibold">{editing ? "Edit Customer" : "Add Customer"}</h3>
              <button onClick={() => setShowModal(false)} className="text-text-muted hover:text-text-primary"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="label">Customer Name *</label>
                  <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Gulf Trading LLC" required />
                </div>
                <div>
                  <label className="label">TRN</label>
                  <input className="input" value={form.trn} onChange={(e) => setForm({ ...form, trn: e.target.value })} placeholder="Tax Registration No." />
                </div>
                <div>
                  <label className="label">Attention (ATTN)</label>
                  <input className="input" value={form.attn} onChange={(e) => setForm({ ...form, attn: e.target.value })} placeholder="Contact person" />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+971 50 XXX XXXX" />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@company.ae" />
                </div>
                <div className="col-span-2">
                  <label className="label">Address</label>
                  <textarea className="input h-16 resize-none" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Dubai, UAE" />
                </div>
                <div>
                  <label className="label">P.O Box</label>
                  <input className="input" value={form.po_box} onChange={(e) => setForm({ ...form, po_box: e.target.value })} placeholder="P.O Box 12345" />
                </div>
                <div>
                  <label className="label">Opening Balance (AED)</label>
                  <input className="input" type="number" step="0.01" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="col-span-2">
                  <label className="label">Payment Terms</label>
                  <input className="input" value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} placeholder="e.g. 30 Days, Cash on Delivery" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" className="btn-primary flex-1 justify-center">
                  {editing ? "Update" : "Add Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
