import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Modal, TextInput, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getCustomers, getCustomer, getLedgerEntries, fmtCurrency, fmtDate } from '@/lib/api';
import { C } from '@/lib/theme';

export default function CustomerLedgerScreen() {
  const router = useRouter();
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedName, setSelectedName] = useState('');
  const [openingBalance, setOpeningBalance] = useState(0);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState('');
  const [custSearch, setCustSearch] = useState('');

  useEffect(() => { getCustomers().then(setCustomers).catch(() => {}); }, []);

  const loadLedger = useCallback(async (custId: number) => {
    setLoading(true);
    try {
      const [cust, rows] = await Promise.all([getCustomer(custId), getLedgerEntries(custId)]);
      setOpeningBalance(cust?.opening_balance ?? 0);
      setEntries(rows ?? []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  const onSelectCustomer = (id: number, name: string) => {
    setSelectedId(id); setSelectedName(name);
    setShowPicker(false); setCustSearch('');
    loadLedger(id);
  };

  const filteredCustomers = custSearch ? customers.filter(c => c.name?.toLowerCase().includes(custSearch.toLowerCase())) : customers;

  // Compute running balance
  let runningBalance = openingBalance;
  const rows = entries.map(e => {
    const debit = e.debit ?? 0;
    const credit = e.credit ?? 0;
    runningBalance = runningBalance + debit - credit;
    return { ...e, runningBalance };
  });

  const totalDebit = entries.reduce((s, e) => s + (e.debit ?? 0), 0);
  const totalCredit = entries.reduce((s, e) => s + (e.credit ?? 0), 0);
  const closingBalance = openingBalance + totalDebit - totalCredit;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}><Ionicons name="chevron-back" size={22} color={C.text} /></TouchableOpacity>
        <Text style={s.title}>Customer Ledger</Text>
      </View>

      <TouchableOpacity style={s.pickerBtn} onPress={() => setShowPicker(true)}>
        <Ionicons name="person-outline" size={16} color={C.muted} />
        <Text style={[s.pickerTxt, !selectedName && { color: C.muted }]}>{selectedName || 'Select a customer'}</Text>
        <Ionicons name="chevron-down" size={16} color={C.muted} />
      </TouchableOpacity>

      {selectedId && !loading ? (
        <>
          <View style={s.summaryCard}>
            <View style={s.summaryItem}>
              <Text style={s.summaryLabel}>Opening</Text>
              <Text style={s.summaryValue}>{fmtCurrency(openingBalance)}</Text>
            </View>
            <View style={s.summaryItem}>
              <Text style={s.summaryLabel}>Invoiced</Text>
              <Text style={[s.summaryValue, { color: C.brand }]}>{fmtCurrency(totalDebit)}</Text>
            </View>
            <View style={s.summaryItem}>
              <Text style={s.summaryLabel}>Received</Text>
              <Text style={[s.summaryValue, { color: '#059669' }]}>{fmtCurrency(totalCredit)}</Text>
            </View>
            <View style={s.summaryItem}>
              <Text style={s.summaryLabel}>Balance</Text>
              <Text style={[s.summaryValue, { color: closingBalance > 0 ? C.brand : '#059669', fontWeight: '700' }]}>{fmtCurrency(closingBalance)}</Text>
            </View>
          </View>

          <View style={s.tableHeader}>
            <Text style={[s.th, { flex: 2 }]}>Date / Description</Text>
            <Text style={[s.th, { width: 70, textAlign: 'right' }]}>Debit</Text>
            <Text style={[s.th, { width: 70, textAlign: 'right' }]}>Credit</Text>
            <Text style={[s.th, { width: 80, textAlign: 'right' }]}>Balance</Text>
          </View>
          <FlatList
            data={rows}
            keyExtractor={(_, i) => String(i)}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={() => selectedId && loadLedger(selectedId)} tintColor={C.brand} />}
            renderItem={({ item }) => (
              <View style={s.tableRow}>
                <View style={{ flex: 2 }}>
                  <Text style={s.tdDate}>{fmtDate(item.date)}</Text>
                  <Text style={s.tdDesc} numberOfLines={1}>{item.description ?? ''}</Text>
                </View>
                <Text style={[s.td, { width: 70, color: item.debit ? C.brand : C.muted }]}>
                  {item.debit ? fmtCurrency(item.debit) : '—'}
                </Text>
                <Text style={[s.td, { width: 70, color: item.credit ? '#059669' : C.muted }]}>
                  {item.credit ? fmtCurrency(item.credit) : '—'}
                </Text>
                <Text style={[s.td, { width: 80, fontWeight: '600' }]}>{fmtCurrency(item.runningBalance)}</Text>
              </View>
            )}
            ListEmptyComponent={
              <View style={s.empty}>
                <Ionicons name="book-outline" size={40} color={C.border} />
                <Text style={s.emptyText}>No ledger entries</Text>
              </View>
            }
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        </>
      ) : loading ? (
        <View style={s.center}><ActivityIndicator color={C.brand} /></View>
      ) : (
        <View style={s.center}>
          <Ionicons name="book-outline" size={50} color={C.border} />
          <Text style={s.emptyText}>Select a customer to view ledger</Text>
        </View>
      )}

      <Modal visible={showPicker} animationType="slide" transparent>
        <View style={s.modalBackdrop}>
          <View style={s.modalSheet}>
            <View style={s.modalNav}>
              <Text style={s.modalTitle}>Select Customer</Text>
              <TouchableOpacity onPress={() => setShowPicker(false)}><Ionicons name="close" size={22} color={C.text} /></TouchableOpacity>
            </View>
            <View style={s.modalSearch}>
              <Ionicons name="search-outline" size={16} color={C.muted} />
              <TextInput style={s.modalSearchInput} placeholder="Search..." placeholderTextColor={C.muted} value={custSearch} onChangeText={setCustSearch} autoFocus />
            </View>
            <FlatList data={filteredCustomers} keyExtractor={c => String(c.id)} keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity style={[s.listRow, selectedId === item.id && s.listRowSel]}
                  onPress={() => onSelectCustomer(item.id, item.name)}>
                  <Text style={[s.listRowTxt, selectedId === item.id && { color: C.brand }]}>{item.name}</Text>
                </TouchableOpacity>
              )} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, gap: 8 },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: C.text },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 12, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 13 },
  pickerTxt: { flex: 1, fontSize: 14, color: C.text },
  summaryCard: { flexDirection: 'row', backgroundColor: C.card, marginHorizontal: 16, marginBottom: 10, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 12 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.3 },
  summaryValue: { fontSize: 12, fontWeight: '600', color: C.text, marginTop: 2 },
  tableHeader: { flexDirection: 'row', backgroundColor: C.card, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  th: { fontSize: 10, fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: 0.3 },
  tableRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border, alignItems: 'center' },
  tdDate: { fontSize: 11, color: C.sub },
  tdDesc: { fontSize: 12, color: C.text, fontWeight: '500', marginTop: 1 },
  td: { fontSize: 11, color: C.text, textAlign: 'right' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { color: C.muted, fontSize: 14, marginTop: 12 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%' },
  modalNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  modalTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  modalSearch: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, paddingHorizontal: 12, backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  modalSearchInput: { flex: 1, height: 40, color: C.text, fontSize: 14 },
  listRow: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  listRowSel: { backgroundColor: C.brandBg },
  listRowTxt: { fontSize: 14, fontWeight: '600', color: C.text },
});
