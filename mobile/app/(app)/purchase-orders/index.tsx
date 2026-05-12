import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getPurchaseOrders, getSuppliers, fmtCurrency, fmtDate } from '@/lib/api';
import { C } from '@/lib/theme';

const STATUS_COLOR: Record<string, string> = { draft: '#64748b', sent: '#2563eb', received: '#059669' };
const STATUS_BG: Record<string, string> = { draft: '#f1f5f9', sent: '#dbeafe', received: '#d1fae5' };

export default function PurchaseOrdersScreen() {
  const router = useRouter();
  const [pos, setPos] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<Record<number, string>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [pList, supps] = await Promise.all([getPurchaseOrders(), getSuppliers()]);
      setPos(pList ?? []);
      const map: Record<number, string> = {};
      supps?.forEach((s: any) => { map[s.id] = s.name; });
      setSuppliers(map);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const filtered = pos.filter(p => !search || p.po_number?.toLowerCase().includes(search.toLowerCase()) || (suppliers[p.supplier_id] ?? '').toLowerCase().includes(search.toLowerCase()));

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}><Ionicons name="chevron-back" size={22} color={C.text} /></TouchableOpacity>
        <Text style={s.title}>Purchase Orders</Text>
        <Text style={s.count}>{filtered.length}</Text>
      </View>
      <View style={s.searchWrap}>
        <Ionicons name="search-outline" size={16} color={C.muted} style={{ marginRight: 8 }} />
        <TextInput style={s.searchInput} placeholder="Search POs..." placeholderTextColor={C.muted} value={search} onChangeText={setSearch} />
      </View>
      {loading ? <View style={s.center}><ActivityIndicator color={C.brand} /></View> : (
        <FlatList data={filtered} keyExtractor={p => String(p.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.card} onPress={() => router.push(`/(app)/purchase-orders/${item.id}`)}>
              <View style={s.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.num}>{item.po_number}</Text>
                  <Text style={s.supp}>{suppliers[item.supplier_id] ?? '—'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.amount}>{fmtCurrency(item.total)}</Text>
                  <View style={[s.badge, { backgroundColor: STATUS_BG[item.status] ?? '#f1f5f9' }]}>
                    <Text style={[s.badgeText, { color: STATUS_COLOR[item.status] ?? C.muted }]}>{item.status}</Text>
                  </View>
                </View>
              </View>
              <Text style={s.date}>{fmtDate(item.date)}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<View style={s.center}><Ionicons name="cart-outline" size={44} color={C.border} /><Text style={s.emptyText}>No purchase orders</Text></View>}
          contentContainerStyle={{ paddingBottom: 80 }}
        />
      )}
      <TouchableOpacity style={s.fab} onPress={() => router.push('/(app)/purchase-orders/create')}>
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
  num: { fontSize: 14, fontWeight: '700', color: C.text },
  supp: { fontSize: 12, color: C.sub, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '700', color: C.text },
  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, marginTop: 4 },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  date: { fontSize: 12, color: C.muted },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { color: C.muted, fontSize: 14, marginTop: 12 },
  fab: { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', elevation: 8 },
});
