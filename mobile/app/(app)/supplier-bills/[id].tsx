import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getSupplierBill, getSupplierBillItems, getSupplier, getCompany, deleteSupplierBill, fmtCurrency, fmtDate, amountInWords } from '@/lib/api';
import { C } from '@/lib/theme';

const STATUS_COLOR: Record<string, string> = { unpaid: '#ef4444', partial: '#f59e0b', paid: '#059669' };
const STATUS_BG: Record<string, string> = { unpaid: '#fee2e2', partial: '#fef3c7', paid: '#d1fae5' };

export default function SupplierBillDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [bill, setBill] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [supplier, setSupplier] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const b = await getSupplierBill(Number(id));
        if (!b) return;
        const [its, supp] = await Promise.all([
          getSupplierBillItems(b.id),
          b.supplier_id ? getSupplier(b.supplier_id) : Promise.resolve(null),
        ]);
        setBill(b); setItems(its ?? []); setSupplier(supp);
      } catch (e: any) { Alert.alert('Error', e.message); }
      finally { setLoading(false); }
    })();
  }, [id]);

  if (loading) return <SafeAreaView style={[s.safe, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator size="large" color={C.brand} /></SafeAreaView>;
  if (!bill) return <SafeAreaView style={s.safe}><Text style={s.err}>Bill not found.</Text></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}><Ionicons name="chevron-back" size={22} color={C.text} /></TouchableOpacity>
        <Text style={s.navTitle}>{bill.bill_number}</Text>
        <View style={[s.statusBadge, { backgroundColor: STATUS_BG[bill.status] ?? '#f1f5f9' }]}>
          <Text style={[s.statusText, { color: STATUS_COLOR[bill.status] ?? C.muted }]}>{bill.status}</Text>
        </View>
        <TouchableOpacity style={{ padding: 4 }} onPress={() => router.push(`/(app)/supplier-bills/create?id=${bill.id}`)}>
          <Ionicons name="create-outline" size={22} color={C.brand} />
        </TouchableOpacity>
        <TouchableOpacity style={{ padding: 4 }} onPress={() =>
          Alert.alert('Delete', `Delete ${bill.bill_number}?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => { try { await deleteSupplierBill(bill.id); router.back(); } catch (e: any) { Alert.alert('Error', e.message); } } },
          ])
        }>
          <Ionicons name="trash-outline" size={22} color={C.err} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.card}>
          <Row label="Supplier" value={supplier?.name ?? '—'} />
          <Row label="Date" value={fmtDate(bill.date)} />
          {bill.due_date ? <Row label="Due Date" value={fmtDate(bill.due_date)} /> : null}
          {bill.trn ? <Row label="Supplier TRN" value={bill.trn} /> : null}
          {bill.lpo_no ? <Row label="LPO / PO Ref" value={bill.lpo_no} /> : null}
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
          <TRow label="Subtotal" value={fmtCurrency(bill.subtotal)} />
          {(bill.vat_amount ?? 0) > 0 && <TRow label="VAT (5%)" value={fmtCurrency(bill.vat_amount)} />}
          <TRow label="Total" value={fmtCurrency(bill.total)} bold />
          <View style={s.divider} />
          <TRow label="Amount Paid" value={fmtCurrency(bill.amount_paid ?? 0)} />
          <TRow label="Balance Due" value={fmtCurrency(bill.balance_due ?? 0)} bold />
        </View>

        <View style={s.card}>
          <Text style={s.amtWords}>{amountInWords(bill.total)}</Text>
        </View>

        {bill.notes ? <View style={s.card}><Text style={s.sectionTitle}>Notes</Text><Text style={s.notes}>{bill.notes}</Text></View> : null}
        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <View style={s.row}><Text style={s.rowLabel}>{label}</Text><Text style={s.rowValue}>{value}</Text></View>;
}
function TRow({ label, value, bold }: any) {
  return <View style={s.totalRow}><Text style={[s.totalLabel, bold && { fontWeight: '700', color: C.text }]}>{label}</Text><Text style={[s.totalValue, bold && { fontWeight: '700', fontSize: 15, color: C.text }]}>{value}</Text></View>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  navbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, gap: 8 },
  navTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: C.text },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  card: { backgroundColor: C.card, marginHorizontal: 16, marginBottom: 12, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: C.sub, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  rowLabel: { fontSize: 13, color: C.sub },
  rowValue: { fontSize: 13, color: C.text, fontWeight: '500', flex: 1, textAlign: 'right' },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  itemDesc: { fontSize: 13, color: C.text, fontWeight: '500' },
  itemSub: { fontSize: 11, color: C.muted, marginTop: 2 },
  itemTotal: { fontSize: 13, fontWeight: '600', color: C.text },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  totalLabel: { fontSize: 13, color: C.sub },
  totalValue: { fontSize: 13, color: C.text },
  amtWords: { fontSize: 12, color: C.sub, fontStyle: 'italic', lineHeight: 18 },
  notes: { fontSize: 13, color: C.sub, lineHeight: 20 },
  err: { color: C.err, textAlign: 'center', marginTop: 40, fontSize: 15 },
});
