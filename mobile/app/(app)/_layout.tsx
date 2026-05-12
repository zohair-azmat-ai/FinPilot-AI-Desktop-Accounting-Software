import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/lib/theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function tab(name: string, label: string, icon: IoniconsName, iconActive: IoniconsName) {
  return (
    <Tabs.Screen
      key={name}
      name={name}
      options={{
        title: label,
        tabBarIcon: ({ color, focused }) => (
          <Ionicons name={focused ? iconActive : icon} size={22} color={color} />
        ),
      }}
    />
  );
}

function hidden(name: string) {
  return <Tabs.Screen key={name} name={name} options={{ href: null }} />;
}

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: C.card,
          borderTopColor: C.border,
          borderTopWidth: 1,
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: C.brand,
        tabBarInactiveTintColor: C.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      {tab('dashboard',  'Dashboard', 'home-outline',      'home')}
      {tab('invoices',   'Invoices',  'receipt-outline',   'receipt')}
      {tab('customers',  'Customers', 'people-outline',    'people')}
      {tab('suppliers',  'Suppliers', 'business-outline',  'business')}
      {tab('more',       'More',      'grid-outline',      'grid')}

      {/* Hidden routes — accessible via router.push, not shown in tab bar */}
      {hidden('reports')}
      {hidden('quotations')}
      {hidden('delivery-notes')}
      {hidden('purchase-orders')}
      {hidden('payments')}
      {hidden('supplier-bills')}
      {hidden('supplier-payments')}
      {hidden('ledger')}
      {hidden('supplier-ledger')}
    </Tabs>
  );
}
