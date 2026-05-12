import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View, Text, TextInput, ScrollView, FlatList, Modal, StyleSheet,
  TouchableOpacity, Switch, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  getCustomers, getInvoice, getInvoiceItems,
  createInvoice, updateInvoice, getNextInvoiceNumber,
  calcInvoiceTotals, InvoiceItemDraft, fmtCurrency,
} from '@/lib/api';
import { C } from '@/lib/theme';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LineItem extends InvoiceItemDraft {
  _key: number; // local React key
}

let _keyCounter = 0;
const newItem = (): LineItem => ({
  _key: ++_keyCounter,
  description: '', quantity: 1, unit_price: 0, vat_applicable: false,
});

// ── Screen ────────────────────────────────────────────────────────────────────

export default function InvoiceFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;
  const router = useRouter();

  // header fields
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [lpoNo, setLpoNo] = useState('');
  const [doNo, setDoNo] = useState('');
  const [notes, setNotes] = useState('');
  const [discountStr, setDiscountStr] = useState('0');
  const [isCash, setIsCash] = useState(false);
  const [includeStamp, setIncludeStamp] = useState(false);
  const [requireSig, setRequireSig] = useState(false);

  // line items
  const [items, setItems] = useState<LineItem[]>([newItem()]);

  // existing amount_paid (edit only)
  const [amountPaid, setAmountPaid] = useState(0);

  // UI state
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [custSearch, setCustSearch] = useState('');
  const [showCustPicker, setShowCustPicker] = useState(false);

  // ── Load data ───────────────────────────────────────────────────────────────

  useEffect(() => {
    getCustomers().then(setCustomers).catch(() => {});
  }, []);

  useEffect(() => {
    if (isEdit) {
      (async () => {
        try {
          const [inv, its] = await Promise.all([
            getInvoice(Number(id)), getInvoiceItems(Number(id)),
          ]);
          if (!inv) return;
          setInvoiceNumber(inv.invoice_number ?? '');
          setCustomerId(inv.customer_id ?? null);
          setDate(inv.date ?? '');
          setDueDate(inv.due_date ?? '');
          setLpoNo(inv.lpo_no ?? '');
          setDoNo(inv.do_no ?? '');
          setNotes(inv.notes ?? '');
          setDiscountStr(String(inv.discount ?? 0));
          setIsCash(!!(inv.is_cash));
          setIncludeStamp(!!(inv.include_stamp));
          setRequireSig(!!(inv.require_customer_signature));
          setAmountPaid(inv.amount_paid ?? 0);
          if (its?.length) {
            setItems(its.map((it: any) => ({
              _key: ++_keyCounter,
              description: it.description ?? '',
              quantity: it.quantity ?? 1,
              unit_price: it.unit_price ?? 0,
              vat_applicable: !!(it.vat_applicable),
            })));
          }
        } catch {}
        finally { setLoading(false); }
      })();
    } else {
      getNextInvoiceNumber().then(setInvoiceNumber).catch(() => {});
    }
  }, [id]);

  // resolve customer name for display
  useEffect(() => {
    if (!customerId || !customers.length) return;
    const c = customers.find(c => c.id === customerId);
    if (c) setCustomerName(c.name);
  }, [customerId, customers]);

  // ── Totals ──────────────────────────────────────────────────────────────────

  const discount = parseFloat(discountStr) || 0;
  const totals = useMemo(
    () => calcInvoiceTotals(items, discount),
    [items, discount],
  );

  // ── Save ────────────────────────────────────────────────────────────────────

  const save = async () => {
    if (!invoiceNumber.trim()) { Alert.alert('Required', 'Invoice number is required.'); return; }
    const validItems = items.filter(i => i.description.trim() && i.unit_price > 0);
    if (!validItems.length) { Alert.alert('Required', 'Add at least one item with a description and price.'); return; }

    setSaving(true);
    try {
      const invData = {
        invoice_number: invoiceNumber.trim(),
        customer_id: customerId,
        date, due_date: dueDate || null,
        lpo_no: lpoNo.trim() || null,
        do_no: doNo.trim() || null,
        notes: notes.trim() || null,
        discount,
        is_cash: isCash, include_stamp: includeStamp,
        require_customer_signature: requireSig,
        amount_paid: amountPaid,
      };
      if (isEdit) {
        await updateInvoice(Number(id), invData, validItems);
      } else {
        await createInvoice(invData, validItems);
      }
      router.back();
    } catch (e: any) {
      Alert.alert('Save failed', e.message || 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  // ── Item helpers ─────────────────────────────────────────────────────────────

  const addItem = () => setItems(prev => [...prev, newItem()]);
  const removeItem = (key: number) => setItems(prev => prev.filter(i => i._key !== key));
  const updateItem = useCallback((key: number, patch: Partial<LineItem>) => {
    setItems(prev => prev.map(i => i._key === key ? { ...i, ...patch } : i));
  }, []);

  // ── Customer picker ──────────────────────────────────────────────────────────

  const filteredCustomers = custSearch
    ? customers.filter(c => c.name?.toLowerCase().includes(custSearch.toLowerCase()))
    : customers;

  if (loading) return (
    <SafeAreaView style={[s.safe, { alignItems: 'center', justifyContent: 'center' }]}>
      <ActivityIndicator size="large" color={C.brand} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.safe}>
      {/* Navbar */}
      <View style={s.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={s.navTitle}>{isEdit ? 'Edit Invoice' : 'New Invoice'}</Text>
        <TouchableOpacity onPress={save} disabled={saving} style={s.saveBtn}>
          {saving
            ? <ActivityIndicator color={C.brand} size="small" />
            : <Text style={s.saveTxt}>Save</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">

          {/* ── Header fields ─────────────────────────────────────────── */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Invoice Details</Text>

            <Field label="Invoice #" value={invoiceNumber} onChange={setInvoiceNumber} placeholder="INV-0001" />

            {/* Customer picker */}
            <Text style={s.fieldLabel}>Customer</Text>
            <TouchableOpacity style={s.pickerBtn} onPress={() => setShowCustPicker(true)}>
              <Text style={[s.pickerTxt, !customerName && { color: C.muted }]}>
                {customerName || 'Select customer (optional)'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={C.muted} />
            </TouchableOpacity>

            <Field label="Invoice Date" value={date} onChange={setDate} placeholder="YYYY-MM-DD" keyboard="numeric" />
            <Field label="Due Date" value={dueDate} onChange={setDueDate} placeholder="YYYY-MM-DD (optional)" keyboard="numeric" />
            <Field label="LPO No." value={lpoNo} onChange={setLpoNo} placeholder="Local Purchase Order #" />
            <Field label="DO No." value={doNo} onChange={setDoNo} placeholder="Delivery Order #" />
          </View>

          {/* ── Line items ────────────────────────────────────────────── */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Items</Text>
            {items.map((item, idx) => (
              <ItemRow
                key={item._key}
                item={item}
                index={idx}
                onUpdate={updateItem}
                onRemove={() => removeItem(item._key)}
                canRemove={items.length > 1}
              />
            ))}
            <TouchableOpacity style={s.addItemBtn} onPress={addItem}>
              <Ionicons name="add-circle-outline" size={18} color={C.brand} />
              <Text style={s.addItemTxt}>Add Item</Text>
            </TouchableOpacity>
          </View>

          {/* ── Totals ────────────────────────────────────────────────── */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Totals</Text>
            <Field label="Discount (AED)" value={discountStr} onChange={setDiscountStr} placeholder="0.00" keyboard="decimal-pad" />
            <TotalRow label="Subtotal" value={fmtCurrency(totals.subtotal)} />
            {totals.vat_amount > 0 && <TotalRow label="VAT (5%)" value={fmtCurrency(totals.vat_amount)} />}
            {discount > 0 && <TotalRow label="Discount" value={`− ${fmtCurrency(discount)}`} />}
            <TotalRow label="Total" value={fmtCurrency(totals.total)} bold />
          </View>

          {/* ── Options ───────────────────────────────────────────────── */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Options</Text>
            <ToggleRow label="Cash Invoice" value={isCash} onChange={setIsCash} />
            <ToggleRow label="Include Stamp" value={includeStamp} onChange={setIncludeStamp} />
            <ToggleRow label="Require Customer Signature" value={requireSig} onChange={setRequireSig} />
            <Field label="Notes" value={notes} onChange={setNotes} placeholder="Payment terms, remarks…" multiline />
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Customer picker modal ──────────────────────────────────────── */}
      <Modal visible={showCustPicker} animationType="slide" transparent>
        <View style={s.modalBackdrop}>
          <View style={s.modalSheet}>
            <View style={s.modalNav}>
              <Text style={s.modalTitle}>Select Customer</Text>
              <TouchableOpacity onPress={() => setShowCustPicker(false)}>
                <Ionicons name="close" size={22} color={C.text} />
              </TouchableOpacity>
            </View>
            <View style={s.modalSearch}>
              <Ionicons name="search-outline" size={16} color={C.muted} />
              <TextInput
                style={s.modalSearchInput}
                placeholder="Search customers..."
                placeholderTextColor={C.muted}
                value={custSearch}
                onChangeText={setCustSearch}
                autoFocus
              />
            </View>
            {/* Clear selection */}
            <TouchableOpacity
              style={s.custRow}
              onPress={() => { setCustomerId(null); setCustomerName(''); setShowCustPicker(false); setCustSearch(''); }}
            >
              <Text style={{ color: C.muted, fontStyle: 'italic', fontSize: 14 }}>— No customer —</Text>
            </TouchableOpacity>
            <FlatList
              data={filteredCustomers}
              keyExtractor={c => String(c.id)}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[s.custRow, customerId === item.id && s.custRowSelected]}
                  onPress={() => {
                    setCustomerId(item.id);
                    setCustomerName(item.name);
                    setShowCustPicker(false);
                    setCustSearch('');
                  }}
                >
                  <Text style={[s.custName, customerId === item.id && { color: C.brand }]}>{item.name}</Text>
                  {item.phone ? <Text style={s.custPhone}>{item.phone}</Text> : null}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ItemRow({ item, index, onUpdate, onRemove, canRemove }: {
  item: LineItem; index: number;
  onUpdate: (key: number, patch: Partial<LineItem>) => void;
  onRemove: () => void; canRemove: boolean;
}) {
  const subtotal = item.quantity * item.unit_price;
  return (
    <View style={s.itemBox}>
      <View style={s.itemHeader}>
        <Text style={s.itemLabel}>Item {index + 1}</Text>
        {canRemove && (
          <TouchableOpacity onPress={onRemove}>
            <Ionicons name="trash-outline" size={18} color={C.err} />
          </TouchableOpacity>
        )}
      </View>
      <TextInput
        style={s.input}
        value={item.description}
        onChangeText={v => onUpdate(item._key, { description: v })}
        placeholder="Description"
        placeholderTextColor={C.muted}
      />
      <View style={s.itemRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.microLabel}>Qty</Text>
          <TextInput
            style={s.input}
            value={String(item.quantity)}
            onChangeText={v => onUpdate(item._key, { quantity: parseFloat(v) || 0 })}
            keyboardType="decimal-pad"
            placeholder="1"
            placeholderTextColor={C.muted}
          />
        </View>
        <View style={{ width: 10 }} />
        <View style={{ flex: 2 }}>
          <Text style={s.microLabel}>Unit Price (AED)</Text>
          <TextInput
            style={s.input}
            value={item.unit_price ? String(item.unit_price) : ''}
            onChangeText={v => onUpdate(item._key, { unit_price: parseFloat(v) || 0 })}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={C.muted}
          />
        </View>
      </View>
      <View style={s.itemFooter}>
        <View style={s.vatRow}>
          <Switch
            value={item.vat_applicable}
            onValueChange={v => onUpdate(item._key, { vat_applicable: v })}
            thumbColor={item.vat_applicable ? C.brand : C.muted}
            trackColor={{ false: C.border, true: C.brandBg }}
          />
          <Text style={s.vatLabel}>VAT 5%</Text>
        </View>
        <Text style={s.itemSubtotal}>{fmtCurrency(subtotal)}</Text>
      </View>
    </View>
  );
}

function Field({ label, value, onChange, placeholder, keyboard, multiline }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; keyboard?: any; multiline?: boolean;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={[s.input, multiline && s.inputMulti]}
        value={value} onChangeText={onChange}
        placeholder={placeholder} placeholderTextColor={C.muted}
        keyboardType={keyboard ?? 'default'} multiline={multiline}
        autoCapitalize={keyboard === 'email-address' ? 'none' : 'sentences'}
      />
    </View>
  );
}

function TotalRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={s.totalRow}>
      <Text style={[s.totalLabel, bold && { color: C.text, fontWeight: '700' }]}>{label}</Text>
      <Text style={[s.totalValue, bold && { color: C.text, fontWeight: '700', fontSize: 16 }]}>{value}</Text>
    </View>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={s.toggleRow}>
      <Text style={s.toggleLabel}>{label}</Text>
      <Switch
        value={value} onValueChange={onChange}
        thumbColor={value ? C.brand : C.muted}
        trackColor={{ false: C.border, true: C.brandBg }}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  navbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, gap: 10 },
  navTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: C.text },
  saveBtn: { paddingHorizontal: 14, paddingVertical: 8 },
  saveTxt: { fontSize: 15, fontWeight: '700', color: C.brand },
  body: { padding: 16 },

  card: {
    backgroundColor: C.card, borderRadius: 14, borderWidth: 1,
    borderColor: C.border, padding: 16, marginBottom: 12,
  },
  cardTitle: { fontSize: 12, fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 },

  fieldLabel: { fontSize: 11, color: C.sub, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  input: {
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    color: C.text, fontSize: 14,
  },
  inputMulti: { minHeight: 70, textAlignVertical: 'top' },

  pickerBtn: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 12,
  },
  pickerTxt: { fontSize: 14, color: C.text, flex: 1 },

  // Line items
  itemBox: {
    backgroundColor: C.bg, borderRadius: 10, borderWidth: 1,
    borderColor: C.border, padding: 12, marginBottom: 10,
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  itemLabel: { fontSize: 11, color: C.sub, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  itemRow: { flexDirection: 'row', marginTop: 8 },
  itemFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  microLabel: { fontSize: 10, color: C.muted, marginBottom: 4 },
  vatRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  vatLabel: { fontSize: 12, color: C.sub },
  itemSubtotal: { fontSize: 13, fontWeight: '700', color: C.text },

  addItemBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, justifyContent: 'center' },
  addItemTxt: { fontSize: 14, color: C.brand, fontWeight: '600' },

  // Totals
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderTopWidth: 1, borderTopColor: C.border },
  totalLabel: { fontSize: 13, color: C.sub },
  totalValue: { fontSize: 13, color: C.text },

  // Toggle
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  toggleLabel: { fontSize: 14, color: C.text },

  // Customer modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%' },
  modalNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  modalTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  modalSearch: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    margin: 12, paddingHorizontal: 12,
    backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.border,
  },
  modalSearchInput: { flex: 1, height: 40, color: C.text, fontSize: 14 },
  custRow: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  custRowSelected: { backgroundColor: C.brandBg },
  custName: { fontSize: 14, fontWeight: '600', color: C.text },
  custPhone: { fontSize: 12, color: C.muted, marginTop: 2 },
});
