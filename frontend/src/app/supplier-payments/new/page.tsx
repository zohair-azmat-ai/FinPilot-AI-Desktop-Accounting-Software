"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { getSuppliers, createSupplierPayment } from "@/lib/api";
import toast from "react-hot-toast";
import { ArrowLeft } from "lucide-react";

interface Supplier { id: number; name: string; current_balance: number; }

const METHODS = ["cash", "bank_transfer", "cheque", "online"];

export default function SupplierPaymentFormPage() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState<number | "">("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    getSuppliers().then((r) => setSuppliers(r.data));
  }, []);

  const selectedSupplier = suppliers.find((s) => s.id === supplierId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) { toast.error("Select a supplier."); return; }
    const amtNum = parseFloat(amount);
    if (!amtNum || amtNum <= 0) { toast.error("Enter a valid amount."); return; }
    try {
      await createSupplierPayment({
        supplier_id: supplierId,
        date: new Date(date).toISOString(),
        amount: amtNum,
        method,
        reference,
        notes,
      });
      toast.success("Payment recorded!");
      router.push("/supplier-payments");
    } catch {
      toast.error("Failed to save payment.");
    }
  };

  return (
    <div>
      <Header title="New Supplier Payment" />
      <div className="p-6 max-w-xl">
        <button onClick={() => router.back()} className="btn-secondary mb-5">
          <ArrowLeft size={14} /> Back
        </button>

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <h3 className="font-semibold text-lg mb-2">Payment Details</h3>

          <div>
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
            {selectedSupplier && (
              <p className="text-xs text-text-muted mt-1">
                Current balance: <span className="text-amber-400 font-semibold">AED {selectedSupplier.current_balance.toFixed(2)}</span>
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Payment Date *</label>
              <input
                className="input" type="date" value={date}
                onChange={(e) => setDate(e.target.value)} required
              />
            </div>
            <div>
              <label className="label">Amount (AED) *</label>
              <input
                className="input text-right" type="number" min="0.01" step="0.01"
                value={amount} onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00" required
              />
            </div>
            <div>
              <label className="label">Payment Method</label>
              <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                {METHODS.map((m) => (
                  <option key={m} value={m}>{m.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Reference No</label>
              <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
            </div>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea
              className="input h-20 resize-none" value={notes}
              onChange={(e) => setNotes(e.target.value)} placeholder="Optional"
            />
          </div>

          {selectedSupplier && amount && (
            <div className="bg-bg-border rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-text-muted">Current Balance:</span>
                <span>AED {selectedSupplier.current_balance.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">This Payment:</span>
                <span className="text-green-400">− AED {(parseFloat(amount) || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t border-bg-border pt-1">
                <span>Remaining Balance:</span>
                <span className="text-amber-400">
                  AED {(selectedSupplier.current_balance - (parseFloat(amount) || 0)).toFixed(2)}
                </span>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => router.back()} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center">Record Payment</button>
          </div>
        </form>
      </div>
    </div>
  );
}
