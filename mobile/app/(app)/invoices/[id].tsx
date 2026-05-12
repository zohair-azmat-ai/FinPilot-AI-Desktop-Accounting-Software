import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import {
  getInvoice, getInvoiceItems, getCustomer, getCompany,
  deleteInvoice, fmtCurrency, fmtDate, amountInWords,
} from '@/lib/api';
import { C, STATUS_COLOR, STATUS_BG } from '@/lib/theme';

export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [invoice, setInvoice] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [customer, setCustomer] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const inv = await getInvoice(Number(id));
        if (!inv) return;
        const [its, cust, comp] = await Promise.all([
          getInvoiceItems(inv.id),
          inv.customer_id ? getCustomer(inv.customer_id) : Promise.resolve(null),
          getCompany(),
        ]);
        setInvoice(inv);
        setItems(its ?? []);
        setCustomer(cust);
        setCompany(comp);
      } catch (e: any) {
        Alert.alert('Error', e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const shareAsPDF = async () => {
    setSharing(true);
    try {
      const html = buildInvoiceHTML(invoice, items, customer, company);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Invoice ${invoice.invoice_number}`,
        UTI: 'com.adobe.pdf',
      });
    } catch (e: any) {
      Alert.alert('Share failed', e.message);
    } finally {
      setSharing(false);
    }
  };

  const shareViaWhatsApp = async () => {
    const text =
      `*${company?.name ?? 'FinPilot'} — TAX INVOICE*\n` +
      `Invoice #: ${invoice.invoice_number}\n` +
      `Date: ${fmtDate(invoice.date)}\n` +
      `Customer: ${customer?.name ?? '—'}\n` +
      `Total: ${fmtCurrency(invoice.total)}\n` +
      `Balance Due: ${fmtCurrency(invoice.balance_due)}\n` +
      `Status: ${invoice.status?.toUpperCase()}`;
    Share.share({ message: text });
  };

  if (loading) return (
    <SafeAreaView style={[s.safe, { alignItems: 'center', justifyContent: 'center' }]}>
      <ActivityIndicator size="large" color={C.brand} />
    </SafeAreaView>
  );
  if (!invoice) return (
    <SafeAreaView style={s.safe}>
      <Text style={s.err}>Invoice not found.</Text>
    </SafeAreaView>
  );

  const statusColor = STATUS_COLOR[invoice.status] ?? C.text;
  const statusBg = STATUS_BG[invoice.status] ?? C.brandBg;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={s.navTitle}>{invoice.invoice_number}</Text>
        <View style={[s.badge, { backgroundColor: statusBg }]}>
          <Text style={[s.badgeText, { color: statusColor }]}>{invoice.status}</Text>
        </View>
        <TouchableOpacity
          style={{ padding: 4 }}
          onPress={() => router.push(`/(app)/invoices/create?id=${invoice.id}`)}
        >
          <Ionicons name="create-outline" size={22} color={C.brand} />
        </TouchableOpacity>
        <TouchableOpacity
          style={{ padding: 4 }}
          onPress={() => Alert.alert(
            'Delete Invoice',
            `Delete ${invoice.invoice_number}? This cannot be undone.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete', style: 'destructive',
                onPress: async () => {
                  try { await deleteInvoice(invoice.id); router.back(); }
                  catch (e: any) { Alert.alert('Error', e.message); }
                },
              },
            ],
          )}
        >
          <Ionicons name="trash-outline" size={22} color={C.err} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.actionRow}>
          <TouchableOpacity style={s.actionBtn} onPress={shareAsPDF} disabled={sharing}>
            <Ionicons name="document-text-outline" size={18} color={C.brand} />
            <Text style={s.actionText}>{sharing ? 'Generating…' : 'Share PDF'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, { borderColor: '#25D366' }]} onPress={shareViaWhatsApp}>
            <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
            <Text style={[s.actionText, { color: '#25D366' }]}>WhatsApp</Text>
          </TouchableOpacity>
        </View>

        <View style={s.card}>
          <Row label="Customer" value={customer?.name ?? '—'} />
          {customer?.phone ? <Row label="Phone" value={customer.phone} /> : null}
          {customer?.trn ? <Row label="TRN" value={customer.trn} /> : null}
          <Row label="Invoice Date" value={fmtDate(invoice.date)} />
          {invoice.due_date ? <Row label="Due Date" value={fmtDate(invoice.due_date)} /> : null}
          {invoice.lpo_no ? <Row label="LPO No." value={invoice.lpo_no} /> : null}
          {invoice.do_no ? <Row label="DO No." value={invoice.do_no} /> : null}
          {invoice.is_cash ? <Row label="Type" value="Cash Invoice" /> : null}
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>Items</Text>
          {items.map((item, idx) => (
            <View key={idx} style={s.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.itemDesc}>{item.description}</Text>
                <Text style={s.itemSub}>
                  {item.quantity} × {fmtCurrency(item.unit_price)}
                  {item.vat_applicable ? '  +5% VAT' : ''}
                </Text>
              </View>
              <Text style={s.itemTotal}>{fmtCurrency(item.total)}</Text>
            </View>
          ))}

          <View style={s.divider} />
          <TotalRow label="Subtotal" value={fmtCurrency(invoice.subtotal)} />
          {(invoice.vat_amount ?? 0) > 0 && <TotalRow label="VAT (5%)" value={fmtCurrency(invoice.vat_amount)} />}
          {(invoice.discount ?? 0) > 0 && <TotalRow label="Discount" value={`− ${fmtCurrency(invoice.discount)}`} />}
          <TotalRow label="Total" value={fmtCurrency(invoice.total)} bold />
          {(invoice.amount_paid ?? 0) > 0 && (
            <>
              <TotalRow label="Amount Paid" value={fmtCurrency(invoice.amount_paid)} color={C.success} />
              <TotalRow label="Balance Due" value={fmtCurrency(invoice.balance_due)} color={C.err} bold />
            </>
          )}
        </View>

        {invoice.notes ? (
          <View style={s.card}>
            <Text style={s.sectionTitle}>Notes</Text>
            <Text style={s.notes}>{invoice.notes}</Text>
          </View>
        ) : null}

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

function TotalRow({ label, value, bold, color }: any) {
  return (
    <View style={s.totalRow}>
      <Text style={[s.totalLabel, bold && { fontWeight: '700', color: C.text }]}>{label}</Text>
      <Text style={[s.totalValue, bold && { fontWeight: '700', fontSize: 16, color: C.text }, color && { color }]}>
        {value}
      </Text>
    </View>
  );
}

// ── Desktop-matching TAX INVOICE HTML PDF ────────────────────────────────────
function buildInvoiceHTML(inv: any, items: any[], cust: any, comp: any): string {
  const PRIMARY = '#1E3A5F';
  const ACCENT = '#2563EB';
  const LIGHT = '#F8FAFC';
  const MED = '#94A3B8';
  const DARK = '#0F172A';

  const fmtC = (n: number | null) => `AED ${(n ?? 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  const fmtD = (s: string | null) => s
    ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

  const rows = items.map((it, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : LIGHT}">
      <td style="padding:7px 8px;font-size:11px;color:${DARK};text-align:center">${i + 1}</td>
      <td style="padding:7px 8px;font-size:11px;color:${DARK}">${it.description ?? ''}</td>
      <td style="padding:7px 8px;font-size:11px;color:${DARK};text-align:right">${(it.quantity ?? 0).toFixed(2)}</td>
      <td style="padding:7px 8px;font-size:11px;color:${DARK};text-align:right">${fmtC(it.unit_price)}</td>
      <td style="padding:7px 8px;font-size:11px;color:${DARK};text-align:right">${it.vat_applicable ? fmtC(it.vat_amount ?? 0) : 'Exempt'}</td>
      <td style="padding:7px 8px;font-size:11px;color:${DARK};text-align:right;font-weight:600">${fmtC(it.total)}</td>
    </tr>`).join('');

  const companyBlock = comp ? `
    <div style="font-size:17px;font-weight:700;color:${PRIMARY}">${comp.name ?? ''}</div>
    ${comp.trn ? `<div style="font-size:9px;color:${MED};margin-top:2px">TRN: ${comp.trn}</div>` : ''}
    ${comp.phone ? `<div style="font-size:9px;color:#475569;margin-top:1px">Tel: ${comp.phone}</div>` : ''}
    ${comp.address ? `<div style="font-size:9px;color:#475569">${comp.address.replace(/\n/g, ', ')}</div>` : ''}
  ` : '';

  const customerBlock = cust ? `
    <div style="font-size:7px;font-weight:700;color:${MED};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">BILL TO</div>
    <div style="font-size:11px;font-weight:700;color:${DARK}">${cust.name ?? ''}</div>
    ${cust.attn ? `<div style="font-size:9px;color:#475569">Attn: ${cust.attn}</div>` : ''}
    ${cust.trn ? `<div style="font-size:9px;color:#475569">TRN: ${cust.trn}</div>` : ''}
    ${cust.phone ? `<div style="font-size:9px;color:#475569">Tel: ${cust.phone}</div>` : ''}
    ${cust.address ? `<div style="font-size:9px;color:#475569">${cust.address.replace(/\n/g, ', ')}</div>` : ''}
    ${cust.po_box ? `<div style="font-size:9px;color:#475569">PO Box: ${cust.po_box}</div>` : ''}
  ` : '<div style="font-size:11px;color:#94a3b8">—</div>';

  const refBlock = [
    inv.lpo_no ? `<b>LPO No.:</b> ${inv.lpo_no}` : '',
    inv.do_no ? `<b>DO No.:</b> ${inv.do_no}` : '',
  ].filter(Boolean).join('&nbsp;&nbsp;&nbsp;');

  const stampBlock = inv.include_stamp ? `
    <div style="margin-top:30px;display:flex;align-items:flex-end;gap:40px">
      <div style="flex:1">
        <div style="font-size:9px;color:${MED};margin-bottom:4px;font-weight:600">COMPANY STAMP</div>
        <div style="border:1px solid #e2e8f0;border-radius:4px;height:60px;width:120px"></div>
      </div>
      ${inv.require_customer_signature ? `
      <div style="flex:1">
        <div style="font-size:9px;color:${MED};margin-bottom:4px;font-weight:600">CUSTOMER SIGNATURE</div>
        <div style="border-bottom:2px solid ${DARK};width:150px"></div>
      </div>` : ''}
    </div>
  ` : (inv.require_customer_signature ? `
    <div style="margin-top:30px">
      <div style="font-size:9px;color:${MED};margin-bottom:4px;font-weight:600">CUSTOMER SIGNATURE</div>
      <div style="border-bottom:2px solid ${DARK};width:200px"></div>
    </div>
  ` : '');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${DARK};padding:20px;background:#fff}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;padding-bottom:14px;border-bottom:2px solid ${ACCENT}}
    .doc-title{font-size:22px;font-weight:700;color:${ACCENT};text-align:right}
    .doc-num{font-size:10px;color:${DARK};text-align:right;margin-top:3px}
    .info-grid{display:flex;justify-content:space-between;margin-bottom:14px;gap:20px}
    .info-box{flex:1}
    table{width:100%;border-collapse:collapse;margin:14px 0}
    thead tr{background:${PRIMARY}}
    th{padding:8px;font-size:10px;color:#fff;text-align:left;font-weight:600}
    th:not(:first-child){text-align:right}
    tbody tr:last-child td{border-bottom:none}
    td{border-bottom:1px solid #e2e8f0}
    .totals{display:flex;justify-content:flex-end;margin-top:6px}
    .totals-inner{min-width:220px}
    .t-row{display:flex;justify-content:space-between;padding:4px 0;font-size:11px}
    .t-grand{border-top:2px solid ${ACCENT};margin-top:4px;padding-top:6px;font-weight:700;font-size:14px;color:${DARK}}
    .words{background:${LIGHT};border-left:3px solid ${ACCENT};padding:8px 12px;font-size:10px;font-style:italic;color:${PRIMARY};margin:14px 0;clear:both}
    .ref-row{font-size:10px;color:#475569;margin-bottom:14px}
    .notes{font-size:10px;color:#475569;margin-top:14px;padding-top:10px;border-top:1px dashed #e2e8f0}
  </style></head><body>
  <div class="header">
    <div>${companyBlock}</div>
    <div>
      <div class="doc-title">TAX INVOICE</div>
      <div class="doc-num"><b>No:</b> ${inv.invoice_number}</div>
      <div class="doc-num"><b>Date:</b> ${fmtD(inv.date)}</div>
      ${inv.due_date ? `<div class="doc-num"><b>Due:</b> ${fmtD(inv.due_date)}</div>` : ''}
      ${inv.is_cash ? `<div class="doc-num" style="color:${ACCENT};font-weight:700">CASH INVOICE</div>` : ''}
    </div>
  </div>

  <div class="info-grid">
    <div class="info-box">${customerBlock}</div>
    ${refBlock ? `<div class="info-box" style="text-align:right;font-size:10px;color:#475569">${refBlock}</div>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:30px;text-align:center">#</th>
        <th>Description</th>
        <th style="width:60px">Qty</th>
        <th style="width:90px">Unit Price</th>
        <th style="width:80px">VAT</th>
        <th style="width:90px">Amount</th>
      </tr>
    </thead>
    <tbody>${rows || `<tr><td colspan="6" style="text-align:center;padding:16px;color:${MED}">No items</td></tr>`}</tbody>
  </table>

  <div class="totals">
    <div class="totals-inner">
      <div class="t-row"><span style="color:${MED}">Subtotal</span><span>${fmtC(inv.subtotal)}</span></div>
      ${(inv.vat_amount ?? 0) > 0 ? `<div class="t-row"><span style="color:${MED}">VAT (5%)</span><span>${fmtC(inv.vat_amount)}</span></div>` : ''}
      ${(inv.discount ?? 0) > 0 ? `<div class="t-row"><span style="color:${MED}">Discount</span><span>− ${fmtC(inv.discount)}</span></div>` : ''}
      <div class="t-row t-grand"><span>TOTAL</span><span>${fmtC(inv.total)}</span></div>
      ${(inv.amount_paid ?? 0) > 0 ? `
        <div class="t-row" style="color:#059669"><span>Amount Paid</span><span>${fmtC(inv.amount_paid)}</span></div>
        <div class="t-row" style="color:#DC2626;font-weight:700"><span>Balance Due</span><span>${fmtC(inv.balance_due)}</span></div>` : ''}
    </div>
  </div>

  <div class="words">${amountInWords(inv.total)}</div>

  ${inv.notes ? `<div class="notes"><b>Notes / Terms:</b> ${inv.notes}</div>` : ''}
  ${stampBlock}
  </body></html>`;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  navbar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
    paddingVertical: 12, gap: 10,
  },
  backBtn: { padding: 4 },
  navTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: C.text },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  actionRow: { flexDirection: 'row', gap: 12, marginHorizontal: 16, marginBottom: 12 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, borderRadius: 12,
    backgroundColor: C.card, borderWidth: 1.5, borderColor: C.brand,
  },
  actionText: { fontSize: 14, fontWeight: '600', color: C.brand },
  card: {
    backgroundColor: C.card, marginHorizontal: 16, marginBottom: 12,
    borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16,
  },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: C.sub, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  rowLabel: { fontSize: 13, color: C.sub },
  rowValue: { fontSize: 13, color: C.text, fontWeight: '500', flex: 1, textAlign: 'right' },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  itemDesc: { fontSize: 13, color: C.text, fontWeight: '500' },
  itemSub: { fontSize: 11, color: C.muted, marginTop: 2 },
  itemTotal: { fontSize: 13, fontWeight: '600', color: C.text },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  totalLabel: { fontSize: 13, color: C.sub },
  totalValue: { fontSize: 13, color: C.text },
  notes: { fontSize: 13, color: C.sub, lineHeight: 20 },
  err: { color: C.err, textAlign: 'center', marginTop: 40, fontSize: 15 },
});
