import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Modal, TextInput, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getSuppliers, getSupplier, getSupplierBills, getSupplierPayments, fmtCurrency, fmtDate } from '@/lib/api';
import { C } from '@/lib/theme';

interface LedgerRow { date: string; description: string; debit: number; credit: number; runningBalance: number; }

export default function SupplierLedgerScreen() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedName, setSelectedName] = useState('');
  const [openingBalance, setOpeningBalance] = useState(0);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [suppSearch, setSuppSearch] = useState('');

  useEffect(() => { getSuppliers().then(setSuppliers).catch(() => {}); }, []);

  const loadLedger = useCallback(async (suppId: number) => {
    setLoading(true);
    try {
      const [supp, bills, pays] = await Promise.all([
        getSupplier(suppId),
        getSupplierBills(suppId),
        getSupplierPayments(suppId),
      ]);
      const ob = supp?.opening_balance ?? 0;
      setOpeningBalance(ob);

      // Merge bills (debit = amount owed) and payments (credit = amount paid), sort by date
      const combined: LedgerRow[] = [
        ...(bills ?? []).map((b: any) => ({
          date: b.date ?? '', description: `Bill ${b.bill_number}`, debit: b.total ?? 0, credit: 0, runningBalance: 0,
        })),
        ...(pays ?? []).map((p: any) => ({
          date: p.date ?? '', description: `Payment ${p.payment_number}`, debit: 0, credit: p.amount ?? 0, runningBalance: 0,
        })),
      ].sort((a, b) => a.date.localeCompare(b.date));

      let balance = ob;
      for (const r of combined) {
        balance = balance + r.debit - r.credit;
        r.runningBalance = balance;
      }
      setRows(combined);
    } catch {}
    finally { setLoading(false); }
  }, []);

  const onSelect = (id: number, name: string) => {
    setSelectedId(id); setSelectedName(name);
    setShowPicker(false); setSuppSearch('');
    loadLedger(id);
  };

  const filteredSuppliers = suppSearch ? suppliers.filter(s => s.name?.toLowerCase().includes(suppSearch.toLowerCase())) : suppliers;

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const closingBalance = openingBalance + totalDebit - totalCredit;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}><Ionicons name="chevron-back" size={22} color={C.text} /></TouchableOpacity>
        <Text style={s.title}>Supplier Ledger</Text>
      </View>

      <TouchableOpacity style={s.pickerBtn} onPress={() => setShowPicker(true)}>
        <Ionicons name="business-outline" size={16} color={C.muted} />
        <Text style={[s.pickerTxt, !selectedName && { color: C.muted }]}>{selectedName || 'Select a supplier'}</Text>
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
              <Text style={s.summaryLabel}>Bills</Text>
              <Text style={[s.summaryValue, { color: '#ef4444' }]}>{fmtCurrency(totalDebit)}</Text>
            </View>
            <View style={s.summaryItem}>
              <Text style={s.summaryLabel}>Paid</Text>
              <Text style={[s.summaryValue, { color: '#059669' }]}>{fmtCurrency(totalCredit)}</Text>
            </View>
            <View style={s.summaryItem}>
              <Text style={s.summaryLabel}>Balance</Text>
              <Text style={[s.summaryValue, { color: closingBalance > 0 ? '#ef4444' : '#059669', fontWeight: '700' }]}>{fmtCurrency(closingBalance)}</Text>
            </View>
          </View>

          <View style={s.tableHeader}>
            <Text style={[s.th, { flex: 2 }]}>Date / Description</Text>
            <Text style={[s.th, { width: 70, textAlign: 'right' }]}>Bill</Text>
            <Text style={[s.th, { width: 70, textAlign: 'right' }]}>Paid</Text>
            <Text style={[s.th, { width: 80, textAlign: 'right' }]}>Balance</Text>
          </View>
          <FlatList
            data={rows}
            keyExtractor={(_, i) => String(i)}
            renderItem={({ item }) => (
              <View style={s.tableRow}>
                <View style={{ flex: 2 }}>
                  <Text style={s.tdDate}>{fmtDate(item.date)}</Text>
                  <Text style={s.tdDesc} numberOfLines={1}>{item.description}</Text>
                </View>
                <Text style={[s.td, { width: 70, color: item.debit ? '#ef4444' : C.muted }]}>
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
                <Ionicons name="library-outline" size={40} color={C.border} />
                <Text style={s.emptyText}>No transactions found</Text>
              </View>
            }
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        </>
      ) : loading ? (
        <View style={s.center}><ActivityIndicator color={C.brand} /></View>
      ) : (
        <View style={s.center}>
          <Ionicons name="library-outline" size={50} color={C.border} />
          <Text style={s.emptyText}>Select a supplier to view ledger</Text>
        </View>
      )}

      <Modal visible={showPicker} animationType="slide" transparent>
        <View style={s.modalBackdrop}>
          <View style={s.modalSheet}>
            <View style={s.modalNav}>
              <Text style={s.modalTitle}>Select Supplier</Text>
              <TouchableOpacity onPress={() => setShowPicker(false)}><Ionicons name="close" size={22} color={C.text} /></TouchableOpacity>
            </View>
            <View style={s.modalSearch}>
              <Ionicons name="search-outline" size={16} color={C.muted} />
              <TextInput style={s.modalSearchInput} placeholder="Search..." placeholderTextColor={C.muted} value={suppSearch} onChangeText={setSuppSearch} autoFocus />
            </View>
            <FlatList data={filteredSuppliers} keyExtractor={s => String(s.id)} keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity style={[s.listRow, selectedId === item.id && s.listRowSel]}
                  onPress={() => onSelect(item.id, item.name)}>
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
