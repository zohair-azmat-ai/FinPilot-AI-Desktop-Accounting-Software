"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import {
  getSuppliers, getPurchaseOrders, createPurchaseOrder,
  updatePurchaseOrder, deletePurchaseOrder, downloadPurchaseOrderPDF, apiErr,
} from "@/lib/api";
import { Plus, Trash2, FileDown, Edit2, ShoppingCart, Save, X } from "lucide-react";
import toast from "react-hot-toast";

interface Supplier { id: number; name: string; }
interface POItem { description: string; quantity: number; unit_price: number; vat_applicable: boolean; }
interface PO {
  id: number; po_number: string;
  supplier_id: number | null; supplier: Supplier | null;
  date: string; delivery_date: string | null;
  payment_terms: string; delivery_terms: string; notes: string;
  subtotal: number; vat_amount: number; total: number;
  include_stamp: boolean; letterhead: boolean; status: string;
  items: (POItem & { id: number; vat_amount: number; total: number })[];
  created_at: string;
}

const emptyItem = (): POItem => ({ description: "", quantity: 1, unit_price: 0, vat_applicable: true });

export default function PurchaseOrdersPage() {
  const [pos, setPos] = useState<PO[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PO | null>(null);

  const [supplierId, setSupplierId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [deliveryDate, setDeliveryDate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [deliveryTerms, setDeliveryTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [includeStamp, setIncludeStamp] = useState(false);
  const [letterhead, setLetterhead] = useState(true);
  const [items, setItems] = useState<POItem[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.allSettled([getPurchaseOrders(), getSuppliers()])
      .then(([poRes, supRes]) => {
        if (poRes.status === "fulfilled") setPos(poRes.value.data);
        else { console.error("getPurchaseOrders failed:", poRes.reason); toast.error("Failed to load purchase orders"); }
        if (supRes.status === "fulfilled") setSuppliers(supRes.value.data);
        else { console.error("getSuppliers failed:", supRes.reason); toast.error("Failed to load suppliers"); }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setSupplierId(""); setDate(new Date().toISOString().slice(0, 10));
    setDeliveryDate(""); setPaymentTerms(""); setDeliveryTerms(""); setNotes("");
    setIncludeStamp(false); setLetterhead(true);
    setItems([emptyItem()]);
    setShowModal(true);
  };

  const openEdit = (po: PO) => {
    setEditing(po);
    setSupplierId(po.supplier_id ? String(po.supplier_id) : "");
    setDate(po.date ? po.date.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setDeliveryDate(po.delivery_date ? po.delivery_date.slice(0, 10) : "");
    setPaymentTerms(po.payment_terms || "");
    setDeliveryTerms(po.delivery_terms || "");
    setNotes(po.notes || "");
    setIncludeStamp(po.include_stamp);
    setLetterhead(po.letterhead);
    setItems(po.items.map(it => ({
      description: it.description, quantity: it.quantity,
      unit_price: it.unit_price, vat_applicable: it.vat_applicable,
    })));
    setShowModal(true);
  };

  const updateItem = (idx: number, field: keyof POItem, val: string | number | boolean) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));
  };

  const addItem = () => setItems(prev => [...prev, emptyItem()]);
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const calcTotals = () => {
    let sub = 0, vat = 0;
    items.forEach(it => {
      const amt = it.quantity * it.unit_price;
      const v = it.vat_applicable ? amt * 0.05 : 0;
      sub += amt; vat += v;
    });
    return { subtotal: sub, vat_amount: vat, total: sub + vat };
  };

  const { subtotal, vat_amount, total } = calcTotals();

  const handleSave = async () => {
    if (!items.some(it => it.description.trim())) {
      toast.error("Add at least one item"); return;
    }
    setSaving(true);
    try {
      const payload = {
        supplier_id: supplierId ? parseInt(supplierId) : null,
        date: date ? new Date(date).toISOString() : null,
        delivery_date: deliveryDate ? new Date(deliveryDate).toISOString() : null,
        payment_terms: paymentTerms, delivery_terms: deliveryTerms, notes,
        include_stamp: includeStamp, letterhead,
        items: items.filter(it => it.description.trim()),
      };
      if (editing) {
        await updatePurchaseOrder(editing.id, payload);
        toast.success("Purchase order updated");
      } else {
        await createPurchaseOrder(payload);
        toast.success("Purchase order created");
      }
      setShowModal(false);
      load();
    } catch (e) {
      toast.error(apiErr(e, "Failed to save purchase order"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this purchase order?")) return;
    try {
      await deletePurchaseOrder(id);
      toast.success("Deleted");
      load();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleWhatsApp = (po: PO) => {
    const sup = po.supplier?.name || "Supplier";
    const msg = encodeURIComponent(
      `Dear ${sup},\n\nPlease find attached Purchase Order ${po.po_number} for AED ${po.total.toFixed(2)}.\n\nKind regards`
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };

  return (
    <div>
      <Header title="Purchase Orders" />
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-indigo/10 flex items-center justify-center text-brand-indigo">
              <ShoppingCart size={20} />
            </div>
            <div>
              <h2 className="font-semibold text-text-primary">Purchase Orders</h2>
              <p className="text-xs text-text-secondary">{pos.length} orders</p>
            </div>
          </div>
          <button onClick={openCreate} className="btn-primary">
            <Plus size={15} /> New Purchase Order
          </button>
        </div>

        {loading ? (
          <div className="card text-center text-text-muted py-12">Loading...</div>
        ) : pos.length === 0 ? (
          <div className="card text-center py-12 text-text-muted">
            No purchase orders yet. Create your first one.
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bg-border">
                  <th className="text-left p-3 text-text-secondary font-medium">PO No</th>
                  <th className="text-left p-3 text-text-secondary font-medium">Supplier</th>
                  <th className="text-left p-3 text-text-secondary font-medium">Date</th>
                  <th className="text-left p-3 text-text-secondary font-medium">Status</th>
                  <th className="text-right p-3 text-text-secondary font-medium">Total (AED)</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {pos.map(po => (
                  <tr key={po.id} className="border-b border-bg-border hover:bg-bg-secondary/50">
                    <td className="p-3 font-mono text-brand-indigo font-semibold">{po.po_number}</td>
                    <td className="p-3 text-text-primary">{po.supplier?.name || "—"}</td>
                    <td className="p-3 text-text-secondary">{po.date ? new Date(po.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        po.status === "received" ? "bg-green-500/10 text-green-400" :
                        po.status === "sent" ? "bg-blue-500/10 text-blue-400" :
                        "bg-yellow-500/10 text-yellow-400"
                      }`}>{po.status}</span>
                    </td>
                    <td className="p-3 text-right font-semibold text-text-primary">{po.total.toFixed(2)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2 justify-end">
                        <a href={downloadPurchaseOrderPDF(po.id, po.po_number)} target="_blank" rel="noopener noreferrer"
                          className="btn-secondary py-1 px-2 text-xs">
                          <FileDown size={13} /> PDF
                        </a>
                        <button onClick={() => handleWhatsApp(po)}
                          className="btn-secondary py-1 px-2 text-xs text-green-400">
                          WhatsApp
                        </button>
                        <button onClick={() => openEdit(po)} className="btn-secondary py-1 px-2 text-xs">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => handleDelete(po.id)}
                          className="btn-secondary py-1 px-2 text-xs text-red-400">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-bg-card border border-bg-border rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-bg-border">
              <h3 className="font-semibold text-text-primary">
                {editing ? `Edit ${editing.po_number}` : "New Purchase Order"}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-text-muted hover:text-text-primary">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label">Supplier</label>
                  <select className="input" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                    <option value="">— None —</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Date</label>
                  <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
                </div>
                <div>
                  <label className="label">Delivery Date</label>
                  <input className="input" type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
                </div>
                <div>
                  <label className="label">Payment Terms</label>
                  <input className="input" value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} placeholder="e.g. 30 days" />
                </div>
                <div>
                  <label className="label">Delivery Terms</label>
                  <input className="input" value={deliveryTerms} onChange={e => setDeliveryTerms(e.target.value)} placeholder="e.g. FOB Dubai" />
                </div>
                <div>
                  <label className="label">Notes</label>
                  <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any special instructions" />
                </div>
              </div>

              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
                  <input type="checkbox" checked={letterhead} onChange={e => setLetterhead(e.target.checked)} className="accent-brand-indigo" />
                  Letterhead
                </label>
                <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
                  <input type="checkbox" checked={includeStamp} onChange={e => setIncludeStamp(e.target.checked)} className="accent-brand-indigo" />
                  Include Stamp
                </label>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-text-primary">Items</h4>
                  <button onClick={addItem} className="btn-secondary py-1 px-2 text-xs">
                    <Plus size={13} /> Add Item
                  </button>
                </div>
                <div className="space-y-2">
                  {items.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg bg-bg-secondary border border-bg-border">
                      <input
                        className="input col-span-5 py-1.5 text-sm"
                        value={it.description}
                        onChange={e => updateItem(idx, "description", e.target.value)}
                        placeholder="Description"
                      />
                      <input
                        className="input col-span-2 py-1.5 text-sm text-center"
                        type="number" min="0.01" step="0.01"
                        value={it.quantity}
                        onChange={e => updateItem(idx, "quantity", parseFloat(e.target.value) || 0)}
                        placeholder="Qty"
                      />
                      <input
                        className="input col-span-2 py-1.5 text-sm text-right"
                        type="number" min="0" step="0.01"
                        value={it.unit_price}
                        onChange={e => updateItem(idx, "unit_price", parseFloat(e.target.value) || 0)}
                        placeholder="Price"
                      />
                      <label className="col-span-2 flex items-center gap-1 text-xs text-text-secondary cursor-pointer">
                        <input type="checkbox" checked={it.vat_applicable}
                          onChange={e => updateItem(idx, "vat_applicable", e.target.checked)}
                          className="accent-brand-indigo" />
                        VAT
                      </label>
                      <button onClick={() => removeItem(idx)} disabled={items.length === 1}
                        className="col-span-1 text-red-400 hover:text-red-300 disabled:opacity-30">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <div className="space-y-1 text-sm text-right min-w-[200px]">
                  <div className="flex justify-between gap-6 text-text-secondary">
                    <span>Subtotal:</span><span>AED {subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between gap-6 text-text-secondary">
                    <span>VAT (5%):</span><span>AED {vat_amount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between gap-6 font-bold text-text-primary border-t border-bg-border pt-1">
                    <span>Total:</span><span>AED {total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 p-5 border-t border-bg-border">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 justify-center">
                <Save size={15} />
                {saving ? "Saving..." : editing ? "Update PO" : "Create PO"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
