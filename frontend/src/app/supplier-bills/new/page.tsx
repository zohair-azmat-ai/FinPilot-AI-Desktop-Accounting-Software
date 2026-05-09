"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import { getSuppliers, getSupplierBill, createSupplierBill, updateSupplierBill, getCompany } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Trash2, ArrowLeft } from "lucide-react";

interface Supplier { id: number; name: string; trn: string; }
interface ItemRow {
  description: string; quantity: number; unit_price: number;
  vat_applicable: boolean; vat_amount: number; total: number;
}

const emptyItem = (): ItemRow => ({
  description: "", quantity: 1, unit_price: 0,
  vat_applicable: true, vat_amount: 0, total: 0,
});

export default function SupplierBillFormPage() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get("edit") ? Number(params.get("edit")) : null;

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [vatRate, setVatRate] = useState(5.0);
  const [supplierId, setSupplierId] = useState<number | "">("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState("");
  const [trn, setTrn] = useState("");
  const [lpoNo, setLpoNo] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemRow[]>([emptyItem()]);

  const recalcItem = useCallback((item: ItemRow, vr: number): ItemRow => {
    const lineTotal = item.quantity * item.unit_price;
    const vat_amount = item.vat_applicable ? Math.round(lineTotal * (vr / 100) * 100) / 100 : 0;
    return { ...item, vat_amount, total: Math.round((lineTotal + vat_amount) * 100) / 100 };
  }, []);

  useEffect(() => {
    getSuppliers().then((r) => setSuppliers(r.data));
    getCompany().then((r) => setVatRate(r.data.vat_rate || 5.0));
  }, []);

  useEffect(() => {
    if (!editId) return;
    getSupplierBill(editId).then((r) => {
      const b = r.data;
      setSupplierId(b.supplier_id || "");
      setDate(b.date.split("T")[0]);
      setDueDate(b.due_date ? b.due_date.split("T")[0] : "");
      setTrn(b.trn || "");
      setLpoNo(b.lpo_no || "");
      setNotes(b.notes || "");
      setItems(b.items.map((it: ItemRow) => ({
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        vat_applicable: it.vat_applicable,
        vat_amount: it.vat_amount,
        total: it.total,
      })));
    });
  }, [editId]);

  const updateItem = (idx: number, field: keyof ItemRow, value: unknown) => {
    setItems((prev) => {
      const updated = prev.map((it, i) => i === idx ? { ...it, [field]: value } : it);
      return updated.map((it, i) => i === idx ? recalcItem(it, vatRate) : it);
    });
  };

  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const subtotal = items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
  const vatTotal = items.reduce((s, it) => s + it.vat_amount, 0);
  const grandTotal = subtotal + vatTotal;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) { toast.error("Select a supplier."); return; }
    const payload = {
      supplier_id: supplierId,
      date: new Date(date).toISOString(),
      due_date: dueDate ? new Date(dueDate).toISOString() : null,
      trn, lpo_no: lpoNo, notes,
      items: items.map(({ vat_amount, total, ...rest }) => rest),
    };
    try {
      if (editId) {
        await updateSupplierBill(editId, payload);
        toast.success("Bill updated!");
      } else {
        await createSupplierBill(payload);
        toast.success("Bill created!");
      }
      router.push("/supplier-bills");
    } catch {
      toast.error("Failed to save bill.");
    }
  };

  return (
    <div>
      <Header title={editId ? "Edit Supplier Bill" : "New Supplier Bill"} />
      <div className="p-6 max-w-5xl">
        <button onClick={() => router.back()} className="btn-secondary mb-5">
          <ArrowLeft size={14} /> Back
        </button>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Header fields */}
          <div className="card p-5">
            <h3 className="font-semibold mb-4">Bill Details</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1">
                <label className="label">Supplier *</label>
                <select
                  className="input"
                  value={supplierId}
                  onChange={(e) => setSupplierId(Number(e.target.value))}
                  required
                >
                  <option value="">Select supplier...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Bill Date *</label>
                <input
                  className="input" type="date" value={date}
                  onChange={(e) => setDate(e.target.value)} required
                />
              </div>
              <div>
                <label className="label">Due Date</label>
                <input
                  className="input" type="date" value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              <div>
                <label className="label">TRN</label>
                <input className="input" value={trn} onChange={(e) => setTrn(e.target.value)} placeholder="Supplier TRN" />
              </div>
              <div>
                <label className="label">LPO / Reference No</label>
                <input className="input" value={lpoNo} onChange={(e) => setLpoNo(e.target.value)} placeholder="Optional" />
              </div>
              <div>
                <label className="label">Notes</label>
                <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Items</h3>
              <button type="button" className="btn-secondary text-sm" onClick={addItem}>
                <Plus size={13} /> Add Item
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="w-[40%]">Description</th>
                    <th className="w-[10%]">Qty</th>
                    <th className="w-[15%]">Unit Price</th>
                    <th className="w-[10%]">VAT</th>
                    <th className="w-[12%]">VAT Amt</th>
                    <th className="w-[12%]">Total</th>
                    <th className="w-[5%]"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} className="border-b border-bg-border">
                      <td className="p-1">
                        <input
                          className="input text-sm"
                          value={item.description}
                          onChange={(e) => updateItem(idx, "description", e.target.value)}
                          placeholder="Item description"
                          required
                        />
                      </td>
                      <td className="p-1">
                        <input
                          className="input text-sm text-right"
                          type="number" min="0" step="0.01"
                          value={item.quantity}
                          onChange={(e) => updateItem(idx, "quantity", parseFloat(e.target.value) || 0)}
                        />
                      </td>
                      <td className="p-1">
                        <input
                          className="input text-sm text-right"
                          type="number" min="0" step="0.01"
                          value={item.unit_price}
                          onChange={(e) => updateItem(idx, "unit_price", parseFloat(e.target.value) || 0)}
                        />
                      </td>
                      <td className="p-1 text-center">
                        <input
                          type="checkbox"
                          checked={item.vat_applicable}
                          onChange={(e) => updateItem(idx, "vat_applicable", e.target.checked)}
                          className="w-4 h-4"
                        />
                      </td>
                      <td className="p-1 text-right text-text-secondary">{item.vat_amount.toFixed(2)}</td>
                      <td className="p-1 text-right font-semibold">{item.total.toFixed(2)}</td>
                      <td className="p-1 text-center">
                        {items.length > 1 && (
                          <button type="button" onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-300">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="mt-4 flex justify-end">
              <div className="w-64 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-text-secondary">Subtotal:</span><span>AED {subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-text-secondary">VAT ({vatRate}%):</span><span>AED {vatTotal.toFixed(2)}</span></div>
                <div className="flex justify-between font-bold text-base border-t border-bg-border pt-2">
                  <span>Total:</span><span className="text-brand-indigo">AED {grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={() => router.back()} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">{editId ? "Update Bill" : "Create Bill"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
