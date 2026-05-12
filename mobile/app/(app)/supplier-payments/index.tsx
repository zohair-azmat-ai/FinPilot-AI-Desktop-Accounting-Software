import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getSupplierPayments, getSuppliers, deleteSupplierPayment, fmtCurrency, fmtDate } from '@/lib/api';
import { C } from '@/lib/theme';

const METHOD_COLOR: Record<string, string> = { cash: '#059669', bank: '#2563eb', cheque: '#f59e0b', transfer: '#6366f1' };
const METHOD_BG: Record<string, string> = { cash: '#d1fae5', bank: '#dbeafe', cheque: '#fef3c7', transfer: '#ede9fe' };

export default function SupplierPaymentsScreen() {
  const router = useRouter();
  const [payments, setPayments] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<Record<number, string>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [pays, supps] = await Promise.all([getSupplierPayments(), getSuppliers()]);
      setPayments(pays ?? []);
      const map: Record<number, string> = {};
      supps?.forEach((s: any) => { map[s.id] = s.name; });
      setSuppliers(map);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const filtered = payments.filter(p =>
    !search ||
    (p.payment_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (suppliers[p.supplier_id] ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (p.reference ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = (item: any) => {
    Alert.alert('Delete', `Delete payment ${item.payment_number}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try { await deleteSupplierPayment(item.id); load(); }
          catch (e: any) { Alert.alert('Error', e.message); }
        }
      },
    ]);
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}><Ionicons name="chevron-back" size={22} color={C.text} /></TouchableOpacity>
        <Text style={s.title}>Supplier Payments</Text>
        <Text style={s.count}>{filtered.length}</Text>
      </View>
      <View style={s.searchWrap}>
        <Ionicons name="search-outline" size={16} color={C.muted} style={{ marginRight: 8 }} />
        <TextInput style={s.searchInput} placeholder="Search payments..." placeholderTextColor={C.muted} value={search} onChangeText={setSearch} />
      </View>
      {loading ? <View style={s.center}><ActivityIndicator color={C.brand} /></View> : (
        <FlatList data={filtered} keyExtractor={p => String(p.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.brand} />}
          renderItem={({ item }) => (
            <View style={s.card}>
              <View style={s.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.num}>{item.payment_number ?? '—'}</Text>
                  <Text style={s.sub}>{suppliers[item.supplier_id] ?? '—'}</Text>
                  {item.reference ? <Text style={s.ref}>Ref: {item.reference}</Text> : null}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.amount}>{fmtCurrency(item.amount)}</Text>
                  <View style={[s.badge, { backgroundColor: METHOD_BG[item.method] ?? '#f1f5f9' }]}>
                    <Text style={[s.badgeText, { color: METHOD_COLOR[item.method] ?? C.muted }]}>{item.method ?? 'cash'}</Text>
                  </View>
                </View>
              </View>
              <View style={s.cardBottom}>
                <Text style={s.date}>{fmtDate(item.date)}</Text>
                <TouchableOpacity onPress={() => handleDelete(item)} style={{ padding: 4 }}>
                  <Ionicons name="trash-outline" size={18} color={C.err} />
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={<View style={s.center}><Ionicons name="wallet-outline" size={44} color={C.border} /><Text style={s.emptyText}>No supplier payments</Text></View>}
          contentContainerStyle={{ paddingBottom: 80 }}
        />
      )}
      <TouchableOpacity style={s.fab} onPress={() => router.push('/(app)/supplier-payments/create')}>
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
  cardTop: { flexDirection: 'row', marginBottom: 8 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  num: { fontSize: 14, fontWeight: '700', color: C.text },
  sub: { fontSize: 12, color: C.sub, marginTop: 2 },
  ref: { fontSize: 11, color: C.muted, marginTop: 1 },
  amount: { fontSize: 15, fontWeight: '700', color: '#ef4444' },
  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, marginTop: 4 },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  date: { fontSize: 12, color: C.muted },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { color: C.muted, fontSize: 14, marginTop: 12 },
  fab: { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', elevation: 8 },
});
