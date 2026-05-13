import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/lib/theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface Module {
  label: string;
  icon: IoniconsName;
  route: string;
  color: string;
}

const MODULES: Module[] = [
  { label: 'Settings',         icon: 'settings-outline',       route: '/(app)/settings',          color: '#64748b' },
  { label: 'Reports',          icon: 'bar-chart-outline',      route: '/(app)/reports',           color: '#6366f1' },
  { label: 'Quotations',       icon: 'document-outline',       route: '/(app)/quotations',        color: '#0ea5e9' },
  { label: 'Delivery Notes',   icon: 'cube-outline',           route: '/(app)/delivery-notes',    color: '#10b981' },
  { label: 'Purchase Orders',  icon: 'cart-outline',           route: '/(app)/purchase-orders',   color: '#f59e0b' },
  { label: 'Payments',         icon: 'cash-outline',           route: '/(app)/payments',          color: '#22c55e' },
  { label: 'Supplier Bills',   icon: 'receipt-outline',        route: '/(app)/supplier-bills',    color: '#ef4444' },
  { label: 'Supplier Payments',icon: 'wallet-outline',         route: '/(app)/supplier-payments', color: '#f97316' },
  { label: 'Customer Ledger',  icon: 'book-outline',           route: '/(app)/ledger',            color: '#8b5cf6' },
  { label: 'Supplier Ledger',  icon: 'library-outline',        route: '/(app)/supplier-ledger',   color: '#ec4899' },
];

export default function MoreScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.title}>More</Text>
      </View>
      <ScrollView contentContainerStyle={s.grid} showsVerticalScrollIndicator={false}>
        {MODULES.map(m => (
          <TouchableOpacity
            key={m.route}
            style={s.tile}
            onPress={() => router.push(m.route as any)}
            activeOpacity={0.75}
          >
            <View style={[s.iconBox, { backgroundColor: m.color + '22' }]}>
              <Ionicons name={m.icon} size={28} color={m.color} />
            </View>
            <Text style={s.tileLabel}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8,
  },
  title: { fontSize: 22, fontWeight: '700', color: C.text },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 12,
  },
  tile: {
    width: '46%',
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    alignItems: 'center',
    gap: 10,
  },
  iconBox: {
    width: 56, height: 56, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  tileLabel: { fontSize: 13, fontWeight: '600', color: C.text, textAlign: 'center' },
});
