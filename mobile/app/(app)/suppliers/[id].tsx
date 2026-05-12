import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getSupplier, getSupplierBills, fmtCurrency, fmtDate } from '@/lib/api';
import { C, STATUS_COLOR, STATUS_BG } from '@/lib/theme';

export default function SupplierDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [supplier, setSupplier] = useState<any>(null);
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [sup, bls] = await Promise.all([
          getSupplier(Number(id)),
          getSupplierBills(Number(id)),
        ]);
        setSupplier(sup);
        setBills(bls ?? []);
      } catch {}
      finally { setLoading(false); }
    })();
  }, [id]);

  if (loading) return (
    <SafeAreaView style={[s.safe, { alignItems: 'center', justifyContent: 'center' }]}>
      <ActivityIndicator size="large" color={C.brand} />
    </SafeAreaView>
  );
  if (!supplier) return (
    <SafeAreaView style={s.safe}>
      <Text style={s.err}>Supplier not found.</Text>
    </SafeAreaView>
  );

  const totalBilled = bills.reduce((s, b) => s + (b.total ?? 0), 0);
  const totalPaid = bills.reduce((s, b) => s + (b.amount_paid ?? 0), 0);
  const outstanding = bills.reduce((s, b) => s + (b.balance_due ?? 0), 0) + (supplier.opening_balance ?? 0);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={s.navTitle} numberOfLines={1}>{supplier.name}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.statsRow}>
          <StatCard label="Payable" value={fmtCurrency(outstanding)} color={outstanding > 0 ? C.warn : C.success} />
          <StatCard label="Billed" value={fmtCurrency(totalBilled)} color={C.text} />
          <StatCard label="Paid" value={fmtCurrency(totalPaid)} color={C.success} />
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>Contact Info</Text>
          {supplier.phone && <Row label="Phone" value={supplier.phone} />}
          {supplier.email && <Row label="Email" value={supplier.email} />}
          {supplier.trn && <Row label="TRN" value={supplier.trn} />}
          {supplier.address && <Row label="Address" value={supplier.address} />}
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>Bills ({bills.length})</Text>
          {bills.length === 0 && <Text style={{ color: C.muted, fontSize: 13 }}>No bills yet</Text>}
          {bills.map(bill => (
            <View key={bill.id} style={s.billRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.billNum}>{bill.bill_number}</Text>
                <Text style={s.billDate}>{fmtDate(bill.date)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.billTotal}>{fmtCurrency(bill.total)}</Text>
                <View style={[s.badge, { backgroundColor: STATUS_BG[bill.status] ?? 'transparent' }]}>
                  <Text style={[s.badgeText, { color: STATUS_COLOR[bill.status] ?? C.muted }]}>
                    {bill.status}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value, color }: any) {
  return (
    <View style={s.statCard}>
      <Text style={[s.statVal, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
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

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  navbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, gap: 10 },
  navTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: C.text },
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 12 },
  statCard: {
    flex: 1, backgroundColor: C.card, borderRadius: 14, borderWidth: 1,
    borderColor: C.border, padding: 14, alignItems: 'center',
  },
  statVal: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  statLabel: { fontSize: 10, color: C.muted, marginTop: 4, textAlign: 'center' },
  card: {
    backgroundColor: C.card, marginHorizontal: 16, marginBottom: 12,
    borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16,
  },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: C.sub, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.border },
  rowLabel: { fontSize: 13, color: C.muted },
  rowValue: { fontSize: 13, color: C.text, fontWeight: '500', flex: 1, textAlign: 'right' },
  billRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  billNum: { fontSize: 13, fontWeight: '600', color: C.text },
  billDate: { fontSize: 11, color: C.muted, marginTop: 2 },
  billTotal: { fontSize: 13, fontWeight: '700', color: C.text },
  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, marginTop: 4 },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  err: { color: C.err, textAlign: 'center', marginTop: 40, fontSize: 15 },
});
