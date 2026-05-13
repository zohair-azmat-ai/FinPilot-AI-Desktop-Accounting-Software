import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getInvoices, getCustomers, fmtCurrency, fmtDate } from '@/lib/api';
import { C, STATUS_COLOR, STATUS_BG } from '@/lib/theme';

const FILTERS = ['all', 'unpaid', 'partial', 'paid'] as const;

export default function InvoicesScreen() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Record<number, string>>({});
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [invs, custs] = await Promise.all([getInvoices(), getCustomers()]);
      setInvoices(invs ?? []);
      const map: Record<number, string> = {};
      custs?.forEach((c: any) => { map[c.id] = c.name; });
      setCustomers(map);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const filtered = invoices.filter(inv => {
    if (filter !== 'all' && inv.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const cname = (customers[inv.customer_id] ?? '').toLowerCase();
      if (!inv.invoice_number?.toLowerCase().includes(q) && !cname.includes(q)) return false;
    }
    return true;
  });

  const total = filtered.reduce((s, i) => s + (i.balance_due ?? 0), 0);

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>Invoices</Text>
        <Text style={s.count}>{filtered.length} invoices</Text>
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <Ionicons name="search-outline" size={16} color={C.muted} style={s.searchIcon} />
        <TextInput
          style={s.searchInput}
          placeholder="Search invoices or customer..."
          placeholderTextColor={C.muted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Filter chips */}
      <View style={s.filters}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[s.chip, filter === f && s.chipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.chipText, filter === f && s.chipTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.brand} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => String(i.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.card}
              onPress={() => router.push(`/(app)/invoices/${item.id}?num=${encodeURIComponent(item.invoice_number ?? '')}`)}
            >
              <View style={s.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.invNum}>{item.invoice_number}</Text>
                  <Text style={s.customer}>{customers[item.customer_id] ?? '—'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.amount}>{fmtCurrency(item.total)}</Text>
                  <View style={[s.badge, { backgroundColor: STATUS_BG[item.status] ?? 'transparent' }]}>
                    <Text style={[s.badgeText, { color: STATUS_COLOR[item.status] ?? C.muted }]}>
                      {item.status}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={s.cardBottom}>
                <Text style={s.date}>{fmtDate(item.date)}</Text>
                {(item.balance_due ?? 0) > 0 && (
                  <Text style={[s.balDue, { color: STATUS_COLOR[item.status] ?? C.err }]}>
                    Due: {fmtCurrency(item.balance_due)}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={s.center}>
              <Ionicons name="receipt-outline" size={44} color={C.border} />
              <Text style={s.emptyText}>No invoices found</Text>
            </View>
          }
          ListFooterComponent={
            filtered.length > 0 ? (
              <View style={s.footer}>
                <Text style={s.footerText}>Total outstanding</Text>
                <Text style={s.footerAmt}>{fmtCurrency(total)}</Text>
              </View>
            ) : null
          }
          contentContainerStyle={{ paddingBottom: 80 }}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={s.fab}
        onPress={() => router.push('/(app)/invoices/create')}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4,
  },
  title: { fontSize: 22, fontWeight: '700', color: C.text },
  count: { fontSize: 12, color: C.sub },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginVertical: 10,
    backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 12,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, height: 40, color: C.text, fontSize: 14 },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },
  chipActive: { backgroundColor: C.brandBg, borderColor: C.brand },
  chipText: { fontSize: 13, color: C.sub, fontWeight: '500' },
  chipTextActive: { color: C.brand },
  card: {
    backgroundColor: C.card, marginHorizontal: 16, marginBottom: 10,
    borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14,
  },
  cardTop: { flexDirection: 'row', marginBottom: 8 },
  invNum: { fontSize: 14, fontWeight: '700', color: C.text },
  customer: { fontSize: 12, color: C.sub, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '700', color: C.text },
  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, marginTop: 4 },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between' },
  date: { fontSize: 12, color: C.muted },
  balDue: { fontSize: 12, fontWeight: '600' },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { color: C.muted, fontSize: 14, marginTop: 12 },
  footer: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginHorizontal: 16, padding: 14, backgroundColor: C.card,
    borderRadius: 14, borderWidth: 1, borderColor: C.border,
  },
  footerText: { fontSize: 13, color: C.sub, fontWeight: '500' },
  footerAmt: { fontSize: 16, fontWeight: '700', color: C.err },
  fab: {
    position: 'absolute', bottom: 24, right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center',
    shadowColor: C.brand, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
  },
});
