import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getReports, fmtCurrency } from '@/lib/api';
import { C } from '@/lib/theme';

export default function ReportsScreen() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const r = await getReports();
      setData(r);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const maxMonthly = data?.monthlyRevenue?.reduce((m: number, [, v]: [string, number]) => Math.max(m, v), 1) ?? 1;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.title}>Reports</Text>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.brand} size="large" /></View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
        >
          <View style={s.grid}>
            <StatCard label="Total Revenue" value={fmtCurrency(data?.totalRevenue ?? 0)} color={C.brand} />
            <StatCard label="Collected" value={fmtCurrency(data?.totalCollected ?? 0)} color={C.success} />
            <StatCard label="Expenses" value={fmtCurrency(data?.totalExpenses ?? 0)} color={C.err} />
            <StatCard label="Invoices" value={String(data?.invoiceCount ?? 0)} color={C.text} />
          </View>

          <View style={s.card}>
            <Text style={s.sectionTitle}>Monthly Revenue (Last 6 Months)</Text>
            {(!data?.monthlyRevenue || data.monthlyRevenue.length === 0) ? (
              <Text style={s.empty}>No data available</Text>
            ) : (
              data.monthlyRevenue.map(([month, amount]: [string, number]) => (
                <View key={month} style={s.barRow}>
                  <Text style={s.barLabel}>{month}</Text>
                  <View style={s.barTrack}>
                    <View style={[s.barFill, { width: `${Math.round((amount / maxMonthly) * 100)}%` }]} />
                  </View>
                  <Text style={s.barValue}>{fmtCurrency(amount)}</Text>
                </View>
              ))
            )}
          </View>

          <View style={s.card}>
            <Text style={s.sectionTitle}>Summary</Text>
            <SummaryRow label="Net (Revenue − Expenses)" value={fmtCurrency((data?.totalRevenue ?? 0) - (data?.totalExpenses ?? 0))} />
            <SummaryRow label="Outstanding Receivables" value={fmtCurrency((data?.totalRevenue ?? 0) - (data?.totalCollected ?? 0))} />
            <SummaryRow label="Collection Rate" value={
              data?.totalRevenue > 0
                ? `${Math.round((data.totalCollected / data.totalRevenue) * 100)}%`
                : '—'
            } />
          </View>

          <View style={{ height: 30 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={s.statCard}>
      <Text style={[s.statVal, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.sumRow}>
      <Text style={s.sumLabel}>{label}</Text>
      <Text style={s.sumValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', color: C.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
    paddingHorizontal: 16, marginBottom: 12,
  },
  statCard: {
    width: '47%', backgroundColor: C.card, borderRadius: 14,
    borderWidth: 1, borderColor: C.border, padding: 14, alignItems: 'center',
  },
  statVal: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  statLabel: { fontSize: 10, color: C.muted, marginTop: 4, textAlign: 'center' },
  card: {
    backgroundColor: C.card, marginHorizontal: 16, marginBottom: 12,
    borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16,
  },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: C.sub, marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.5 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  barLabel: { fontSize: 11, color: C.muted, width: 52 },
  barTrack: { flex: 1, height: 8, backgroundColor: C.border, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: C.brand, borderRadius: 4 },
  barValue: { fontSize: 11, color: C.text, fontWeight: '600', width: 78, textAlign: 'right' },
  sumRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  sumLabel: { fontSize: 13, color: C.muted, flex: 1 },
  sumValue: { fontSize: 13, color: C.text, fontWeight: '600' },
  empty: { color: C.muted, fontSize: 13 },
});
