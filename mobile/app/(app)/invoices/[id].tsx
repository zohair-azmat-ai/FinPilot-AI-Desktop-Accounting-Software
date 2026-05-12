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
import { getInvoice, getInvoiceItems, getCustomer, getCompany, deleteInvoice, fmtCurrency, fmtDate } from '@/lib/api';
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
      `*${company?.name ?? 'FinPilot'} — Invoice*\n` +
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
      {/* Back bar */}
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
            `Delete invoice ${invoice.invoice_number}? This cannot be undone.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete', style: 'destructive',
                onPress: async () => {
                  try {
                    await deleteInvoice(invoice.id);
                    router.back();
                  } catch (e: any) {
                    Alert.alert('Error', e.message);
                  }
                },
              },
            ],
          )}
        >
          <Ionicons name="trash-outline" size={22} color={C.err} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Share buttons */}
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

        {/* Customer & dates */}
        <View style={s.card}>
          <Row label="Customer" value={customer?.name ?? '—'} />
          {customer?.phone && <Row label="Phone" value={customer.phone} />}
          {customer?.trn && <Row label="TRN" value={customer.trn} />}
          <Row label="Invoice Date" value={fmtDate(invoice.date)} />
          {invoice.due_date && <Row label="Due Date" value={fmtDate(invoice.due_date)} />}
          {invoice.lpo_no && <Row label="LPO No." value={invoice.lpo_no} />}
        </View>

        {/* Line items */}
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

          {/* Totals */}
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

function buildInvoiceHTML(inv: any, items: any[], cust: any, comp: any): string {
  const fmtC = (n: number | null) => `AED ${(n ?? 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  const fmtD = (s: string | null) => s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

  const rows = items.map(i => `
    <tr>
      <td>${i.description ?? ''}</td>
      <td style="text-align:right">${i.quantity ?? 0}</td>
      <td style="text-align:right">${fmtC(i.unit_price)}</td>
      <td style="text-align:right">${i.vat_applicable ? '5%' : '0%'}</td>
      <td style="text-align:right">${fmtC(i.total)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body{font-family:Arial,sans-serif;font-size:12px;color:#1e293b;margin:0;padding:24px}
    .hdr{display:flex;justify-content:space-between;margin-bottom:24px}
    .co{font-size:22px;font-weight:700;color:#6366f1}.inv{font-size:18px;font-weight:700;text-align:right}
    .lbl{font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:2px}
    .val{font-size:13px;font-weight:500}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:16px 0}
    table{width:100%;border-collapse:collapse;margin:16px 0}
    th{background:#6366f1;color:#fff;padding:8px;font-size:11px;text-align:left}
    td{padding:8px;border-bottom:1px solid #e2e8f0;font-size:12px}
    .tot{float:right;width:220px;margin-top:8px}
    .tr{display:flex;justify-content:space-between;padding:4px 0;font-size:12px}
    .grand{border-top:2px solid #6366f1;margin-top:4px;padding-top:8px;font-weight:700;font-size:15px}
    .sbadge{display:inline-block;padding:3px 10px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase}
    .unpaid{background:#fee2e2;color:#991b1b}.paid{background:#d1fae5;color:#065f46}.partial{background:#fef3c7;color:#92400e}
  </style></head><body>
  <div class="hdr">
    <div><div class="co">${comp?.name ?? 'FinPilot'}</div>
      ${comp?.trn ? `<div class="lbl" style="margin-top:4px">TRN: ${comp.trn}</div>` : ''}
      ${comp?.phone ? `<div style="color:#475569;margin-top:2px">${comp.phone}</div>` : ''}
      ${comp?.address ? `<div style="color:#475569">${comp.address}</div>` : ''}
    </div>
    <div style="text-align:right">
      <div class="inv">INVOICE</div>
      <div style="font-size:16px;color:#6366f1;margin:4px 0">#${inv.invoice_number}</div>
      <span class="sbadge ${inv.status ?? ''}">${(inv.status ?? '').toUpperCase()}</span>
    </div>
  </div>
  <div class="grid">
    <div><div class="lbl">Bill To</div>
      <div class="val">${cust?.name ?? '—'}</div>
      ${cust?.address ? `<div style="color:#475569">${cust.address}</div>` : ''}
      ${cust?.trn ? `<div style="color:#475569">TRN: ${cust.trn}</div>` : ''}
      ${cust?.phone ? `<div style="color:#475569">${cust.phone}</div>` : ''}
    </div>
    <div style="text-align:right">
      <div class="lbl">Invoice Date</div><div class="val">${fmtD(inv.date)}</div>
      ${inv.due_date ? `<div class="lbl" style="margin-top:8px">Due Date</div><div class="val">${fmtD(inv.due_date)}</div>` : ''}
    </div>
  </div>
  <table><thead><tr><th>Description</th><th style="text-align:right">Qty</th>
    <th style="text-align:right">Unit Price</th><th style="text-align:right">VAT</th>
    <th style="text-align:right">Total</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#94a3b8">No items</td></tr>'}</tbody></table>
  <div class="tot">
    <div class="tr"><span>Subtotal</span><span>${fmtC(inv.subtotal)}</span></div>
    ${(inv.vat_amount ?? 0) > 0 ? `<div class="tr"><span>VAT (5%)</span><span>${fmtC(inv.vat_amount)}</span></div>` : ''}
    ${(inv.discount ?? 0) > 0 ? `<div class="tr"><span>Discount</span><span>− ${fmtC(inv.discount)}</span></div>` : ''}
    <div class="tr grand"><span>Total</span><span>${fmtC(inv.total)}</span></div>
    ${(inv.amount_paid ?? 0) > 0 ? `
      <div class="tr" style="color:#065f46"><span>Amount Paid</span><span>${fmtC(inv.amount_paid)}</span></div>
      <div class="tr" style="color:#991b1b;font-weight:700"><span>Balance Due</span><span>${fmtC(inv.balance_due)}</span></div>` : ''}
  </div>
  ${inv.notes ? `<div style="margin-top:60px;clear:both"><div class="lbl">Notes</div><p style="color:#475569">${inv.notes}</p></div>` : ''}
  <div style="margin-top:40px;text-align:center;font-size:10px;color:#94a3b8;clear:both">Generated by FinPilot Mobile · ${new Date().toLocaleDateString()}</div>
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
