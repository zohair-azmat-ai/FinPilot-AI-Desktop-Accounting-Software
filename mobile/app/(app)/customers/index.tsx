import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getCustomers, getInvoices, fmtCurrency } from '@/lib/api';
import { C } from '@/lib/theme';

export default function CustomersScreen() {
  const router = useRouter();
  const [customers, setCustomers] = useState<any[]>([]);
  const [balances, setBalances] = useState<Record<number, number>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [custs, invs] = await Promise.all([getCustomers(), getInvoices()]);
      setCustomers(custs ?? []);
      const map: Record<number, number> = {};
      invs?.forEach((i: any) => {
        if (i.customer_id) map[i.customer_id] = (map[i.customer_id] ?? 0) + (i.balance_due ?? 0);
      });
      setBalances(map);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const filtered = customers.filter(c =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase())
  ).map(c => ({ ...c, outstanding: (balances[c.id] ?? 0) + (c.opening_balance ?? 0) }))
   .sort((a, b) => b.outstanding - a.outstanding);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.title}>Customers</Text>
        <Text style={s.count}>{filtered.length}</Text>
      </View>

      <View style={s.searchWrap}>
        <Ionicons name="search-outline" size={16} color={C.muted} style={{ marginRight: 8 }} />
        <TextInput
          style={s.searchInput}
          placeholder="Search customers..."
          placeholderTextColor={C.muted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.brand} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={c => String(c.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.card}
              onPress={() => router.push(`/(app)/customers/${item.id}`)}
            >
              <View style={s.avatar}>
                <Text style={s.avatarText}>{(item.name ?? '?').charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.name}</Text>
                {item.phone ? <Text style={s.phone}>{item.phone}</Text> : null}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.balance, { color: item.outstanding > 0 ? C.err : C.success }]}>
                  {fmtCurrency(item.outstanding)}
                </Text>
                <Text style={s.balLabel}>{item.outstanding > 0 ? 'Due' : 'Settled'}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={s.center}>
              <Ionicons name="people-outline" size={44} color={C.border} />
              <Text style={s.emptyText}>No customers found</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 80 }}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={s.fab}
        onPress={() => router.push('/(app)/customers/create')}
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
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 10,
    backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12,
  },
  searchInput: { flex: 1, height: 40, color: C.text, fontSize: 14 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.card, marginHorizontal: 16, marginBottom: 8,
    borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: C.brandBg, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: C.brand },
  name: { fontSize: 14, fontWeight: '600', color: C.text },
  phone: { fontSize: 12, color: C.sub, marginTop: 2 },
  balance: { fontSize: 14, fontWeight: '700' },
  balLabel: { fontSize: 10, color: C.muted, marginTop: 2 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { color: C.muted, fontSize: 14, marginTop: 12 },
  fab: {
    position: 'absolute', bottom: 24, right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center',
    shadowColor: C.brand, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
  },
});
