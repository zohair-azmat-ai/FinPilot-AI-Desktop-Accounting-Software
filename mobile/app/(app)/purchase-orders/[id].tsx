import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getPurchaseOrder, getPurchaseOrderByNumber, getPurchaseOrderItems, getSupplier, deletePurchaseOrder, fmtCurrency, fmtDate } from '@/lib/api';
import { viewPDF, downloadAndSharePDF } from '@/lib/pdf';
import { C } from '@/lib/theme';

export default function PurchaseOrderDetailScreen() {
  const { id, num } = useLocalSearchParams<{ id: string; num?: string }>();
  const router = useRouter();
  const [po, setPo] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [supplier, setSupplier] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        let p: any = null;
        const numeric = Number(id);
        if (!isNaN(numeric) && numeric > 0) p = await getPurchaseOrder(numeric);
        if (!p && num) p = await getPurchaseOrderByNumber(num);
        if (!p && id && isNaN(Number(id))) p = await getPurchaseOrderByNumber(id);
        if (!p) return;
        const [its, supp] = await Promise.all([
          getPurchaseOrderItems(p.id),
          p.supplier_id ? getSupplier(p.supplier_id) : Promise.resolve(null),
        ]);
        setPo(p); setItems(its ?? []); setSupplier(supp);
      } catch (e: any) { Alert.alert('Error', e.message); }
      finally { setLoading(false); }
    })();
  }, [id, num]);

  const pdfPath = po ? `/api/purchase-orders/${encodeURIComponent(po.po_number)}/pdf` : null;

  if (loading) return <SafeAreaView style={[s.safe, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator size="large" color={C.brand} /></SafeAreaView>;
  if (!po) return (
    <SafeAreaView style={s.safe}>
      <View style={{ padding: 24, alignItems: 'center', marginTop: 40 }}>
        <Ionicons name="alert-circle-outline" size={44} color={C.err} />
        <Text style={s.err}>Purchase order not found.</Text>
        <Text style={s.errSub}>ID: {id}{num ? `  ·  ${num}` : ''}</Text>
        <TouchableOpacity onPress={() => router.back()} style={s.backFallback}>
          <Text style={{ color: C.brand, fontWeight: '600' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

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
          <TouchableOpacity style={s.actionBtn} onPress={() => pdfPath && viewPDF(pdfPath)}>
            <Ionicons name="eye-outline" size={18} color={C.brand} />
            <Text style={s.actionText}>View PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn} onPress={async () => {
            if (!pdfPath) return;
            setSharing(true);
            try { await downloadAndSharePDF(pdfPath, `PO_${po.po_number}.pdf`); }
            finally { setSharing(false); }
          }} disabled={sharing}>
            <Ionicons name="document-text-outline" size={18} color={C.brand} />
            <Text style={s.actionText}>{sharing ? 'Fetching…' : 'Share PDF'}</Text>
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

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  navbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, gap: 10 },
  navTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: C.text },
  actionRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 12, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.brand },
  actionText: { fontSize: 12, fontWeight: '600', color: C.brand },
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
  err: { color: C.err, textAlign: 'center', marginTop: 12, fontSize: 15, fontWeight: '600' },
  errSub: { color: C.muted, textAlign: 'center', marginTop: 6, fontSize: 12 },
  backFallback: { marginTop: 20, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 10, borderWidth: 1, borderColor: C.brand },
});
