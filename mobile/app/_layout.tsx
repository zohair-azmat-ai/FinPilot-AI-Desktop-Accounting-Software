import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { loadWorkspace, WorkspaceConfig } from '@/lib/storage';
import { setApiConfig } from '@/lib/api';
import { C } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    (async () => {
      const cfg = await loadWorkspace();
      if (cfg) {
        setApiConfig(cfg);
        setAuthed(true);
      }
      setReady(true);
      SplashScreen.hideAsync();
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const inApp = segments[0] === '(app)';
    if (authed && !inApp) router.replace('/(app)/dashboard');
    if (!authed && inApp) router.replace('/');
  }, [ready, authed, segments]);

  return (
    <>
      <StatusBar style="light" backgroundColor={C.bg} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(app)" />
      </Stack>
    </>
  );
}
