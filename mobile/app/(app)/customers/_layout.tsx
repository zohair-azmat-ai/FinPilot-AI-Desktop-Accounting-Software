import { Stack } from 'expo-router';
import { C } from '@/lib/theme';
export default function CustomersLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }} />;
}
