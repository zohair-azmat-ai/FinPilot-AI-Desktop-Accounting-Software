import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getSupplierBills, getSuppliers, fmtCurrency, fmtDate } from '@/lib/api';
import { C } from '@/lib/theme';

const STATUS_COLOR: Record<string, string> = { unpaid: '#ef4444', partial: '#f59e0b', paid: '#059669' };
const STATUS_BG: Record<string, string> = { unpaid: '#fee2e2', partial: '#fef3c7', paid: '#d1fae5' };

export default function SupplierBillsScreen() {
  const router = useRouter();
  const [bills, setBills] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<Record<number, string>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [bList, supps] = await Promise.all([getSupplierBills(), getSuppliers()]);
      setBills(bList ?? []);
      const map: Record<number, string> = {};
      supps?.forEach((s: any) => { map[s.id] = s.name; });
      setSuppliers(map);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const filtered = bills.filter(b =>
    !search ||
    (b.bill_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (suppliers[b.supplier_id] ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}><Ionicons name="chevron-back" size={22} color={C.text} /></TouchableOpacity>
        <Text style={s.title}>Supplier Bills</Text>
        <Text style={s.count}>{filtered.length}</Text>
      </View>
      <View style={s.searchWrap}>
        <Ionicons name="search-outline" size={16} color={C.muted} style={{ marginRight: 8 }} />
        <TextInput style={s.searchInput} placeholder="Search bills..." placeholderTextColor={C.muted} value={search} onChangeText={setSearch} />
      </View>
      {loading ? <View style={s.center}><ActivityIndicator color={C.brand} /></View> : (
        <FlatList data={filtered} keyExtractor={b => String(b.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.card} onPress={() => router.push(`/(app)/supplier-bills/${item.id}`)}>
              <View style={s.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.num}>{item.bill_number}</Text>
                  <Text style={s.supp}>{suppliers[item.supplier_id] ?? '—'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.amount}>{fmtCurrency(item.total)}</Text>
                  <View style={[s.badge, { backgroundColor: STATUS_BG[item.status] ?? '#f1f5f9' }]}>
                    <Text style={[s.badgeText, { color: STATUS_COLOR[item.status] ?? C.muted }]}>{item.status}</Text>
                  </View>
                </View>
              </View>
              <View style={s.cardBottom}>
                <Text style={s.date}>{fmtDate(item.date)}</Text>
                {(item.balance_due ?? 0) > 0 ? <Text style={s.due}>Due: {fmtCurrency(item.balance_due)}</Text> : null}
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<View style={s.center}><Ionicons name="receipt-outline" size={44} color={C.border} /><Text style={s.emptyText}>No supplier bills</Text></View>}
          contentContainerStyle={{ paddingBottom: 80 }}
        />
      )}
      <TouchableOpacity style={s.fab} onPress={() => router.push('/(app)/supplier-bills/create')}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, gap: 8 },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: C.text },
  count: { fontSize: 12, color: C.sub },
  searchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 10, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12 },
  searchInput: { flex: 1, height: 40, color: C.text, fontSize: 14 },
  card: { backgroundColor: C.card, marginHorizontal: 16, marginBottom: 10, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14 },
  cardTop: { flexDirection: 'row', marginBottom: 6 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  num: { fontSize: 14, fontWeight: '700', color: C.text },
  supp: { fontSize: 12, color: C.sub, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '700', color: C.text },
  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, marginTop: 4 },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  date: { fontSize: 12, color: C.muted },
  due: { fontSize: 12, color: '#ef4444', fontWeight: '600' },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { color: C.muted, fontSize: 14, marginTop: 12 },
  fab: { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', elevation: 8 },
});
