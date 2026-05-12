import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { saveWorkspace } from '@/lib/storage';
import { testConnection, setApiConfig } from '@/lib/api';
import { C } from '@/lib/theme';

export default function LoginScreen() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [wsId, setWsId] = useState('');
  const [loading, setLoading] = useState(false);

  const connect = async () => {
    if (!url.trim() || !key.trim() || !wsId.trim()) {
      Alert.alert('Missing fields', 'Please fill in all three fields.');
      return;
    }
    setLoading(true);
    try {
      await testConnection(url.trim(), key.trim(), wsId.trim());
      const cfg = { url: url.trim(), anonKey: key.trim(), workspaceId: wsId.trim() };
      await saveWorkspace(cfg);
      setApiConfig(cfg);
      router.replace('/(app)/dashboard');
    } catch (e: any) {
      Alert.alert('Connection failed', e.message || 'Could not connect to Supabase.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
        {/* Logo */}
        <View style={s.logoWrap}>
          <View style={s.logoIcon}>
            <Ionicons name="bar-chart" size={36} color={C.brand} />
          </View>
          <Text style={s.logoText}>FinPilot</Text>
          <Text style={s.logoSub}>UAE Accounting — Mobile Companion</Text>
        </View>

        {/* Form */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Connect Workspace</Text>

          <Text style={s.label}>Supabase Project URL</Text>
          <TextInput
            style={s.input}
            placeholder="https://xxxx.supabase.co"
            placeholderTextColor={C.muted}
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <Text style={s.label}>API Key (Publishable or Anon)</Text>
          <TextInput
            style={s.input}
            placeholder="sb_publishable_... or eyJ..."
            placeholderTextColor={C.muted}
            value={key}
            onChangeText={setKey}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />

          <Text style={s.label}>Workspace ID</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. daralsalam-office"
            placeholderTextColor={C.muted}
            value={wsId}
            onChangeText={setWsId}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity
            style={[s.btn, loading && { opacity: 0.6 }]}
            onPress={connect}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnText}>Connect</Text>}
          </TouchableOpacity>
        </View>

        <Text style={s.hint}>
          Use the same credentials from your FinPilot desktop app's Cloud Backup settings.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  inner: { padding: 24, paddingTop: 60, flexGrow: 1, justifyContent: 'center' },
  logoWrap: { alignItems: 'center', marginBottom: 36 },
  logoIcon: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: C.brandBg,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  logoText: { fontSize: 28, fontWeight: '700', color: C.text },
  logoSub: { fontSize: 13, color: C.sub, marginTop: 4 },
  card: {
    backgroundColor: C.card, borderRadius: 16,
    borderWidth: 1, borderColor: C.border, padding: 20, marginBottom: 16,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: C.text, marginBottom: 20 },
  label: { fontSize: 12, color: C.sub, marginBottom: 6, fontWeight: '500' },
  input: {
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    color: C.text, fontSize: 14, marginBottom: 16,
  },
  btn: {
    backgroundColor: C.brand, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginTop: 4,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  hint: { textAlign: 'center', color: C.muted, fontSize: 12, lineHeight: 18 },
});
