import { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, TextInput, ScrollView, FlatList, Modal, StyleSheet, TouchableOpacity, Switch, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getSuppliers, getPurchaseOrder, getPurchaseOrderItems, createPurchaseOrder, updatePurchaseOrder, getNextPONumber, calcInvoiceTotals, LineItemDraft, fmtCurrency } from '@/lib/api';
import { C } from '@/lib/theme';

interface LineItem extends LineItemDraft { _key: number; }
let _kc = 0;
const newItem = (): LineItem => ({ _key: ++_kc, description: '', quantity: 1, unit_price: 0, vat_applicable: false });

export default function PurchaseOrderFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;
  const router = useRouter();

  const [poNumber, setPoNumber] = useState('');
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [deliveryDate, setDeliveryDate] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [deliveryTerms, setDeliveryTerms] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('draft');
  const [items, setItems] = useState<LineItem[]>([newItem()]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [suppSearch, setSuppSearch] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => { getSuppliers().then(setSuppliers).catch(() => {}); }, []);

  useEffect(() => {
    if (isEdit) {
      (async () => {
        try {
          const [po, its] = await Promise.all([getPurchaseOrder(Number(id)), getPurchaseOrderItems(Number(id))]);
          if (!po) return;
          setPoNumber(po.po_number ?? '');
          setSupplierId(po.supplier_id ?? null);
          setDate(po.date ?? '');
          setDeliveryDate(po.delivery_date ?? '');
          setPaymentTerms(po.payment_terms ?? '');
          setDeliveryTerms(po.delivery_terms ?? '');
          setNotes(po.notes ?? '');
          setStatus(po.status ?? 'draft');
          if (its?.length) setItems(its.map((it: any) => ({ _key: ++_kc, description: it.description ?? '', quantity: it.quantity ?? 1, unit_price: it.unit_price ?? 0, vat_applicable: !!(it.vat_applicable) })));
        } catch {}
        finally { setLoading(false); }
      })();
    } else { getNextPONumber().then(setPoNumber).catch(() => {}); }
  }, [id]);

  useEffect(() => {
    if (!supplierId || !suppliers.length) return;
    const s = suppliers.find(s => s.id === supplierId);
    if (s) setSupplierName(s.name);
  }, [supplierId, suppliers]);

  const totals = useMemo(() => calcInvoiceTotals(items, 0), [items]);

  const save = async () => {
    if (!poNumber.trim()) { Alert.alert('Required', 'PO number is required.'); return; }
    const validItems = items.filter(i => i.description.trim() && i.unit_price > 0);
    if (!validItems.length) { Alert.alert('Required', 'Add at least one item.'); return; }
    setSaving(true);
    try {
      const poData = {
        po_number: poNumber.trim(), supplier_id: supplierId, date,
        delivery_date: deliveryDate || null, payment_terms: paymentTerms || null,
        delivery_terms: deliveryTerms || null, notes: notes || null, status,
      };
      if (isEdit) await updatePurchaseOrder(Number(id), poData, validItems);
      else await createPurchaseOrder(poData, validItems);
      router.back();
    } catch (e: any) { Alert.alert('Save failed', e.message); }
    finally { setSaving(false); }
  };

  const addItem = () => setItems(p => [...p, newItem()]);
  const removeItem = (key: number) => setItems(p => p.filter(i => i._key !== key));
  const updateItem = useCallback((key: number, patch: Partial<LineItem>) => {
    setItems(p => p.map(i => i._key === key ? { ...i, ...patch } : i));
  }, []);

  const filteredSuppliers = suppSearch ? suppliers.filter(s => s.name?.toLowerCase().includes(suppSearch.toLowerCase())) : suppliers;

  if (loading) return <SafeAreaView style={[s.safe, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator size="large" color={C.brand} /></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}><Ionicons name="chevron-back" size={22} color={C.text} /></TouchableOpacity>
        <Text style={s.navTitle}>{isEdit ? 'Edit Purchase Order' : 'New Purchase Order'}</Text>
        <TouchableOpacity onPress={save} disabled={saving} style={s.saveBtn}>
          {saving ? <ActivityIndicator color={C.brand} size="small" /> : <Text style={s.saveTxt}>Save</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <View style={s.card}>
            <Text style={s.cardTitle}>Order Details</Text>
            <Field label="PO Number" value={poNumber} onChange={setPoNumber} placeholder="PO-0001" />
            <Text style={s.fieldLabel}>Supplier</Text>
            <TouchableOpacity style={s.pickerBtn} onPress={() => setShowPicker(true)}>
              <Text style={[s.pickerTxt, !supplierName && { color: C.muted }]}>{supplierName || 'Select supplier (optional)'}</Text>
              <Ionicons name="chevron-down" size={16} color={C.muted} />
            </TouchableOpacity>
            <Field label="Date" value={date} onChange={setDate} placeholder="YYYY-MM-DD" keyboard="numeric" />
            <Field label="Delivery Date" value={deliveryDate} onChange={setDeliveryDate} placeholder="YYYY-MM-DD (optional)" keyboard="numeric" />
            <Field label="Payment Terms" value={paymentTerms} onChange={setPaymentTerms} placeholder="e.g. 30 days net" />
            <Field label="Delivery Terms" value={deliveryTerms} onChange={setDeliveryTerms} placeholder="e.g. FOB, CIF" />
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
            <TRow label="Subtotal" value={fmtCurrency(totals.subtotal)} />
            {totals.vat_amount > 0 && <TRow label="VAT (5%)" value={fmtCurrency(totals.vat_amount)} />}
            <TRow label="Total" value={fmtCurrency(totals.total)} bold />
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>Notes</Text>
            <Field label="Notes" value={notes} onChange={setNotes} placeholder="Terms, remarks…" multiline />
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

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
            <TouchableOpacity style={s.suppRow} onPress={() => { setSupplierId(null); setSupplierName(''); setShowPicker(false); setSuppSearch(''); }}>
              <Text style={{ color: C.muted, fontStyle: 'italic', fontSize: 14 }}>— No supplier —</Text>
            </TouchableOpacity>
            <FlatList data={filteredSuppliers} keyExtractor={s => String(s.id)} keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity style={[s.suppRow, supplierId === item.id && s.suppRowSel]}
                  onPress={() => { setSupplierId(item.id); setSupplierName(item.name); setShowPicker(false); setSuppSearch(''); }}>
                  <Text style={[s.suppName, supplierId === item.id && { color: C.brand }]}>{item.name}</Text>
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
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%' },
  modalNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  modalTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  modalSearch: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, paddingHorizontal: 12, backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  modalSearchInput: { flex: 1, height: 40, color: C.text, fontSize: 14 },
  suppRow: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  suppRowSel: { backgroundColor: C.brandBg },
  suppName: { fontSize: 14, fontWeight: '600', color: C.text },
});
