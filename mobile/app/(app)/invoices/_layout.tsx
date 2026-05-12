import { Stack } from 'expo-router';
import { C } from '@/lib/theme';
export default function InvoicesLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }} />;
}
