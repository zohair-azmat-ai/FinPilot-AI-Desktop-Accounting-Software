import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet,
  TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  getCustomer, createCustomer, updateCustomer,
} from '@/lib/api';
import { C } from '@/lib/theme';

interface Form {
  name: string; phone: string; email: string;
  address: string; trn: string; po_box: string; opening_balance: string;
}

const EMPTY: Form = { name: '', phone: '', email: '', address: '', trn: '', po_box: '', opening_balance: '' };

export default function CustomerFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const c = await getCustomer(Number(id));
        if (c) setForm({
          name: c.name ?? '',
          phone: c.phone ?? '',
          email: c.email ?? '',
          address: c.address ?? '',
          trn: c.trn ?? '',
          po_box: c.po_box ?? '',
          opening_balance: String(c.opening_balance ?? ''),
        });
      } catch {}
      finally { setLoading(false); }
    })();
  }, [id]);

  const set = (key: keyof Form) => (val: string) => setForm(f => ({ ...f, [key]: val }));

  const save = async () => {
    if (!form.name.trim()) {
      Alert.alert('Required', 'Customer name is required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        trn: form.trn.trim() || null,
        po_box: form.po_box.trim() || null,
        opening_balance: parseFloat(form.opening_balance) || 0,
      };
      if (isEdit) {
        await updateCustomer(Number(id), payload);
      } else {
        await createCustomer(payload);
      }
      router.back();
    } catch (e: any) {
      Alert.alert('Save failed', e.message || 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <SafeAreaView style={[s.safe, { alignItems: 'center', justifyContent: 'center' }]}>
      <ActivityIndicator size="large" color={C.brand} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={s.navTitle}>{isEdit ? 'Edit Customer' : 'New Customer'}</Text>
        <TouchableOpacity onPress={save} disabled={saving} style={s.saveBtn}>
          {saving
            ? <ActivityIndicator color={C.brand} size="small" />
            : <Text style={s.saveTxt}>Save</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <Field label="Name *" value={form.name} onChange={set('name')} placeholder="Customer name" />
          <Field label="Phone" value={form.phone} onChange={set('phone')} placeholder="+971 XX XXX XXXX" keyboard="phone-pad" />
          <Field label="Email" value={form.email} onChange={set('email')} placeholder="email@example.com" keyboard="email-address" />
          <Field label="Address" value={form.address} onChange={set('address')} placeholder="Street, City, Country" multiline />
          <Field label="TRN" value={form.trn} onChange={set('trn')} placeholder="Tax Registration Number" />
          <Field label="P.O. Box" value={form.po_box} onChange={set('po_box')} placeholder="P.O. Box number" />
          <Field
            label={isEdit ? 'Opening Balance (AED)' : 'Opening Balance (AED)'}
            value={form.opening_balance} onChange={set('opening_balance')}
            placeholder="0.00" keyboard="decimal-pad"
          />
          {isEdit && (
            <Text style={s.hint}>
              Note: changing opening balance only affects future calculations. Existing invoices/payments are unchanged.
            </Text>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, placeholder, keyboard, multiline }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; keyboard?: any; multiline?: boolean;
}) {
  return (
    <View style={s.fieldWrap}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={[s.input, multiline && s.inputMulti]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        keyboardType={keyboard ?? 'default'}
        multiline={multiline}
        autoCapitalize={keyboard === 'email-address' ? 'none' : 'sentences'}
      />
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  navbar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
    paddingVertical: 12, gap: 10,
  },
  navTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: C.text },
  saveBtn: { paddingHorizontal: 14, paddingVertical: 8 },
  saveTxt: { fontSize: 15, fontWeight: '700', color: C.brand },
  body: { padding: 16 },
  fieldWrap: { marginBottom: 16 },
  fieldLabel: { fontSize: 12, color: C.sub, marginBottom: 6, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    color: C.text, fontSize: 15,
  },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  hint: { fontSize: 11, color: C.muted, marginTop: -8, marginBottom: 8, lineHeight: 16 },
});
