import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Share } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getQuotation, getQuotationItems, getCustomer, getCompany, deleteQuotation, fmtCurrency, fmtDate, amountInWords } from '@/lib/api';
import { C } from '@/lib/theme';

export default function QuotationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [q, setQ] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [customer, setCustomer] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const quot = await getQuotation(Number(id));
        if (!quot) return;
        const [its, cust, comp] = await Promise.all([
          getQuotationItems(quot.id),
          quot.customer_id ? getCustomer(quot.customer_id) : Promise.resolve(null),
          getCompany(),
        ]);
        setQ(quot); setItems(its ?? []); setCustomer(cust); setCompany(comp);
      } catch (e: any) { Alert.alert('Error', e.message); }
      finally { setLoading(false); }
    })();
  }, [id]);

  const shareAsPDF = async () => {
    setSharing(true);
    try {
      const html = buildQuotationHTML(q, items, customer, company);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Quotation ${q.quotation_number}`, UTI: 'com.adobe.pdf' });
    } catch (e: any) { Alert.alert('Share failed', e.message); }
    finally { setSharing(false); }
  };

  if (loading) return <SafeAreaView style={[s.safe, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator size="large" color={C.brand} /></SafeAreaView>;
  if (!q) return <SafeAreaView style={s.safe}><Text style={s.err}>Quotation not found.</Text></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}><Ionicons name="chevron-back" size={22} color={C.text} /></TouchableOpacity>
        <Text style={s.navTitle}>{q.quotation_number}</Text>
        <TouchableOpacity style={{ padding: 4 }} onPress={() => router.push(`/(app)/quotations/create?id=${q.id}`)}>
          <Ionicons name="create-outline" size={22} color={C.brand} />
        </TouchableOpacity>
        <TouchableOpacity style={{ padding: 4 }} onPress={() =>
          Alert.alert('Delete', `Delete ${q.quotation_number}?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => { try { await deleteQuotation(q.id); router.back(); } catch (e: any) { Alert.alert('Error', e.message); } } },
          ])
        }>
          <Ionicons name="trash-outline" size={22} color={C.err} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.actionRow}>
          <TouchableOpacity style={s.actionBtn} onPress={shareAsPDF} disabled={sharing}>
            <Ionicons name="document-text-outline" size={18} color={C.brand} />
            <Text style={s.actionText}>{sharing ? 'Generating…' : 'Share PDF'}</Text>
          </TouchableOpacity>
        </View>

        <View style={s.card}>
          <Row label="Customer" value={customer?.name ?? '—'} />
          <Row label="Date" value={fmtDate(q.date)} />
          {q.valid_until ? <Row label="Valid Until" value={fmtDate(q.valid_until)} /> : null}
          {q.payment_terms ? <Row label="Payment Terms" value={q.payment_terms} /> : null}
          {q.delivery ? <Row label="Delivery" value={q.delivery} /> : null}
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>Items</Text>
          {items.map((it, idx) => (
            <View key={idx} style={s.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.itemDesc}>{it.description}</Text>
                <Text style={s.itemSub}>{it.quantity} × {fmtCurrency(it.unit_price)}{it.vat_applicable ? '  +5% VAT' : ''}</Text>
              </View>
              <Text style={s.itemTotal}>{fmtCurrency(it.total)}</Text>
            </View>
          ))}
          <View style={s.divider} />
          <TRow label="Subtotal" value={fmtCurrency(q.subtotal)} />
          {(q.vat_amount ?? 0) > 0 && <TRow label="VAT (5%)" value={fmtCurrency(q.vat_amount)} />}
          {(q.discount ?? 0) > 0 && <TRow label="Discount" value={`− ${fmtCurrency(q.discount)}`} />}
          <TRow label="Total" value={fmtCurrency(q.total)} bold />
        </View>

        {q.notes ? <View style={s.card}><Text style={s.sectionTitle}>Notes</Text><Text style={s.notes}>{q.notes}</Text></View> : null}
        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <View style={s.row}><Text style={s.rowLabel}>{label}</Text><Text style={s.rowValue}>{value}</Text></View>;
}
function TRow({ label, value, bold }: any) {
  return (
    <View style={s.totalRow}>
      <Text style={[s.totalLabel, bold && { fontWeight: '700', color: C.text }]}>{label}</Text>
      <Text style={[s.totalValue, bold && { fontWeight: '700', fontSize: 16, color: C.text }]}>{value}</Text>
    </View>
  );
}

function buildQuotationHTML(q: any, items: any[], cust: any, comp: any): string {
  const ACCENT = '#2563EB'; const PRIMARY = '#1E3A5F'; const DARK = '#0F172A'; const MED = '#94A3B8'; const LIGHT = '#F8FAFC';
  const fmtC = (n: number | null) => `AED ${(n ?? 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  const fmtD = (s: string | null) => s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  const rows = items.map((it, i) => `<tr style="background:${i%2===0?'#fff':LIGHT}"><td style="padding:7px 8px;font-size:11px;text-align:center">${i+1}</td><td style="padding:7px 8px;font-size:11px">${it.description??''}</td><td style="padding:7px 8px;font-size:11px;text-align:right">${(it.quantity??0).toFixed(2)}</td><td style="padding:7px 8px;font-size:11px;text-align:right">${fmtC(it.unit_price)}</td><td style="padding:7px 8px;font-size:11px;text-align:right">${it.vat_applicable?fmtC(it.vat_amount??0):'Exempt'}</td><td style="padding:7px 8px;font-size:11px;text-align:right;font-weight:600">${fmtC(it.total)}</td></tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;color:${DARK};padding:20px}thead tr{background:${PRIMARY}}th{padding:8px;font-size:10px;color:#fff;text-align:left;font-weight:600}td{border-bottom:1px solid #e2e8f0}</style></head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;padding-bottom:14px;border-bottom:2px solid ${ACCENT}">
    <div><div style="font-size:17px;font-weight:700;color:${PRIMARY}">${comp?.name??''}</div>${comp?.trn?`<div style="font-size:9px;color:${MED}">TRN: ${comp.trn}</div>`:''}</div>
    <div style="text-align:right"><div style="font-size:22px;font-weight:700;color:${ACCENT}">QUOTATION</div><div style="font-size:10px;color:${DARK}"><b>No:</b> ${q.quotation_number}</div><div style="font-size:10px"><b>Date:</b> ${fmtD(q.date)}</div>${q.valid_until?`<div style="font-size:10px"><b>Valid:</b> ${fmtD(q.valid_until)}</div>`:''}</div>
  </div>
  <div style="margin-bottom:14px"><div style="font-size:7px;font-weight:700;color:${MED};text-transform:uppercase;margin-bottom:3px">QUOTE TO</div><div style="font-size:11px;font-weight:700">${cust?.name??'—'}</div>${cust?.trn?`<div style="font-size:9px;color:#475569">TRN: ${cust.trn}</div>`:''}</div>
  <table style="width:100%;border-collapse:collapse;margin:14px 0"><thead><tr><th style="width:30px;text-align:center">#</th><th>Description</th><th style="width:60px">Qty</th><th style="width:90px">Unit Price</th><th style="width:80px">VAT</th><th style="width:90px">Amount</th></tr></thead><tbody>${rows}</tbody></table>
  <div style="display:flex;justify-content:flex-end"><div style="min-width:220px">
    <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:11px"><span style="color:${MED}">Subtotal</span><span>${fmtC(q.subtotal)}</span></div>
    ${(q.vat_amount??0)>0?`<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:11px"><span style="color:${MED}">VAT (5%)</span><span>${fmtC(q.vat_amount)}</span></div>`:''}
    ${(q.discount??0)>0?`<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:11px"><span style="color:${MED}">Discount</span><span>− ${fmtC(q.discount)}</span></div>`:''}
    <div style="display:flex;justify-content:space-between;padding:6px 0;font-weight:700;font-size:14px;border-top:2px solid ${ACCENT};margin-top:4px"><span>TOTAL</span><span>${fmtC(q.total)}</span></div>
  </div></div>
  <div style="background:${LIGHT};border-left:3px solid ${ACCENT};padding:8px 12px;font-size:10px;font-style:italic;color:${PRIMARY};margin:14px 0">${amountInWords(q.total)}</div>
  ${q.notes?`<div style="font-size:10px;color:#475569;margin-top:10px;border-top:1px dashed #e2e8f0;padding-top:8px"><b>Notes:</b> ${q.notes}</div>`:''}
  </body></html>`;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  navbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, gap: 10 },
  navTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: C.text },
  actionRow: { flexDirection: 'row', gap: 12, marginHorizontal: 16, marginBottom: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.brand },
  actionText: { fontSize: 14, fontWeight: '600', color: C.brand },
  card: { backgroundColor: C.card, marginHorizontal: 16, marginBottom: 12, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16 },
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
