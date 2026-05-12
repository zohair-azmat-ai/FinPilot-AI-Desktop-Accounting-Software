import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getPurchaseOrder, getPurchaseOrderItems, getSupplier, getCompany, deletePurchaseOrder, fmtCurrency, fmtDate, amountInWords } from '@/lib/api';
import { C } from '@/lib/theme';

export default function PurchaseOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [po, setPo] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [supplier, setSupplier] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const p = await getPurchaseOrder(Number(id));
        if (!p) return;
        const [its, supp, comp] = await Promise.all([
          getPurchaseOrderItems(p.id),
          p.supplier_id ? getSupplier(p.supplier_id) : Promise.resolve(null),
          getCompany(),
        ]);
        setPo(p); setItems(its ?? []); setSupplier(supp); setCompany(comp);
      } catch (e: any) { Alert.alert('Error', e.message); }
      finally { setLoading(false); }
    })();
  }, [id]);

  const shareAsPDF = async () => {
    setSharing(true);
    try {
      const html = buildPOHTML(po, items, supplier, company);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `PO ${po.po_number}`, UTI: 'com.adobe.pdf' });
    } catch (e: any) { Alert.alert('Share failed', e.message); }
    finally { setSharing(false); }
  };

  if (loading) return <SafeAreaView style={[s.safe, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator size="large" color={C.brand} /></SafeAreaView>;
  if (!po) return <SafeAreaView style={s.safe}><Text style={s.err}>Purchase order not found.</Text></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}><Ionicons name="chevron-back" size={22} color={C.text} /></TouchableOpacity>
        <Text style={s.navTitle}>{po.po_number}</Text>
        <TouchableOpacity style={{ padding: 4 }} onPress={() => router.push(`/(app)/purchase-orders/create?id=${po.id}`)}>
          <Ionicons name="create-outline" size={22} color={C.brand} />
        </TouchableOpacity>
        <TouchableOpacity style={{ padding: 4 }} onPress={() =>
          Alert.alert('Delete', `Delete ${po.po_number}?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => { try { await deletePurchaseOrder(po.id); router.back(); } catch (e: any) { Alert.alert('Error', e.message); } } },
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
          <Row label="Supplier" value={supplier?.name ?? '—'} />
          <Row label="Date" value={fmtDate(po.date)} />
          {po.delivery_date ? <Row label="Delivery Date" value={fmtDate(po.delivery_date)} /> : null}
          {po.payment_terms ? <Row label="Payment Terms" value={po.payment_terms} /> : null}
          {po.delivery_terms ? <Row label="Delivery Terms" value={po.delivery_terms} /> : null}
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
          <TRow label="Subtotal" value={fmtCurrency(po.subtotal)} />
          {(po.vat_amount ?? 0) > 0 && <TRow label="VAT (5%)" value={fmtCurrency(po.vat_amount)} />}
          <TRow label="Total" value={fmtCurrency(po.total)} bold />
        </View>

        {po.notes ? <View style={s.card}><Text style={s.sectionTitle}>Notes</Text><Text style={s.notes}>{po.notes}</Text></View> : null}
        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <View style={s.row}><Text style={s.rowLabel}>{label}</Text><Text style={s.rowValue}>{value}</Text></View>;
}
function TRow({ label, value, bold }: any) {
  return <View style={s.totalRow}><Text style={[s.totalLabel, bold && { fontWeight: '700', color: C.text }]}>{label}</Text><Text style={[s.totalValue, bold && { fontWeight: '700', fontSize: 16, color: C.text }]}>{value}</Text></View>;
}

function buildPOHTML(po: any, items: any[], supp: any, comp: any): string {
  const ACCENT = '#2563EB'; const PRIMARY = '#1E3A5F'; const DARK = '#0F172A'; const MED = '#94A3B8'; const LIGHT = '#F8FAFC';
  const fmtC = (n: number | null) => `AED ${(n ?? 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  const fmtD = (s: string | null) => s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  const rows = items.map((it, i) => `<tr style="background:${i%2===0?'#fff':LIGHT}"><td style="padding:7px 8px;font-size:11px;text-align:center">${i+1}</td><td style="padding:7px 8px;font-size:11px">${it.description??''}</td><td style="padding:7px 8px;font-size:11px;text-align:right">${(it.quantity??0).toFixed(2)}</td><td style="padding:7px 8px;font-size:11px;text-align:right">${fmtC(it.unit_price)}</td><td style="padding:7px 8px;font-size:11px;text-align:right">${it.vat_applicable?fmtC(it.vat_amount??0):'Exempt'}</td><td style="padding:7px 8px;font-size:11px;text-align:right;font-weight:600">${fmtC(it.total)}</td></tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;color:${DARK};padding:20px}thead tr{background:${PRIMARY}}th{padding:8px;font-size:10px;color:#fff;text-align:left}td{border-bottom:1px solid #e2e8f0}table{width:100%;border-collapse:collapse;margin:14px 0}</style></head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;padding-bottom:14px;border-bottom:2px solid ${ACCENT}">
    <div><div style="font-size:17px;font-weight:700;color:${PRIMARY}">${comp?.name??''}</div>${comp?.trn?`<div style="font-size:9px;color:${MED}">TRN: ${comp.trn}</div>`:''}</div>
    <div style="text-align:right"><div style="font-size:22px;font-weight:700;color:${ACCENT}">PURCHASE ORDER</div><div style="font-size:10px"><b>No:</b> ${po.po_number}</div><div style="font-size:10px"><b>Date:</b> ${fmtD(po.date)}</div>${po.delivery_date?`<div style="font-size:10px"><b>Delivery:</b> ${fmtD(po.delivery_date)}</div>`:''}</div>
  </div>
  <div style="margin-bottom:14px"><div style="font-size:7px;font-weight:700;color:${MED};text-transform:uppercase;margin-bottom:3px">SUPPLIER</div><div style="font-size:11px;font-weight:700">${supp?.name??'—'}</div>${supp?.trn?`<div style="font-size:9px;color:#475569">TRN: ${supp.trn}</div>`:''}</div>
  <table><thead><tr><th style="width:30px;text-align:center">#</th><th>Description</th><th style="width:60px">Qty</th><th style="width:90px">Unit Price</th><th style="width:80px">VAT</th><th style="width:90px">Amount</th></tr></thead><tbody>${rows}</tbody></table>
  <div style="display:flex;justify-content:flex-end"><div style="min-width:220px">
    <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:11px"><span style="color:${MED}">Subtotal</span><span>${fmtC(po.subtotal)}</span></div>
    ${(po.vat_amount??0)>0?`<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:11px"><span style="color:${MED}">VAT (5%)</span><span>${fmtC(po.vat_amount)}</span></div>`:''}
    <div style="display:flex;justify-content:space-between;padding:6px 0;font-weight:700;font-size:14px;border-top:2px solid ${ACCENT};margin-top:4px"><span>TOTAL</span><span>${fmtC(po.total)}</span></div>
  </div></div>
  <div style="background:${LIGHT};border-left:3px solid ${ACCENT};padding:8px 12px;font-size:10px;font-style:italic;color:${PRIMARY};margin:14px 0">${amountInWords(po.total)}</div>
  ${po.notes?`<div style="font-size:10px;color:#475569;margin-top:10px"><b>Notes:</b> ${po.notes}</div>`:''}
  <div style="margin-top:40px;display:flex;gap:60px"><div><div style="font-size:9px;color:${MED};margin-bottom:4px;font-weight:600">AUTHORIZED BY</div><div style="border-bottom:2px solid ${DARK};width:150px"></div></div><div><div style="font-size:9px;color:${MED};margin-bottom:4px;font-weight:600">SUPPLIER SIGNATURE</div><div style="border-bottom:2px solid ${DARK};width:150px"></div></div></div>
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
