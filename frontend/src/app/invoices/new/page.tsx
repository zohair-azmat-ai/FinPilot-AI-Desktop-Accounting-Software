"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import { getCustomers, getItems, createInvoice, getInvoice, updateInvoice, getCompany, saveCompany } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Trash2, ArrowLeft, Save } from "lucide-react";

interface Customer { id: number; name: string; trn: string; attn: string; phone: string; address: string; po_box: string; }
interface Item { id: number; name: string; description: string; unit: string; price: number; vat_applicable: boolean; }
interface LineItem {
  item_id: number | null; description: string;
  quantity: number; unit_price: number; vat_applicable: boolean;
  [key: string]: unknown;
}

function InvoiceEditorContent() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get("id");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [customerId, setCustomerId] = useState(params.get("customer_id") || "");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState("");
  const [lpoNo, setLpoNo] = useState("");
  const [doNo, setDoNo] = useState("");
  const [letterhead, setLetterhead] = useState(true);
  const [isCash, setIsCash] = useState(false);
  const [includeStamp, setIncludeStamp] = useState(false);
  const [requireCustomerSignature, setRequireCustomerSignature] = useState(false);
  const [lines, setLines] = useState<LineItem[]>([
    { item_id: null, description: "", quantity: 1, unit_price: parseFloat(params.get("amount") || "0"), vat_applicable: true }
  ]);
  const [saving, setSaving] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [company, setCompany] = useState<any>(null);
  const [showSeriesModal, setShowSeriesModal] = useState(false);
  const [seriesPrefix, setSeriesPrefix] = useState("");
  const [seriesStart, setSeriesStart] = useState(1);
  const [seriesConfiguring, setSeriesConfiguring] = useState(false);
  const VAT_RATE = 5;

  useEffect(() => {
    getCustomers().then((r) => setCustomers(r.data));
    getItems().then((r) => setItems(r.data));
    getCompany().then((r) => {
      setCompany(r.data);
      if (!editId && (r.data.invoice_current_number || 0) === 0) {
        setShowSeriesModal(true);
      }
    }).catch(() => {});
    if (editId) {
      getInvoice(parseInt(editId)).then((r) => {
        const inv = r.data;
        setCustomerId(inv.customer_id ? String(inv.customer_id) : "");
        setDate(inv.date?.split("T")[0] || "");
        setDiscount(inv.discount);
        setNotes(inv.notes);
        setLpoNo(inv.lpo_no || "");
        setDoNo(inv.do_no || "");
        setLetterhead(inv.letterhead);
        setIsCash(inv.is_cash || false);
        setIncludeStamp(inv.include_stamp || false);
        setRequireCustomerSignature(inv.require_customer_signature || false);
        setLines(inv.items.map((it: { item_id: number | null; description: string; quantity: number; unit_price: number; vat_applicable: boolean }) => ({
          item_id: it.item_id,
          description: it.description,
          quantity: it.quantity,
          unit_price: it.unit_price,
          vat_applicable: it.vat_applicable
        })));
      });
    }
  }, [editId]);

  const addLine = () => setLines([...lines, { item_id: null, description: "", quantity: 1, unit_price: 0, vat_applicable: true }]);
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));

  const updateLine = (i: number, field: keyof LineItem, value: unknown) => {
    const updated = [...lines];
    (updated[i] as Record<string, unknown>)[field] = value;
    if (field === "item_id" && value) {
      const item = items.find((it) => it.id === value);
      if (item) {
        updated[i].description = item.name + (item.description ? ` — ${item.description}` : "");
        updated[i].unit_price = item.price;
        updated[i].vat_applicable = item.vat_applicable;
      }
    }
    setLines(updated);
  };

  const calcLine = (line: LineItem) => {
    const lineTotal = line.quantity * line.unit_price;
    const vat = line.vat_applicable ? lineTotal * (VAT_RATE / 100) : 0;
    return { lineTotal, vat, total: lineTotal + vat };
  };

  const subtotal = lines.reduce((s, l) => s + calcLine(l).lineTotal, 0);
  const totalVat = lines.reduce((s, l) => s + calcLine(l).vat, 0);
  const grandTotal = subtotal + totalVat - discount;

  const handleSave = async () => {
    if (!isCash && !customerId) return toast.error("Please select a customer");
    if (lines.some((l) => !l.description.trim())) return toast.error("All line items need a description");
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        ...(isCash ? {} : { customer_id: parseInt(customerId) }),
        date: date ? new Date(date).toISOString() : undefined,
        discount,
        notes,
        lpo_no: lpoNo,
        do_no: doNo,
        letterhead,
        is_cash: isCash,
        include_stamp: includeStamp,
        require_customer_signature: requireCustomerSignature,
        items: lines
      };
      editId ? await updateInvoice(parseInt(editId), payload) : await createInvoice(payload);
      toast.success(editId ? "Invoice updated!" : "Invoice created!");
      router.push("/invoices");
    } catch {
      toast.error("Failed to save invoice.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Header title={editId ? "Edit Invoice" : "New Invoice"} />

      {/* Invoice Series Setup Modal */}
      {showSeriesModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="card w-full max-w-sm mx-4 space-y-4 shadow-2xl">
            <div>
              <h3 className="font-semibold text-text-primary text-base">Set Up Invoice Series</h3>
              <p className="text-xs text-text-secondary mt-1">Configure invoice numbering before creating your first invoice.</p>
            </div>
            <div>
              <label className="label">Invoice Prefix (optional)</label>
              <input
                className="input"
                value={seriesPrefix}
                onChange={(e) => setSeriesPrefix(e.target.value)}
                placeholder="e.g. INV-"
              />
            </div>
            <div>
              <label className="label">Starting Invoice Number</label>
              <input
                className="input"
                type="number"
                min="1"
                step="1"
                value={seriesStart}
                onChange={(e) => setSeriesStart(parseInt(e.target.value) || 1)}
                placeholder="e.g. 1"
              />
            </div>
            <div className="rounded-lg bg-brand-indigo/5 border border-brand-indigo/20 px-4 py-3">
              <p className="text-xs text-text-muted">First invoice will be:</p>
              <p className="text-base font-bold text-brand-indigo mt-0.5">
                {seriesPrefix}{String(seriesStart).padStart(4, "0")}
              </p>
            </div>
            <div className="flex gap-3 pt-1">
              <button
                className="btn-secondary flex-1 justify-center"
                onClick={() => setShowSeriesModal(false)}
              >
                Skip for Now
              </button>
              <button
                className="btn-primary flex-1 justify-center"
                disabled={seriesConfiguring || seriesStart < 1}
                onClick={async () => {
                  if (!company) return;
                  setSeriesConfiguring(true);
                  try {
                    await saveCompany({ ...company, invoice_prefix: seriesPrefix, invoice_current_number: seriesStart });
                    toast.success("Invoice series configured!");
                    setShowSeriesModal(false);
                  } catch {
                    toast.error("Failed to save series.");
                  } finally {
                    setSeriesConfiguring(false);
                  }
                }}
              >
                {seriesConfiguring ? "Saving..." : "Start Series"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="p-6 space-y-5">
        {/* Header row */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="btn-secondary py-1.5 px-3">
            <ArrowLeft size={15} />
          </button>
          <h3 className="text-lg font-semibold">{editId ? "Edit Invoice" : "Create Invoice"}</h3>
          <div className="ml-auto flex gap-3">
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              <Save size={15} /> {saving ? "Saving..." : "Save Invoice"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Main Editor */}
          <div className="lg:col-span-2 space-y-5">
            {/* Customer & Dates */}
            <div className="card space-y-4">
              <h4 className="font-medium text-text-primary text-sm border-b border-bg-border pb-3">Invoice Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {isCash ? (
                  <div className="md:col-span-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-3">
                    <p className="text-sm font-semibold text-amber-400">Cash Sale</p>
                    <p className="text-xs text-text-muted mt-0.5">No customer assigned — invoice will show "CASH SALE"</p>
                  </div>
                ) : (
                  <div className="md:col-span-2">
                    <label className="label">Customer *</label>
                    <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                      <option value="">— Select Customer —</option>
                      {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="label">Invoice Date</label>
                  <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div>
                  <label className="label">LPO No</label>
                  <input className="input" placeholder="Local Purchase Order #" value={lpoNo} onChange={(e) => setLpoNo(e.target.value)} />
                </div>
                <div>
                  <label className="label">DO No</label>
                  <input className="input" placeholder="Delivery Order #" value={doNo} onChange={(e) => setDoNo(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Line Items */}
            <div className="card p-0 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-bg-border">
                <h4 className="font-medium text-sm text-text-primary">Line Items</h4>
                <button onClick={addLine} className="btn-secondary py-1.5 text-xs">
                  <Plus size={12} /> Add Line
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="table-head">
                    <tr>
                      <th className="w-40">Item</th>
                      <th>Description</th>
                      <th className="w-20">Qty</th>
                      <th className="w-28">Unit Price</th>
                      <th className="w-16">VAT</th>
                      <th className="w-28 text-right">Amount</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, i) => {
                      const { lineTotal, vat, total } = calcLine(line);
                      return (
                        <tr key={i} className="border-b border-bg-border">
                          <td className="px-3 py-2">
                            <select
                              className="input text-xs py-1.5"
                              value={line.item_id ?? ""}
                              onChange={(e) => updateLine(i, "item_id", e.target.value ? parseInt(e.target.value) : null)}
                            >
                              <option value="">Custom</option>
                              {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              className="input text-xs py-1.5"
                              value={line.description}
                              onChange={(e) => updateLine(i, "description", e.target.value)}
                              placeholder="Description..."
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              className="input text-xs py-1.5 text-center"
                              type="number" min="0" step="0.01"
                              value={line.quantity}
                              onChange={(e) => updateLine(i, "quantity", parseFloat(e.target.value) || 0)}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              className="input text-xs py-1.5 text-right"
                              type="number" min="0" step="0.01"
                              value={line.unit_price}
                              onChange={(e) => updateLine(i, "unit_price", parseFloat(e.target.value) || 0)}
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={line.vat_applicable}
                              onChange={(e) => updateLine(i, "vat_applicable", e.target.checked)}
                              className="w-4 h-4 accent-brand-indigo"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="text-sm font-medium text-text-primary">{total.toFixed(2)}</div>
                            {line.vat_applicable && <div className="text-xs text-text-muted">+{vat.toFixed(2)} VAT</div>}
                          </td>
                          <td className="px-2 py-2">
                            {lines.length > 1 && (
                              <button onClick={() => removeLine(i)} className="text-text-muted hover:text-red-400">
                                <Trash2 size={13} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Notes */}
            <div className="card">
              <label className="label">Notes / Terms</label>
              <textarea
                className="input h-20 resize-none"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Payment terms, notes..."
              />
            </div>
          </div>

          {/* Summary Sidebar */}
          <div className="space-y-5">
            <div className="card space-y-4">
              <h4 className="font-medium text-sm text-text-primary border-b border-bg-border pb-3">Invoice Summary</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">Subtotal</span>
                  <span className="font-medium">AED {subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">VAT (5%)</span>
                  <span className="font-medium">AED {totalVat.toFixed(2)}</span>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-text-secondary">Discount</span>
                    <span className="font-medium text-amber-400">- AED {discount.toFixed(2)}</span>
                  </div>
                  <input
                    className="input text-sm py-1.5"
                    type="number" min="0" step="0.01"
                    value={discount}
                    onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                  />
                </div>
                <div className="pt-2 border-t border-bg-border">
                  <div className="flex justify-between">
                    <span className="font-semibold text-text-primary">Total Due</span>
                    <span className="font-bold text-xl text-gradient">AED {grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* PDF Settings */}
            <div className="card space-y-3">
              <h4 className="font-medium text-sm text-text-primary border-b border-bg-border pb-3">PDF Settings</h4>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={letterhead}
                  onChange={(e) => setLetterhead(e.target.checked)}
                  className="w-4 h-4 accent-brand-indigo"
                />
                <div>
                  <p className="text-sm text-text-primary">Print Letterhead</p>
                  <p className="text-xs text-text-muted">Include company header on PDF</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isCash}
                  onChange={(e) => {
                    setIsCash(e.target.checked);
                    if (e.target.checked) setCustomerId("");
                  }}
                  className="w-4 h-4 accent-brand-indigo"
                />
                <div>
                  <p className="text-sm text-text-primary">Cash Invoice</p>
                  <p className="text-xs text-text-muted">Hide customer, show "CASH SALE"</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeStamp}
                  onChange={(e) => setIncludeStamp(e.target.checked)}
                  className="w-4 h-4 accent-brand-indigo"
                />
                <div>
                  <p className="text-sm text-text-primary">Include Stamp</p>
                  <p className="text-xs text-text-muted">Print company stamp on PDF</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requireCustomerSignature}
                  onChange={(e) => setRequireCustomerSignature(e.target.checked)}
                  className="w-4 h-4 accent-brand-indigo"
                />
                <div>
                  <p className="text-sm text-text-primary">Customer Signature</p>
                  <p className="text-xs text-text-muted">Add customer signature line</p>
                </div>
              </label>
            </div>

            {!isCash && customerId && (
              <div className="card bg-bg-secondary/50">
                {(() => {
                  const c = customers.find((x) => x.id === parseInt(customerId));
                  return c ? (
                    <div className="space-y-1">
                      <p className="text-xs text-text-muted uppercase tracking-wide font-medium">Bill To</p>
                      <p className="font-semibold text-text-primary">{c.name}</p>
                      {c.trn && <p className="text-xs text-text-secondary">TRN: {c.trn}</p>}
                      {c.phone && <p className="text-xs text-text-secondary">{c.phone}</p>}
                      {c.po_box && <p className="text-xs text-text-secondary">P.O Box: {c.po_box}</p>}
                      {c.address && <p className="text-xs text-text-secondary">{c.address}</p>}
                    </div>
                  ) : null;
                })()}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NewInvoicePage() {
  return (
    <Suspense>
      <InvoiceEditorContent />
    </Suspense>
  );
}
