import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  getInvoice, getInvoiceItems, getCustomer, getCompany,
  deleteInvoice, fmtCurrency, fmtDate,
} from '@/lib/api';
import { downloadAndSharePDF } from '@/lib/pdf';
import { C, STATUS_COLOR, STATUS_BG } from '@/lib/theme';

export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [invoice, setInvoice] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [customer, setCustomer] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const inv = await getInvoice(Number(id));
        if (!inv) return;
        const [its, cust, comp] = await Promise.all([
          getInvoiceItems(inv.id),
          inv.customer_id ? getCustomer(inv.customer_id) : Promise.resolve(null),
          getCompany(),
        ]);
        setInvoice(inv);
        setItems(its ?? []);
        setCustomer(cust);
        setCompany(comp);
      } catch (e: any) {
        Alert.alert('Error', e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const shareAsPDF = async () => {
    setSharing(true);
    try {
      await downloadAndSharePDF(
        `/api/invoices/${id}/pdf`,
        `Invoice_${invoice.invoice_number}.pdf`,
      );
    } finally {
      setSharing(false);
    }
  };

  const shareViaWhatsApp = async () => {
    const text =
      `*${company?.name ?? 'FinPilot'} — TAX INVOICE*\n` +
      `Invoice #: ${invoice.invoice_number}\n` +
      `Date: ${fmtDate(invoice.date)}\n` +
      `Customer: ${customer?.name ?? '—'}\n` +
      `Total: ${fmtCurrency(invoice.total)}\n` +
      `Balance Due: ${fmtCurrency(invoice.balance_due)}\n` +
      `Status: ${invoice.status?.toUpperCase()}`;
    Share.share({ message: text });
  };

  if (loading) return (
    <SafeAreaView style={[s.safe, { alignItems: 'center', justifyContent: 'center' }]}>
      <ActivityIndicator size="large" color={C.brand} />
    </SafeAreaView>
  );
  if (!invoice) return (
    <SafeAreaView style={s.safe}>
      <Text style={s.err}>Invoice not found.</Text>
    </SafeAreaView>
  );

  const statusColor = STATUS_COLOR[invoice.status] ?? C.text;
  const statusBg = STATUS_BG[invoice.status] ?? C.brandBg;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={s.navTitle}>{invoice.invoice_number}</Text>
        <View style={[s.badge, { backgroundColor: statusBg }]}>
          <Text style={[s.badgeText, { color: statusColor }]}>{invoice.status}</Text>
        </View>
        <TouchableOpacity
          style={{ padding: 4 }}
          onPress={() => router.push(`/(app)/invoices/create?id=${invoice.id}`)}
        >
          <Ionicons name="create-outline" size={22} color={C.brand} />
        </TouchableOpacity>
        <TouchableOpacity
          style={{ padding: 4 }}
          onPress={() => Alert.alert(
            'Delete Invoice',
            `Delete ${invoice.invoice_number}? This cannot be undone.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete', style: 'destructive',
                onPress: async () => {
                  try { await deleteInvoice(invoice.id); router.back(); }
                  catch (e: any) { Alert.alert('Error', e.message); }
                },
              },
            ],
          )}
        >
          <Ionicons name="trash-outline" size={22} color={C.err} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.actionRow}>
          <TouchableOpacity style={s.actionBtn} onPress={shareAsPDF} disabled={sharing}>
            <Ionicons name="document-text-outline" size={18} color={C.brand} />
            <Text style={s.actionText}>{sharing ? 'Generating…' : 'Share PDF'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, { borderColor: '#25D366' }]} onPress={shareViaWhatsApp}>
            <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
            <Text style={[s.actionText, { color: '#25D366' }]}>WhatsApp</Text>
          </TouchableOpacity>
        </View>

        <View style={s.card}>
          <Row label="Customer" value={customer?.name ?? '—'} />
          {customer?.phone ? <Row label="Phone" value={customer.phone} /> : null}
          {customer?.trn ? <Row label="TRN" value={customer.trn} /> : null}
          <Row label="Invoice Date" value={fmtDate(invoice.date)} />
          {invoice.due_date ? <Row label="Due Date" value={fmtDate(invoice.due_date)} /> : null}
          {invoice.lpo_no ? <Row label="LPO No." value={invoice.lpo_no} /> : null}
          {invoice.do_no ? <Row label="DO No." value={invoice.do_no} /> : null}
          {invoice.is_cash ? <Row label="Type" value="Cash Invoice" /> : null}
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>Items</Text>
          {items.map((item, idx) => (
            <View key={idx} style={s.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.itemDesc}>{item.description}</Text>
                <Text style={s.itemSub}>
                  {item.quantity} × {fmtCurrency(item.unit_price)}
                  {item.vat_applicable ? '  +5% VAT' : ''}
                </Text>
              </View>
              <Text style={s.itemTotal}>{fmtCurrency(item.total)}</Text>
            </View>
          ))}

          <View style={s.divider} />
          <TotalRow label="Subtotal" value={fmtCurrency(invoice.subtotal)} />
          {(invoice.vat_amount ?? 0) > 0 && <TotalRow label="VAT (5%)" value={fmtCurrency(invoice.vat_amount)} />}
          {(invoice.discount ?? 0) > 0 && <TotalRow label="Discount" value={`− ${fmtCurrency(invoice.discount)}`} />}
          <TotalRow label="Total" value={fmtCurrency(invoice.total)} bold />
          {(invoice.amount_paid ?? 0) > 0 && (
            <>
              <TotalRow label="Amount Paid" value={fmtCurrency(invoice.amount_paid)} color={C.success} />
              <TotalRow label="Balance Due" value={fmtCurrency(invoice.balance_due)} color={C.err} bold />
            </>
          )}
        </View>

        {invoice.notes ? (
          <View style={s.card}>
            <Text style={s.sectionTitle}>Notes</Text>
            <Text style={s.notes}>{invoice.notes}</Text>
          </View>
        ) : null}

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

function TotalRow({ label, value, bold, color }: any) {
  return (
    <View style={s.totalRow}>
      <Text style={[s.totalLabel, bold && { fontWeight: '700', color: C.text }]}>{label}</Text>
      <Text style={[s.totalValue, bold && { fontWeight: '700', fontSize: 16, color: C.text }, color && { color }]}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  navbar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
    paddingVertical: 12, gap: 10,
  },
  backBtn: { padding: 4 },
  navTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: C.text },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  actionRow: { flexDirection: 'row', gap: 12, marginHorizontal: 16, marginBottom: 12 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, borderRadius: 12,
    backgroundColor: C.card, borderWidth: 1.5, borderColor: C.brand,
  },
  actionText: { fontSize: 14, fontWeight: '600', color: C.brand },
  card: {
    backgroundColor: C.card, marginHorizontal: 16, marginBottom: 12,
    borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16,
  },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: C.sub, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  rowLabel: { fontSize: 13, color: C.sub },
  rowValue: { fontSize: 13, color: C.text, fontWeight: '500', flex: 1, textAlign: 'right' },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  itemDesc: { fontSize: 13, color: C.text, fontWeight: '500' },
  itemSub: { fontSize: 11, color: C.muted, marginTop: 2 },
  itemTotal: { fontSize: 13, fontWeight: '600', color: C.text },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  totalLabel: { fontSize: 13, color: C.sub },
  totalValue: { fontSize: 13, color: C.text },
  notes: { fontSize: 13, color: C.sub, lineHeight: 20 },
  err: { color: C.err, textAlign: 'center', marginTop: 40, fontSize: 15 },
});
