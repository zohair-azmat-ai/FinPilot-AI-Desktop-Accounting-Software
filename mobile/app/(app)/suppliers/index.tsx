import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getSuppliers, getSupplierBills, fmtCurrency } from '@/lib/api';
import { C } from '@/lib/theme';

export default function SuppliersScreen() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [balances, setBalances] = useState<Record<number, number>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [sups, bills] = await Promise.all([getSuppliers(), getSupplierBills()]);
      setSuppliers(sups ?? []);
      const map: Record<number, number> = {};
      bills?.forEach((b: any) => {
        if (b.supplier_id) map[b.supplier_id] = (map[b.supplier_id] ?? 0) + (b.balance_due ?? 0);
      });
      setBalances(map);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const filtered = suppliers
    .filter(s => !search || s.name?.toLowerCase().includes(search.toLowerCase()))
    .map(s => ({ ...s, outstanding: (balances[s.id] ?? 0) + (s.opening_balance ?? 0) }))
    .sort((a, b) => b.outstanding - a.outstanding);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.title}>Suppliers</Text>
        <Text style={s.count}>{filtered.length}</Text>
      </View>

      <View style={s.searchWrap}>
        <Ionicons name="search-outline" size={16} color={C.muted} style={{ marginRight: 8 }} />
        <TextInput
          style={s.searchInput}
          placeholder="Search suppliers..."
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
          keyExtractor={i => String(i.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.card}
              onPress={() => router.push(`/(app)/suppliers/${item.id}`)}
            >
              <View style={s.avatar}>
                <Ionicons name="business" size={18} color={C.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.name}</Text>
                {item.phone && <Text style={s.phone}>{item.phone}</Text>}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.balance, { color: item.outstanding > 0 ? C.warn : C.success }]}>
                  {fmtCurrency(item.outstanding)}
                </Text>
                <Text style={s.balLabel}>{item.outstanding > 0 ? 'Payable' : 'Cleared'}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={s.center}>
              <Ionicons name="business-outline" size={44} color={C.border} />
              <Text style={s.emptyText}>No suppliers found</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
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
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: C.brandBg, alignItems: 'center', justifyContent: 'center',
  },
  name: { fontSize: 14, fontWeight: '600', color: C.text },
  phone: { fontSize: 12, color: C.sub, marginTop: 2 },
  balance: { fontSize: 14, fontWeight: '700' },
  balLabel: { fontSize: 10, color: C.muted, marginTop: 2 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { color: C.muted, fontSize: 14, marginTop: 12 },
});
