import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getDeliveryNote, getDeliveryNoteItems, getCustomer, deleteDeliveryNote, fmtDate } from '@/lib/api';
import { downloadAndSharePDF } from '@/lib/pdf';
import { C } from '@/lib/theme';

export default function DeliveryNoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [dn, setDn] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const d = await getDeliveryNote(Number(id));
        if (!d) return;
        const [its, cust] = await Promise.all([
          getDeliveryNoteItems(d.id),
          d.customer_id ? getCustomer(d.customer_id) : Promise.resolve(null),
        ]);
        setDn(d); setItems(its ?? []); setCustomer(cust);
      } catch (e: any) { Alert.alert('Error', e.message); }
      finally { setLoading(false); }
    })();
  }, [id]);

  const shareAsPDF = async () => {
    setSharing(true);
    try {
      await downloadAndSharePDF(
        `/api/delivery-notes/${id}/pdf`,
        `DeliveryNote_${dn.dn_number}.pdf`,
      );
    } finally {
      setSharing(false);
    }
  };

  if (loading) return <SafeAreaView style={[s.safe, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator size="large" color={C.brand} /></SafeAreaView>;
  if (!dn) return <SafeAreaView style={s.safe}><Text style={s.err}>Delivery note not found.</Text></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}><Ionicons name="chevron-back" size={22} color={C.text} /></TouchableOpacity>
        <Text style={s.navTitle}>{dn.dn_number}</Text>
        <TouchableOpacity style={{ padding: 4 }} onPress={() => router.push(`/(app)/delivery-notes/create?id=${dn.id}`)}>
          <Ionicons name="create-outline" size={22} color={C.brand} />
        </TouchableOpacity>
        <TouchableOpacity style={{ padding: 4 }} onPress={() =>
          Alert.alert('Delete', `Delete ${dn.dn_number}?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => { try { await deleteDeliveryNote(dn.id); router.back(); } catch (e: any) { Alert.alert('Error', e.message); } } },
          ])
        }>
          <Ionicons name="trash-outline" size={22} color={C.err} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.actionRow}>
          <TouchableOpacity style={s.actionBtn} onPress={shareAsPDF} disabled={sharing}>
            <Ionicons name="document-text-outline" size={18} color={C.brand} />
            <Text style={s.actionText}>{sharing ? 'Fetching…' : 'Share PDF'}</Text>
          </TouchableOpacity>
        </View>

        <View style={s.card}>
          <Row label="Customer" value={customer?.name ?? '—'} />
          <Row label="Date" value={fmtDate(dn.date)} />
          <Row label="Status" value={dn.status ?? '—'} />
          {dn.remarks ? <Row label="Remarks" value={dn.remarks} /> : null}
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>Items</Text>
          {items.map((it, idx) => (
            <View key={idx} style={s.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.itemDesc}>{it.description}</Text>
                {it.remarks ? <Text style={s.itemSub}>{it.remarks}</Text> : null}
              </View>
              <Text style={s.itemQty}>×{it.quantity}</Text>
            </View>
          ))}
        </View>
        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <View style={s.row}><Text style={s.rowLabel}>{label}</Text><Text style={s.rowValue}>{value}</Text></View>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  navbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, gap: 10 },
  navTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: C.text },
  actionRow: { flexDirection: 'row', gap: 12, marginHorizontal: 16, marginBottom: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.brand },
  actionText: { fontSize: 14, fontWeight: '600', color: C.brand },
  card: { backgroundColor: C.card, marginHorizontal: 16, marginBottom: 12, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: C.sub, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  rowLabel: { fontSize: 13, color: C.sub },
  rowValue: { fontSize: 13, color: C.text, fontWeight: '500', flex: 1, textAlign: 'right' },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  itemDesc: { fontSize: 13, color: C.text, fontWeight: '500' },
  itemSub: { fontSize: 11, color: C.muted, marginTop: 2 },
  itemQty: { fontSize: 14, fontWeight: '700', color: C.brand, marginLeft: 8 },
  err: { color: C.err, textAlign: 'center', marginTop: 40, fontSize: 15 },
});
