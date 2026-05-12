import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getDashboard, fmtCurrency, fmtDate } from '@/lib/api';
import { clearWorkspace } from '@/lib/storage';
import { setApiConfig } from '@/lib/api';
import { C, STATUS_COLOR, STATUS_BG } from '@/lib/theme';

export default function DashboardScreen() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try { setData(await getDashboard()); } catch { setData(null); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const disconnect = async () => {
    await clearWorkspace();
    setApiConfig(null as any);
    router.replace('/');
  };

  if (loading) return (
    <SafeAreaView style={[s.safe, { alignItems: 'center', justifyContent: 'center' }]}>
      <ActivityIndicator size="large" color={C.brand} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.company}>{data?.company?.name ?? 'FinPilot'}</Text>
            <Text style={s.sub}>Dashboard</Text>
          </View>
          <TouchableOpacity onPress={disconnect} style={s.disconnectBtn}>
            <Ionicons name="log-out-outline" size={18} color={C.muted} />
          </TouchableOpacity>
        </View>

        {/* Summary cards */}
        <View style={s.row}>
          <StatCard label="Receivable" value={fmtCurrency(data?.totalReceivable)} color={C.err} icon="trending-up" />
          <StatCard label="Payable" value={fmtCurrency(data?.totalPayable)} color={C.warn} icon="trending-down" />
        </View>
        <View style={s.row}>
          <StatCard label="This Month" value={fmtCurrency(data?.monthRevenue)} color={C.success} icon="calendar" />
          <StatCard label="Invoices" value={String(data?.invoiceCount ?? 0)} color={C.brand} icon="receipt" />
        </View>

        {/* Invoice status */}
        <View style={s.card}>
          <Text style={s.sectionTitle}>Invoice Status</Text>
          <View style={s.statusRow}>
            <StatusPill label="Unpaid" count={data?.unpaidCount ?? 0} color={C.err} bg={C.errBg} />
            <StatusPill label="Partial" count={data?.partialCount ?? 0} color={C.warn} bg={C.warnBg} />
            <StatusPill label="Paid" count={(data?.invoiceCount ?? 0) - (data?.unpaidCount ?? 0) - (data?.partialCount ?? 0)} color={C.success} bg={C.successBg} />
          </View>
        </View>

        {/* Recent invoices */}
        {data?.recentInvoices?.length > 0 && (
          <View style={s.card}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Recent Invoices</Text>
              <TouchableOpacity onPress={() => router.push('/(app)/invoices')}>
                <Text style={s.seeAll}>See all</Text>
              </TouchableOpacity>
            </View>
            {data.recentInvoices.map((inv: any) => (
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
                  <Text style={[s.invAmount, { color: STATUS_COLOR[inv.status] ?? C.text }]}>
                    {fmtCurrency(inv.balance_due)}
                  </Text>
                  <View style={[s.badge, { backgroundColor: STATUS_BG[inv.status] ?? 'transparent' }]}>
                    <Text style={[s.badgeText, { color: STATUS_COLOR[inv.status] ?? C.muted }]}>
                      {inv.status}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Quick links */}
        <View style={s.row}>
          <QuickLink icon="people" label="Customers" onPress={() => router.push('/(app)/customers')} />
          <QuickLink icon="business" label="Suppliers" onPress={() => router.push('/(app)/suppliers')} />
          <QuickLink icon="bar-chart" label="Reports" onPress={() => router.push('/(app)/reports')} />
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value, color, icon }: any) {
  return (
    <View style={[s.statCard]}>
      <View style={[s.statIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={s.statVal}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function StatusPill({ label, count, color, bg }: any) {
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      <Text style={[s.pillCount, { color }]}>{count}</Text>
      <Text style={[s.pillLabel, { color }]}>{label}</Text>
    </View>
  );
}

function QuickLink({ icon, label, onPress }: any) {
  return (
    <TouchableOpacity style={s.quickLink} onPress={onPress}>
      <Ionicons name={icon} size={22} color={C.brand} />
      <Text style={s.quickLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
  },
  company: { fontSize: 20, fontWeight: '700', color: C.text },
  sub: { fontSize: 12, color: C.sub, marginTop: 2 },
  disconnectBtn: { padding: 8 },
  row: { flexDirection: 'row', paddingHorizontal: 16, gap: 12, marginBottom: 12 },
  statCard: {
    flex: 1, backgroundColor: C.card, borderRadius: 14, borderWidth: 1,
    borderColor: C.border, padding: 14,
  },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statVal: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 2 },
  statLabel: { fontSize: 11, color: C.sub },
  card: {
    marginHorizontal: 16, marginBottom: 12, backgroundColor: C.card,
    borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16,
  },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  seeAll: { fontSize: 12, color: C.brand },
  statusRow: { flexDirection: 'row', gap: 10 },
  pill: { flex: 1, borderRadius: 10, padding: 12, alignItems: 'center' },
  pillCount: { fontSize: 22, fontWeight: '700' },
  pillLabel: { fontSize: 11, fontWeight: '500', marginTop: 2 },
  invRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  invNum: { fontSize: 13, fontWeight: '600', color: C.text },
  invDate: { fontSize: 11, color: C.sub, marginTop: 2 },
  invAmount: { fontSize: 13, fontWeight: '700' },
  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginTop: 3 },
  badgeText: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  quickLink: {
    flex: 1, backgroundColor: C.card, borderRadius: 14, borderWidth: 1,
    borderColor: C.border, padding: 14, alignItems: 'center', gap: 6,
  },
  quickLabel: { fontSize: 12, color: C.sub, fontWeight: '500' },
});
