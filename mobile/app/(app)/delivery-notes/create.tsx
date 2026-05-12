import { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, ScrollView, FlatList, Modal, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getCustomers, getDeliveryNote, getDeliveryNoteItems, createDeliveryNote, updateDeliveryNote, getNextDNNumber, DNItemDraft } from '@/lib/api';
import { C } from '@/lib/theme';

interface DNItem extends DNItemDraft { _key: number; }
let _kc = 0;
const newItem = (): DNItem => ({ _key: ++_kc, description: '', quantity: 1, remarks: '' });

export default function DeliveryNoteFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;
  const router = useRouter();

  const [dnNumber, setDnNumber] = useState('');
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState('');
  const [status, setStatus] = useState('draft');
  const [items, setItems] = useState<DNItem[]>([newItem()]);
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
          const [d, its] = await Promise.all([getDeliveryNote(Number(id)), getDeliveryNoteItems(Number(id))]);
          if (!d) return;
          setDnNumber(d.dn_number ?? ''); setCustomerId(d.customer_id ?? null);
          setDate(d.date ?? ''); setRemarks(d.remarks ?? ''); setStatus(d.status ?? 'draft');
          if (its?.length) setItems(its.map((it: any) => ({ _key: ++_kc, description: it.description ?? '', quantity: it.quantity ?? 1, remarks: it.remarks ?? '' })));
        } catch {}
        finally { setLoading(false); }
      })();
    } else { getNextDNNumber().then(setDnNumber).catch(() => {}); }
  }, [id]);

  useEffect(() => {
    if (!customerId || !customers.length) return;
    const c = customers.find(c => c.id === customerId);
    if (c) setCustomerName(c.name);
  }, [customerId, customers]);

  const save = async () => {
    if (!dnNumber.trim()) { Alert.alert('Required', 'DN number is required.'); return; }
    const validItems = items.filter(i => i.description.trim());
    if (!validItems.length) { Alert.alert('Required', 'Add at least one item.'); return; }
    setSaving(true);
    try {
      const dnData = { dn_number: dnNumber.trim(), customer_id: customerId, date, remarks: remarks || null, status };
      if (isEdit) await updateDeliveryNote(Number(id), dnData, validItems);
      else await createDeliveryNote(dnData, validItems);
      router.back();
    } catch (e: any) { Alert.alert('Save failed', e.message); }
    finally { setSaving(false); }
  };

  const addItem = () => setItems(p => [...p, newItem()]);
  const removeItem = (key: number) => setItems(p => p.filter(i => i._key !== key));
  const updateItem = useCallback((key: number, patch: Partial<DNItem>) => {
    setItems(p => p.map(i => i._key === key ? { ...i, ...patch } : i));
  }, []);

  const filteredCustomers = custSearch ? customers.filter(c => c.name?.toLowerCase().includes(custSearch.toLowerCase())) : customers;

  if (loading) return <SafeAreaView style={[s.safe, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator size="large" color={C.brand} /></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}><Ionicons name="chevron-back" size={22} color={C.text} /></TouchableOpacity>
        <Text style={s.navTitle}>{isEdit ? 'Edit Delivery Note' : 'New Delivery Note'}</Text>
        <TouchableOpacity onPress={save} disabled={saving} style={s.saveBtn}>
          {saving ? <ActivityIndicator color={C.brand} size="small" /> : <Text style={s.saveTxt}>Save</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <View style={s.card}>
            <Text style={s.cardTitle}>Details</Text>
            <Field label="DN Number" value={dnNumber} onChange={setDnNumber} placeholder="DN-0001" />
            <Text style={s.fieldLabel}>Customer</Text>
            <TouchableOpacity style={s.pickerBtn} onPress={() => setShowPicker(true)}>
              <Text style={[s.pickerTxt, !customerName && { color: C.muted }]}>{customerName || 'Select customer (optional)'}</Text>
              <Ionicons name="chevron-down" size={16} color={C.muted} />
            </TouchableOpacity>
            <Field label="Date" value={date} onChange={setDate} placeholder="YYYY-MM-DD" keyboard="numeric" />
            <Field label="Remarks" value={remarks} onChange={setRemarks} placeholder="General remarks…" multiline />
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>Items</Text>
            {items.map((item, idx) => (
              <View key={item._key} style={s.itemBox}>
                <View style={s.itemHeader}>
                  <Text style={s.itemLabel}>Item {idx + 1}</Text>
                  {items.length > 1 && <TouchableOpacity onPress={() => removeItem(item._key)}><Ionicons name="trash-outline" size={18} color={C.err} /></TouchableOpacity>}
                </View>
                <TextInput style={s.input} value={item.description} onChangeText={v => updateItem(item._key, { description: v })} placeholder="Description" placeholderTextColor={C.muted} />
                <View style={{ flexDirection: 'row', marginTop: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.microLabel}>Qty</Text>
                    <TextInput style={s.input} value={String(item.quantity)} onChangeText={v => updateItem(item._key, { quantity: parseFloat(v) || 0 })} keyboardType="decimal-pad" placeholderTextColor={C.muted} />
                  </View>
                  <View style={{ width: 10 }} />
                  <View style={{ flex: 2 }}>
                    <Text style={s.microLabel}>Remarks</Text>
                    <TextInput style={s.input} value={item.remarks ?? ''} onChangeText={v => updateItem(item._key, { remarks: v })} placeholder="Optional" placeholderTextColor={C.muted} />
                  </View>
                </View>
              </View>
            ))}
            <TouchableOpacity style={s.addItemBtn} onPress={addItem}>
              <Ionicons name="add-circle-outline" size={18} color={C.brand} />
              <Text style={s.addItemTxt}>Add Item</Text>
            </TouchableOpacity>
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
  itemBox: { backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 10 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  itemLabel: { fontSize: 11, color: C.sub, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  microLabel: { fontSize: 10, color: C.muted, marginBottom: 4 },
  addItemBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, justifyContent: 'center' },
  addItemTxt: { fontSize: 14, color: C.brand, fontWeight: '600' },
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
