import { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, FlatList, Modal, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getSuppliers, getSupplierBills, createSupplierPayment, fmtCurrency } from '@/lib/api';
import { C } from '@/lib/theme';

const METHODS = ['cash', 'bank', 'cheque', 'transfer'];

export default function SupplierPaymentCreateScreen() {
  const router = useRouter();

  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amountStr, setAmountStr] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [billId, setBillId] = useState<number | null>(null);
  const [billNum, setBillNum] = useState('');
  const [saving, setSaving] = useState(false);

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [suppSearch, setSuppSearch] = useState('');
  const [showSuppPicker, setShowSuppPicker] = useState(false);
  const [bills, setBills] = useState<any[]>([]);
  const [showBillPicker, setShowBillPicker] = useState(false);

  useEffect(() => { getSuppliers().then(setSuppliers).catch(() => {}); }, []);

  useEffect(() => {
    if (!supplierId) { setBills([]); setBillId(null); setBillNum(''); return; }
    getSupplierBills(supplierId).then(b => setBills((b ?? []).filter((x: any) => x.status !== 'paid'))).catch(() => {});
  }, [supplierId]);

  const save = async () => {
    const amount = parseFloat(amountStr);
    if (!amount || amount <= 0) { Alert.alert('Required', 'Enter a valid amount.'); return; }
    if (!supplierId) { Alert.alert('Required', 'Select a supplier.'); return; }
    setSaving(true);
    try {
      await createSupplierPayment({
        supplier_id: supplierId, date, amount,
        method, reference: reference || null, notes: notes || null,
        bill_id: billId,
      });
      router.back();
    } catch (e: any) { Alert.alert('Save failed', e.message); }
    finally { setSaving(false); }
  };

  const filteredSuppliers = suppSearch ? suppliers.filter(s => s.name?.toLowerCase().includes(suppSearch.toLowerCase())) : suppliers;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}><Ionicons name="chevron-back" size={22} color={C.text} /></TouchableOpacity>
        <Text style={s.navTitle}>Record Supplier Payment</Text>
        <TouchableOpacity onPress={save} disabled={saving} style={s.saveBtn}>
          {saving ? <ActivityIndicator color={C.brand} size="small" /> : <Text style={s.saveTxt}>Save</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <View style={s.card}>
            <Text style={s.cardTitle}>Payment Details</Text>

            <Text style={s.fieldLabel}>Supplier</Text>
            <TouchableOpacity style={s.pickerBtn} onPress={() => setShowSuppPicker(true)}>
              <Text style={[s.pickerTxt, !supplierName && { color: C.muted }]}>{supplierName || 'Select supplier'}</Text>
              <Ionicons name="chevron-down" size={16} color={C.muted} />
            </TouchableOpacity>

            <Field label="Date" value={date} onChange={setDate} placeholder="YYYY-MM-DD" keyboard="numeric" />
            <Field label="Amount (AED)" value={amountStr} onChange={setAmountStr} placeholder="0.00" keyboard="decimal-pad" />

            <Text style={s.fieldLabel}>Payment Method</Text>
            <View style={s.methodRow}>
              {METHODS.map(m => (
                <TouchableOpacity key={m} style={[s.methodBtn, method === m && s.methodBtnSel]} onPress={() => setMethod(m)}>
                  <Text style={[s.methodTxt, method === m && s.methodTxtSel]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Field label="Reference / Cheque No." value={reference} onChange={setReference} placeholder="Optional" />
            <Field label="Notes" value={notes} onChange={setNotes} placeholder="Optional" multiline />
          </View>

          {supplierId ? (
            <View style={s.card}>
              <Text style={s.cardTitle}>Link to Bill (Optional)</Text>
              <TouchableOpacity style={s.pickerBtn} onPress={() => setShowBillPicker(true)}>
                <Text style={[s.pickerTxt, !billNum && { color: C.muted }]}>{billNum || 'Select bill (optional)'}</Text>
                <Ionicons name="chevron-down" size={16} color={C.muted} />
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Supplier Picker */}
      <Modal visible={showSuppPicker} animationType="slide" transparent>
        <View style={s.modalBackdrop}>
          <View style={s.modalSheet}>
            <View style={s.modalNav}>
              <Text style={s.modalTitle}>Select Supplier</Text>
              <TouchableOpacity onPress={() => setShowSuppPicker(false)}><Ionicons name="close" size={22} color={C.text} /></TouchableOpacity>
            </View>
            <View style={s.modalSearch}>
              <Ionicons name="search-outline" size={16} color={C.muted} />
              <TextInput style={s.modalSearchInput} placeholder="Search..." placeholderTextColor={C.muted} value={suppSearch} onChangeText={setSuppSearch} autoFocus />
            </View>
            <FlatList data={filteredSuppliers} keyExtractor={s => String(s.id)} keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity style={[s.listRow, supplierId === item.id && s.listRowSel]}
                  onPress={() => { setSupplierId(item.id); setSupplierName(item.name); setShowSuppPicker(false); setSuppSearch(''); }}>
                  <Text style={[s.listRowTxt, supplierId === item.id && { color: C.brand }]}>{item.name}</Text>
                </TouchableOpacity>
              )} />
          </View>
        </View>
      </Modal>

      {/* Bill Picker */}
      <Modal visible={showBillPicker} animationType="slide" transparent>
        <View style={s.modalBackdrop}>
          <View style={s.modalSheet}>
            <View style={s.modalNav}>
              <Text style={s.modalTitle}>Link Bill</Text>
              <TouchableOpacity onPress={() => setShowBillPicker(false)}><Ionicons name="close" size={22} color={C.text} /></TouchableOpacity>
            </View>
            <TouchableOpacity style={s.listRow} onPress={() => { setBillId(null); setBillNum(''); setShowBillPicker(false); }}>
              <Text style={{ color: C.muted, fontStyle: 'italic', fontSize: 14 }}>— No bill —</Text>
            </TouchableOpacity>
            <FlatList data={bills} keyExtractor={b => String(b.id)} keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity style={[s.listRow, billId === item.id && s.listRowSel]}
                  onPress={() => { setBillId(item.id); setBillNum(item.bill_number ?? ''); setShowBillPicker(false); }}>
                  <Text style={[s.listRowTxt, billId === item.id && { color: C.brand }]}>{item.bill_number}</Text>
                  <Text style={{ fontSize: 12, color: C.muted }}>{fmtCurrency(item.balance_due)} due</Text>
                </TouchableOpacity>
              )} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, placeholder, keyboard, multiline }: any) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput style={[s.input, multiline && s.inputMulti]} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={C.muted} keyboardType={keyboard ?? 'default'} multiline={multiline} />
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  navbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, gap: 10 },
  navTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: C.text },
  saveBtn: { paddingHorizontal: 14, paddingVertical: 8 },
  saveTxt: { fontSize: 15, fontWeight: '700', color: C.brand },
  body: { padding: 16 },
  card: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 12, fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 },
  fieldLabel: { fontSize: 11, color: C.sub, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  input: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: C.text, fontSize: 14 },
  inputMulti: { minHeight: 70, textAlignVertical: 'top' },
  pickerBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 12 },
  pickerTxt: { fontSize: 14, color: C.text, flex: 1 },
  methodRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  methodBtn: { borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  methodBtnSel: { borderColor: C.brand, backgroundColor: C.brandBg },
  methodTxt: { fontSize: 13, color: C.sub, textTransform: 'capitalize' },
  methodTxtSel: { color: C.brand, fontWeight: '700' },
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
