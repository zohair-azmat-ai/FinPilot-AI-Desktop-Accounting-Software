import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getCustomer, getInvoicesByCustomer, deleteCustomer, fmtCurrency, fmtDate } from '@/lib/api';
import { C, STATUS_COLOR, STATUS_BG } from '@/lib/theme';

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [customer, setCustomer] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [cust, invs] = await Promise.all([
          getCustomer(Number(id)),
          getInvoicesByCustomer(Number(id)),
        ]);
        setCustomer(cust);
        setInvoices(invs ?? []);
      } catch {}
      finally { setLoading(false); }
    })();
  }, [id]);

  if (loading) return (
    <SafeAreaView style={[s.safe, { alignItems: 'center', justifyContent: 'center' }]}>
      <ActivityIndicator size="large" color={C.brand} />
    </SafeAreaView>
  );
  if (!customer) return (
    <SafeAreaView style={s.safe}>
      <Text style={s.err}>Customer not found.</Text>
    </SafeAreaView>
  );

  const totalInvoiced = invoices.reduce((s, i) => s + (i.total ?? 0), 0);
  const totalPaid = invoices.reduce((s, i) => s + (i.total ?? 0) - (i.balance_due ?? 0), 0);
  const outstanding = invoices.reduce((s, i) => s + (i.balance_due ?? 0), 0) + (customer.opening_balance ?? 0);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={s.navTitle} numberOfLines={1}>{customer.name}</Text>
        <TouchableOpacity
          style={{ padding: 4 }}
          onPress={() => router.push(`/(app)/customers/create?id=${customer.id}`)}
        >
          <Ionicons name="create-outline" size={22} color={C.brand} />
        </TouchableOpacity>
        <TouchableOpacity
          style={{ padding: 4 }}
          onPress={() => Alert.alert(
            'Delete Customer',
            `Delete "${customer.name}"? This cannot be undone.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete', style: 'destructive',
                onPress: async () => {
                  try {
                    await deleteCustomer(customer.id);
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
        {/* Balance cards */}
        <View style={s.statsRow}>
          <StatCard label="Outstanding" value={fmtCurrency(outstanding)} color={outstanding > 0 ? C.err : C.success} />
          <StatCard label="Invoiced" value={fmtCurrency(totalInvoiced)} color={C.text} />
          <StatCard label="Collected" value={fmtCurrency(totalPaid)} color={C.success} />
        </View>

        {/* Details */}
        <View style={s.card}>
          <Text style={s.sectionTitle}>Contact Info</Text>
          {customer.phone && <Row label="Phone" value={customer.phone} />}
          {customer.email && <Row label="Email" value={customer.email} />}
          {customer.trn && <Row label="TRN" value={customer.trn} />}
          {customer.address && <Row label="Address" value={customer.address} />}
          {(customer.opening_balance ?? 0) !== 0 && (
            <Row label="Opening Balance" value={fmtCurrency(customer.opening_balance)} />
          )}
        </View>

        {/* Invoices */}
        <View style={s.card}>
          <Text style={s.sectionTitle}>Invoices ({invoices.length})</Text>
          {invoices.length === 0 && (
            <Text style={{ color: C.muted, fontSize: 13 }}>No invoices yet</Text>
          )}
          {invoices.map(inv => (
            <TouchableOpacity
              key={inv.id}
              style={s.invRow}
              onPress={() => router.push(`/(app)/invoices/${inv.id}`)}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.invNum}>{inv.invoice_number}</Text>
                <Text style={s.invDate}>{fmtDate(inv.date)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.invTotal}>{fmtCurrency(inv.total)}</Text>
                <View style={[s.badge, { backgroundColor: STATUS_BG[inv.status] ?? 'transparent' }]}>
                  <Text style={[s.badgeText, { color: STATUS_COLOR[inv.status] ?? C.muted }]}>
                    {inv.status}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
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
  invRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  invNum: { fontSize: 13, fontWeight: '600', color: C.text },
  invDate: { fontSize: 11, color: C.muted, marginTop: 2 },
  invTotal: { fontSize: 13, fontWeight: '700', color: C.text },
  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, marginTop: 4 },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  err: { color: C.err, textAlign: 'center', marginTop: 40, fontSize: 15 },
});
