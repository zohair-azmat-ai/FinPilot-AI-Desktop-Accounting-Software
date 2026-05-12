import { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, TextInput, ScrollView, FlatList, Modal, StyleSheet, TouchableOpacity, Switch, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getCustomers, getQuotation, getQuotationItems, createQuotation, updateQuotation, getNextQuotationNumber, calcInvoiceTotals, LineItemDraft, fmtCurrency } from '@/lib/api';
import { C } from '@/lib/theme';

interface LineItem extends LineItemDraft { _key: number; }
let _kc = 0;
const newItem = (): LineItem => ({ _key: ++_kc, description: '', quantity: 1, unit_price: 0, vat_applicable: false });

export default function QuotationFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;
  const router = useRouter();

  const [quotationNumber, setQuotationNumber] = useState('');
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [delivery, setDelivery] = useState('');
  const [notes, setNotes] = useState('');
  const [discountStr, setDiscountStr] = useState('0');
  const [includeStamp, setIncludeStamp] = useState(false);
  const [letterhead, setLetterhead] = useState(true);
  const [items, setItems] = useState<LineItem[]>([newItem()]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [custSearch, setCustSearch] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => { getCustomers().then(setCustomers).catch(() => {}); }, []);

  useEffect(() => {
    if (isEdit) {
      (async () => {
        try {
          const [quot, its] = await Promise.all([getQuotation(Number(id)), getQuotationItems(Number(id))]);
          if (!quot) return;
          setQuotationNumber(quot.quotation_number ?? '');
          setCustomerId(quot.customer_id ?? null);
          setDate(quot.date ?? '');
          setValidUntil(quot.valid_until ?? '');
          setPaymentTerms(quot.payment_terms ?? '');
          setDelivery(quot.delivery ?? '');
          setNotes(quot.notes ?? '');
          setDiscountStr(String(quot.discount ?? 0));
          setIncludeStamp(!!(quot.include_stamp));
          setLetterhead(quot.letterhead !== false && quot.letterhead !== 0);
          if (its?.length) setItems(its.map((it: any) => ({ _key: ++_kc, description: it.description ?? '', quantity: it.quantity ?? 1, unit_price: it.unit_price ?? 0, vat_applicable: !!(it.vat_applicable) })));
        } catch {}
        finally { setLoading(false); }
      })();
    } else { getNextQuotationNumber().then(setQuotationNumber).catch(() => {}); }
  }, [id]);

  useEffect(() => {
    if (!customerId || !customers.length) return;
    const c = customers.find(c => c.id === customerId);
    if (c) setCustomerName(c.name);
  }, [customerId, customers]);

  const discount = parseFloat(discountStr) || 0;
  const totals = useMemo(() => calcInvoiceTotals(items, discount), [items, discount]);

  const save = async () => {
    if (!quotationNumber.trim()) { Alert.alert('Required', 'Quotation number is required.'); return; }
    const validItems = items.filter(i => i.description.trim() && i.unit_price > 0);
    if (!validItems.length) { Alert.alert('Required', 'Add at least one item.'); return; }
    setSaving(true);
    try {
      const qData = { quotation_number: quotationNumber.trim(), customer_id: customerId, date, valid_until: validUntil || null, payment_terms: paymentTerms || null, delivery: delivery || null, notes: notes || null, discount, include_stamp: includeStamp, letterhead };
      if (isEdit) await updateQuotation(Number(id), qData, validItems);
      else await createQuotation(qData, validItems);
      router.back();
    } catch (e: any) { Alert.alert('Save failed', e.message); }
    finally { setSaving(false); }
  };

  const addItem = () => setItems(p => [...p, newItem()]);
  const removeItem = (key: number) => setItems(p => p.filter(i => i._key !== key));
  const updateItem = useCallback((key: number, patch: Partial<LineItem>) => {
    setItems(p => p.map(i => i._key === key ? { ...i, ...patch } : i));
  }, []);

  const filteredCustomers = custSearch ? customers.filter(c => c.name?.toLowerCase().includes(custSearch.toLowerCase())) : customers;

  if (loading) return <SafeAreaView style={[s.safe, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator size="large" color={C.brand} /></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}><Ionicons name="chevron-back" size={22} color={C.text} /></TouchableOpacity>
        <Text style={s.navTitle}>{isEdit ? 'Edit Quotation' : 'New Quotation'}</Text>
        <TouchableOpacity onPress={save} disabled={saving} style={s.saveBtn}>
          {saving ? <ActivityIndicator color={C.brand} size="small" /> : <Text style={s.saveTxt}>Save</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <View style={s.card}>
            <Text style={s.cardTitle}>Quotation Details</Text>
            <Field label="Quotation #" value={quotationNumber} onChange={setQuotationNumber} placeholder="QUO-0001" />
            <Text style={s.fieldLabel}>Customer</Text>
            <TouchableOpacity style={s.pickerBtn} onPress={() => setShowPicker(true)}>
              <Text style={[s.pickerTxt, !customerName && { color: C.muted }]}>{customerName || 'Select customer (optional)'}</Text>
              <Ionicons name="chevron-down" size={16} color={C.muted} />
            </TouchableOpacity>
            <Field label="Date" value={date} onChange={setDate} placeholder="YYYY-MM-DD" keyboard="numeric" />
            <Field label="Valid Until" value={validUntil} onChange={setValidUntil} placeholder="YYYY-MM-DD (optional)" keyboard="numeric" />
            <Field label="Payment Terms" value={paymentTerms} onChange={setPaymentTerms} placeholder="e.g. 30 days net" />
            <Field label="Delivery" value={delivery} onChange={setDelivery} placeholder="e.g. 2 weeks" />
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>Items</Text>
            {items.map((item, idx) => (
              <ItemRow key={item._key} item={item} index={idx} onUpdate={updateItem} onRemove={() => removeItem(item._key)} canRemove={items.length > 1} />
            ))}
            <TouchableOpacity style={s.addItemBtn} onPress={addItem}>
              <Ionicons name="add-circle-outline" size={18} color={C.brand} />
              <Text style={s.addItemTxt}>Add Item</Text>
            </TouchableOpacity>
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>Totals</Text>
            <Field label="Discount (AED)" value={discountStr} onChange={setDiscountStr} placeholder="0.00" keyboard="decimal-pad" />
            <TRow label="Subtotal" value={fmtCurrency(totals.subtotal)} />
            {totals.vat_amount > 0 && <TRow label="VAT (5%)" value={fmtCurrency(totals.vat_amount)} />}
            {discount > 0 && <TRow label="Discount" value={`− ${fmtCurrency(discount)}`} />}
            <TRow label="Total" value={fmtCurrency(totals.total)} bold />
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>Options</Text>
            <Toggle label="Print Letterhead" value={letterhead} onChange={setLetterhead} />
            <Toggle label="Include Stamp" value={includeStamp} onChange={setIncludeStamp} />
            <Field label="Notes" value={notes} onChange={setNotes} placeholder="Terms, remarks…" multiline />
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

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
            <TouchableOpacity style={s.custRow} onPress={() => { setCustomerId(null); setCustomerName(''); setShowPicker(false); setCustSearch(''); }}>
              <Text style={{ color: C.muted, fontStyle: 'italic', fontSize: 14 }}>— No customer —</Text>
            </TouchableOpacity>
            <FlatList data={filteredCustomers} keyExtractor={c => String(c.id)} keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity style={[s.custRow, customerId === item.id && s.custRowSel]}
                  onPress={() => { setCustomerId(item.id); setCustomerName(item.name); setShowPicker(false); setCustSearch(''); }}>
                  <Text style={[s.custName, customerId === item.id && { color: C.brand }]}>{item.name}</Text>
                </TouchableOpacity>
              )} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ItemRow({ item, index, onUpdate, onRemove, canRemove }: { item: any; index: number; onUpdate: any; onRemove: any; canRemove: boolean }) {
  return (
    <View style={s.itemBox}>
      <View style={s.itemHeader}>
        <Text style={s.itemLabel}>Item {index + 1}</Text>
        {canRemove && <TouchableOpacity onPress={onRemove}><Ionicons name="trash-outline" size={18} color={C.err} /></TouchableOpacity>}
      </View>
      <TextInput style={s.input} value={item.description} onChangeText={v => onUpdate(item._key, { description: v })} placeholder="Description" placeholderTextColor={C.muted} />
      <View style={s.itemRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.microLabel}>Qty</Text>
          <TextInput style={s.input} value={String(item.quantity)} onChangeText={v => onUpdate(item._key, { quantity: parseFloat(v) || 0 })} keyboardType="decimal-pad" placeholderTextColor={C.muted} />
        </View>
        <View style={{ width: 10 }} />
        <View style={{ flex: 2 }}>
          <Text style={s.microLabel}>Unit Price (AED)</Text>
          <TextInput style={s.input} value={item.unit_price ? String(item.unit_price) : ''} onChangeText={v => onUpdate(item._key, { unit_price: parseFloat(v) || 0 })} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={C.muted} />
        </View>
      </View>
      <View style={s.itemFooter}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Switch value={item.vat_applicable} onValueChange={v => onUpdate(item._key, { vat_applicable: v })} thumbColor={item.vat_applicable ? C.brand : C.muted} trackColor={{ false: C.border, true: C.brandBg }} />
          <Text style={{ fontSize: 12, color: C.sub }}>VAT 5%</Text>
        </View>
        <Text style={s.itemSubtotal}>{fmtCurrency(item.quantity * item.unit_price)}</Text>
      </View>
    </View>
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
function TRow({ label, value, bold }: any) {
  return <View style={s.totalRow}><Text style={[s.totalLabel, bold && { color: C.text, fontWeight: '700' }]}>{label}</Text><Text style={[s.totalValue, bold && { color: C.text, fontWeight: '700', fontSize: 16 }]}>{value}</Text></View>;
}
function Toggle({ label, value, onChange }: any) {
  return <View style={s.toggleRow}><Text style={s.toggleLabel}>{label}</Text><Switch value={value} onValueChange={onChange} thumbColor={value ? C.brand : C.muted} trackColor={{ false: C.border, true: C.brandBg }} /></View>;
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
  itemBox: { backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 10 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  itemLabel: { fontSize: 11, color: C.sub, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  itemRow: { flexDirection: 'row', marginTop: 8 },
  itemFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  microLabel: { fontSize: 10, color: C.muted, marginBottom: 4 },
  itemSubtotal: { fontSize: 13, fontWeight: '700', color: C.text },
  addItemBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, justifyContent: 'center' },
  addItemTxt: { fontSize: 14, color: C.brand, fontWeight: '600' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderTopWidth: 1, borderTopColor: C.border },
  totalLabel: { fontSize: 13, color: C.sub },
  totalValue: { fontSize: 13, color: C.text },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  toggleLabel: { fontSize: 14, color: C.text },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%' },
  modalNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  modalTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  modalSearch: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, paddingHorizontal: 12, backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  modalSearchInput: { flex: 1, height: 40, color: C.text, fontSize: 14 },
  custRow: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  custRowSel: { backgroundColor: C.brandBg },
  custName: { fontSize: 14, fontWeight: '600', color: C.text },
});
