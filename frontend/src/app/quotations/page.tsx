"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { getQuotations, getQuotation, getCustomers, getItems, createQuotation, updateQuotation, deleteQuotation, convertQuotation, downloadQuotationPDF, openPdfSafe, API_URL, apiErr } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, FileText, Trash2, FileDown, ArrowRight, X, MessageCircle, Edit2 } from "lucide-react";

interface Customer { id: number; name: string; payment_terms: string; }
interface Item { id: number; name: string; price: number; vat_applicable: boolean; }
interface LineItem { item_id: number | null; description: string; quantity: number; unit_price: number; vat_applicable: boolean; [key: string]: unknown; }
interface Quotation {
  id: number; quotation_number: string; customer?: { name: string };
  date: string; total: number; status: string; converted_to_invoice: boolean;
}

const emptyForm = () => ({
  customerId: "",
  date: new Date().toISOString().split("T")[0],
  validUntil: "",
  discount: 0,
  notes: "",
  paymentTerms: "",
  delivery: "",
  includeStamp: false,
  lines: [{ item_id: null, description: "", quantity: 1, unit_price: 0, vat_applicable: true }] as LineItem[],
});

export default function QuotationsPage() {
  const router = useRouter();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [validUntil, setValidUntil] = useState("");
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [delivery, setDelivery] = useState("");
  const [includeStamp, setIncludeStamp] = useState(false);
  const [lines, setLines] = useState<LineItem[]>([{ item_id: null, description: "", quantity: 1, unit_price: 0, vat_applicable: true }]);

  const load = () => getQuotations()
    .then((r) => {
      console.log("[quotations] API returned", r.data?.length, "records");
      setQuotations(Array.isArray(r.data) ? r.data : []);
    })
    .catch((err) => {
      console.error("[quotations] API error", err?.response?.status, err?.response?.data);
      setQuotations([]);
    });
  useEffect(() => {
    load();
    getCustomers().then((r) => setCustomers(r.data));
    getItems().then((r) => setItems(r.data));
  }, []);

  const resetForm = () => {
    const f = emptyForm();
    setEditingId(null);
    setCustomerId(f.customerId);
    setDate(f.date);
    setValidUntil(f.validUntil);
    setDiscount(f.discount);
    setNotes(f.notes);
    setPaymentTerms(f.paymentTerms);
    setDelivery(f.delivery);
    setIncludeStamp(f.includeStamp);
    setLines(f.lines);
  };

  const openNew = () => { resetForm(); setShowModal(true); };

  const openEdit = async (id: number) => {
    try {
      const { data: q } = await getQuotation(id);
      setEditingId(id);
      setCustomerId(String(q.customer_id));
      setDate(q.date.split("T")[0]);
      setValidUntil(q.valid_until ? q.valid_until.split("T")[0] : "");
      setDiscount(q.discount || 0);
      setNotes(q.notes || "");
      setPaymentTerms(q.payment_terms || "");
      setDelivery(q.delivery || "");
      setIncludeStamp(q.include_stamp || false);
      setLines(
        q.items.map((it: { item_id: number | null; description: string; quantity: number; unit_price: number; vat_applicable: boolean }) => ({
          item_id: it.item_id ?? null,
          description: it.description,
          quantity: it.quantity,
          unit_price: it.unit_price,
          vat_applicable: it.vat_applicable,
        }))
      );
      setShowModal(true);
    } catch {
      toast.error("Failed to load quotation.");
    }
  };

  const addLine = () => setLines([...lines, { item_id: null, description: "", quantity: 1, unit_price: 0, vat_applicable: true }]);
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: keyof LineItem, value: unknown) => {
    const updated = [...lines];
    (updated[i] as Record<string, unknown>)[field] = value;
    if (field === "item_id" && value) {
      const item = items.find((it) => it.id === value);
      if (item) { updated[i].description = item.name; updated[i].unit_price = item.price; updated[i].vat_applicable = item.vat_applicable; }
    }
    setLines(updated);
  };

  const calcLine = (l: LineItem) => { const lt = l.quantity * l.unit_price; const vat = l.vat_applicable ? lt * 0.05 : 0; return { lt, vat, total: lt + vat }; };
  const subtotal = lines.reduce((s, l) => s + calcLine(l).lt, 0);
  const totalVat = lines.reduce((s, l) => s + calcLine(l).vat, 0);
  const grandTotal = subtotal + totalVat - discount;

  const handleSave = async () => {
    if (!customerId) return toast.error("Select a customer");
    const payload = {
      customer_id: parseInt(customerId),
      date: new Date(date).toISOString(),
      valid_until: validUntil ? new Date(validUntil).toISOString() : null,
      discount, notes,
      payment_terms: paymentTerms,
      delivery,
      include_stamp: includeStamp,
      items: lines,
    };
    try {
      if (editingId) {
        await updateQuotation(editingId, payload);
        toast.success("Quotation updated!");
      } else {
        await createQuotation(payload);
        toast.success("Quotation created!");
      }
      setShowModal(false);
      load();
    } catch (e) { toast.error(apiErr(e, "Failed to save quotation.")); }
  };

  const handleConvert = async (id: number) => {
    if (!confirm("Convert this quotation to invoice?")) return;
    try { await convertQuotation(id); toast.success("Converted to invoice!"); load(); router.push("/invoices"); }
    catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Failed";
      toast.error(msg);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this quotation?")) return;
    try { await deleteQuotation(id); toast.success("Deleted."); load(); }
    catch { toast.error("Failed."); }
  };

  const statusColors: Record<string, string> = {
    draft: "text-status-draft bg-gray-500/10 border-gray-500/20",
    sent: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    converted: "text-status-paid bg-status-paid/10 border-status-paid/20",
    rejected: "text-status-unpaid bg-status-unpaid/10 border-status-unpaid/20",
  };

  return (
    <div>
      <Header title="Quotations" />
      <div className="p-6 space-y-5">
        <div className="flex justify-end">
          <button className="btn-primary" onClick={openNew}><Plus size={15} /> New Quotation</button>
        </div>

        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="table-head">
              <tr><th>Quotation #</th><th>Customer</th><th>Date</th><th>Total</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {quotations.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-text-muted">
                  <FileText size={32} className="mx-auto mb-2 opacity-30" /><p>No quotations yet.</p>
                </td></tr>
              ) : quotations.map((q) => {
                const sc = statusColors[q.status] || statusColors.draft;
                return (
                  <tr key={q.id} className="table-row">
                    <td className="font-mono text-brand-purple">{q.quotation_number}</td>
                    <td className="font-medium">{q.customer?.name || "—"}</td>
                    <td className="text-text-secondary">{new Date(q.date).toLocaleDateString("en-AE")}</td>
                    <td className="font-medium">AED {q.total.toFixed(2)}</td>
                    <td><span className={`status-badge border ${sc}`}>{q.status}</span></td>
                    <td><div className="flex gap-2">
                      <button onClick={() => openPdfSafe(downloadQuotationPDF(q.id, q.quotation_number), `${API_URL}/api/quotations/${q.id}/pdf`)} className="text-text-muted hover:text-brand-indigo" title="Download PDF"><FileDown size={14} /></button>
                      {!q.converted_to_invoice && (
                        <>
                          <button onClick={() => openEdit(q.id)} className="text-text-muted hover:text-brand-indigo" title="Edit"><Edit2 size={14} /></button>
                          <button onClick={() => handleConvert(q.id)} className="text-text-muted hover:text-emerald-400" title="Convert to Invoice"><ArrowRight size={14} /></button>
                        </>
                      )}
                      <button
                        onClick={() => {
                          const msg = encodeURIComponent(`Dear ${q.customer?.name || "Customer"},\n\nPlease find attached Quotation ${q.quotation_number} for AED ${q.total.toFixed(2)}.\n\nKind regards`);
                          window.open(`https://wa.me/?text=${msg}`, "_blank");
                        }}
                        className="text-text-muted hover:text-green-400"
                        title="Share on WhatsApp"
                      >
                        <MessageCircle size={14} />
                      </button>
                      <button onClick={() => handleDelete(q.id)} className="text-text-muted hover:text-red-400" title="Delete"><Trash2 size={14} /></button>
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-bg-border">
              <h3 className="font-semibold">{editingId ? "Edit Quotation" : "New Quotation"}</h3>
              <button onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="col-span-2">
                  <label className="label">Customer *</label>
                  <select className="input" value={customerId} onChange={(e) => {
                    setCustomerId(e.target.value);
                    const sel = customers.find((c) => c.id === parseInt(e.target.value));
                    if (sel?.payment_terms && !editingId) setPaymentTerms(sel.payment_terms);
                  }}>
                    <option value="">— Select —</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div><label className="label">Date</label>
                  <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
                <div><label className="label">Valid Until</label>
                  <input className="input" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="table-head">
                    <tr><th>Item</th><th>Description</th><th className="w-20">Qty</th><th className="w-28">Price</th><th className="w-12">VAT</th><th className="w-24 text-right">Total</th><th className="w-8"></th></tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => {
                      const { total } = calcLine(l);
                      return (
                        <tr key={i} className="border-b border-bg-border">
                          <td className="px-3 py-2">
                            <select className="input text-xs py-1" value={l.item_id ?? ""} onChange={(e) => updateLine(i, "item_id", e.target.value ? parseInt(e.target.value) : null)}>
                              <option value="">Custom</option>
                              {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2"><input className="input text-xs py-1" value={l.description} onChange={(e) => updateLine(i, "description", e.target.value)} /></td>
                          <td className="px-3 py-2"><input className="input text-xs py-1 text-center" type="number" value={l.quantity} onChange={(e) => updateLine(i, "quantity", parseFloat(e.target.value) || 0)} /></td>
                          <td className="px-3 py-2"><input className="input text-xs py-1 text-right" type="number" value={l.unit_price} onChange={(e) => updateLine(i, "unit_price", parseFloat(e.target.value) || 0)} /></td>
                          <td className="px-3 py-2 text-center"><input type="checkbox" checked={l.vat_applicable} onChange={(e) => updateLine(i, "vat_applicable", e.target.checked)} className="accent-brand-indigo" /></td>
                          <td className="px-3 py-2 text-right font-medium">{total.toFixed(2)}</td>
                          <td className="px-2 py-2">{lines.length > 1 && <button onClick={() => removeLine(i)} className="text-text-muted hover:text-red-400"><Trash2 size={12} /></button>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <button onClick={addLine} className="mt-2 btn-secondary text-xs py-1.5"><Plus size={12} /> Add Line</button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div><label className="label">Payment Terms</label><input className="input" placeholder="e.g. 30 days net" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} /></div>
                <div><label className="label">Delivery</label><input className="input" placeholder="e.g. Ex-works" value={delivery} onChange={(e) => setDelivery(e.target.value)} /></div>
                <div className="flex items-center gap-2 pt-6">
                  <input type="checkbox" id="includeStamp" checked={includeStamp} onChange={(e) => setIncludeStamp(e.target.checked)} className="accent-brand-indigo w-4 h-4" />
                  <label htmlFor="includeStamp" className="text-sm text-text-secondary cursor-pointer">Include Stamp on PDF</label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Notes</label><textarea className="input h-16 resize-none" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
                <div className="space-y-2 pt-4 text-sm">
                  <div className="flex justify-between"><span className="text-text-secondary">Subtotal</span><span>AED {subtotal.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-text-secondary">VAT (5%)</span><span>AED {totalVat.toFixed(2)}</span></div>
                  <div className="flex justify-between items-center">
                    <span className="text-text-secondary">Discount</span>
                    <input className="input w-28 text-right py-1 text-sm" type="number" value={discount} onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="flex justify-between font-bold text-base border-t border-bg-border pt-2">
                    <span>Total</span><span className="text-gradient">AED {grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button onClick={handleSave} className="btn-primary flex-1 justify-center">
                  {editingId ? "Update Quotation" : "Create Quotation"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
