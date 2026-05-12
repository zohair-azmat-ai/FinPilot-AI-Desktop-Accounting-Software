import { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, ScrollView, FlatList, Modal, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getCustomers, getInvoicesByCustomer, createPayment, fmtCurrency } from '@/lib/api';
import { C } from '@/lib/theme';

const METHODS = ['cash', 'bank', 'cheque', 'transfer'];

export default function PaymentCreateScreen() {
  const router = useRouter();

  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amountStr, setAmountStr] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [invoiceId, setInvoiceId] = useState<number | null>(null);
  const [invoiceNum, setInvoiceNum] = useState('');
  const [saving, setSaving] = useState(false);

  const [customers, setCustomers] = useState<any[]>([]);
  const [custSearch, setCustSearch] = useState('');
  const [showCustPicker, setShowCustPicker] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [showInvPicker, setShowInvPicker] = useState(false);

  useEffect(() => { getCustomers().then(setCustomers).catch(() => {}); }, []);

  useEffect(() => {
    if (!customerId) { setInvoices([]); setInvoiceId(null); setInvoiceNum(''); return; }
    getInvoicesByCustomer(customerId).then(inv => setInvoices(inv ?? [])).catch(() => {});
  }, [customerId]);

  const save = async () => {
    const amount = parseFloat(amountStr);
    if (!amount || amount <= 0) { Alert.alert('Required', 'Enter a valid amount.'); return; }
    if (!customerId) { Alert.alert('Required', 'Select a customer.'); return; }
    setSaving(true);
    try {
      await createPayment({
        customer_id: customerId, date, amount,
        method, reference: reference || null, notes: notes || null,
        invoice_id: invoiceId,
      });
      router.back();
    } catch (e: any) { Alert.alert('Save failed', e.message); }
    finally { setSaving(false); }
  };

  const filteredCustomers = custSearch ? customers.filter(c => c.name?.toLowerCase().includes(custSearch.toLowerCase())) : customers;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}><Ionicons name="chevron-back" size={22} color={C.text} /></TouchableOpacity>
        <Text style={s.navTitle}>Record Payment</Text>
        <TouchableOpacity onPress={save} disabled={saving} style={s.saveBtn}>
          {saving ? <ActivityIndicator color={C.brand} size="small" /> : <Text style={s.saveTxt}>Save</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <View style={s.card}>
            <Text style={s.cardTitle}>Payment Details</Text>

            <Text style={s.fieldLabel}>Customer</Text>
            <TouchableOpacity style={s.pickerBtn} onPress={() => setShowCustPicker(true)}>
              <Text style={[s.pickerTxt, !customerName && { color: C.muted }]}>{customerName || 'Select customer'}</Text>
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

          {customerId ? (
            <View style={s.card}>
              <Text style={s.cardTitle}>Link to Invoice (Optional)</Text>
              <TouchableOpacity style={s.pickerBtn} onPress={() => setShowInvPicker(true)}>
                <Text style={[s.pickerTxt, !invoiceNum && { color: C.muted }]}>{invoiceNum || 'Select invoice (optional)'}</Text>
                <Ionicons name="chevron-down" size={16} color={C.muted} />
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Customer Picker */}
      <Modal visible={showCustPicker} animationType="slide" transparent>
        <View style={s.modalBackdrop}>
          <View style={s.modalSheet}>
            <View style={s.modalNav}>
              <Text style={s.modalTitle}>Select Customer</Text>
              <TouchableOpacity onPress={() => setShowCustPicker(false)}><Ionicons name="close" size={22} color={C.text} /></TouchableOpacity>
            </View>
            <View style={s.modalSearch}>
              <Ionicons name="search-outline" size={16} color={C.muted} />
              <TextInput style={s.modalSearchInput} placeholder="Search..." placeholderTextColor={C.muted} value={custSearch} onChangeText={setCustSearch} autoFocus />
            </View>
            <FlatList data={filteredCustomers} keyExtractor={c => String(c.id)} keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity style={[s.listRow, customerId === item.id && s.listRowSel]}
                  onPress={() => { setCustomerId(item.id); setCustomerName(item.name); setShowCustPicker(false); setCustSearch(''); }}>
                  <Text style={[s.listRowTxt, customerId === item.id && { color: C.brand }]}>{item.name}</Text>
                </TouchableOpacity>
              )} />
          </View>
        </View>
      </Modal>

      {/* Invoice Picker */}
      <Modal visible={showInvPicker} animationType="slide" transparent>
        <View style={s.modalBackdrop}>
          <View style={s.modalSheet}>
            <View style={s.modalNav}>
              <Text style={s.modalTitle}>Link Invoice</Text>
              <TouchableOpacity onPress={() => setShowInvPicker(false)}><Ionicons name="close" size={22} color={C.text} /></TouchableOpacity>
            </View>
            <TouchableOpacity style={s.listRow} onPress={() => { setInvoiceId(null); setInvoiceNum(''); setShowInvPicker(false); }}>
              <Text style={{ color: C.muted, fontStyle: 'italic', fontSize: 14 }}>— No invoice —</Text>
            </TouchableOpacity>
            <FlatList data={invoices} keyExtractor={i => String(i.id)} keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity style={[s.listRow, invoiceId === item.id && s.listRowSel]}
                  onPress={() => { setInvoiceId(item.id); setInvoiceNum(item.invoice_number ?? ''); setShowInvPicker(false); }}>
                  <Text style={[s.listRowTxt, invoiceId === item.id && { color: C.brand }]}>{item.invoice_number}</Text>
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
  navTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: C.text },
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
