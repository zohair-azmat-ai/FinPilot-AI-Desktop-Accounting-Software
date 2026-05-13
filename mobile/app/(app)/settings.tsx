import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { loadWorkspace, saveWorkspace, clearWorkspace } from '@/lib/storage';
import { setApiConfig, testConnection, testBackendUrl } from '@/lib/api';
import { C } from '@/lib/theme';

type Status = 'idle' | 'checking' | 'ok' | 'err';

export default function SettingsScreen() {
  const router = useRouter();

  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [wsId, setWsId] = useState('');
  const [backendUrl, setBackendUrl] = useState('');

  const [supaStatus, setSupaStatus] = useState<Status>('idle');
  const [backendStatus, setBackendStatus] = useState<Status>('idle');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const HF_DEFAULT = 'https://zohairazmat-finpilot-ai-backend.hf.space';

  useEffect(() => {
    loadWorkspace().then(cfg => {
      if (!cfg) {
        setBackendUrl(HF_DEFAULT);
        return;
      }
      setUrl(cfg.url);
      setKey(cfg.anonKey);
      setWsId(cfg.workspaceId);
      setBackendUrl(cfg.backendUrl ?? HF_DEFAULT);
    });
  }, []);

  const checkStatus = useCallback(async () => {
    if (!url.trim() || !key.trim() || !wsId.trim()) return;
    setSupaStatus('checking');
    setBackendStatus('idle');
    try {
      await testConnection(url.trim(), key.trim(), wsId.trim());
      setSupaStatus('ok');
    } catch {
      setSupaStatus('err');
    }
    if (backendUrl.trim()) {
      setBackendStatus('checking');
      try {
        await testBackendUrl(backendUrl.trim());
        setBackendStatus('ok');
      } catch {
        setBackendStatus('err');
      }
    }
  }, [url, key, wsId, backendUrl]);

  const saveConnection = async () => {
    if (!url.trim() || !key.trim() || !wsId.trim()) {
      Alert.alert('Missing fields', 'Supabase URL, API Key and Workspace ID are required.');
      return;
    }
    setSaving(true);
    try {
      await testConnection(url.trim(), key.trim(), wsId.trim());
      const cfg = {
        url: url.trim(),
        anonKey: key.trim(),
        workspaceId: wsId.trim(),
        backendUrl: backendUrl.trim() || undefined,
      };
      await saveWorkspace(cfg);
      setApiConfig(cfg);
      setSupaStatus('ok');
      Alert.alert('Saved', 'Connection settings saved successfully.');
    } catch (e: any) {
      setSupaStatus('err');
      Alert.alert('Connection failed', e.message || 'Could not connect to Supabase.');
    } finally {
      setSaving(false);
    }
  };

  const testBackend = async () => {
    if (!backendUrl.trim()) {
      Alert.alert('No URL', 'Enter a Cloud PDF Backend URL first.');
      return;
    }
    setBackendStatus('checking');
    try {
      await testBackendUrl(backendUrl.trim());
      setBackendStatus('ok');
      Alert.alert('Backend reachable', `${backendUrl.trim()} responded successfully.`);
    } catch (e: any) {
      setBackendStatus('err');
      Alert.alert(
        'Backend unreachable',
        `Could not reach ${backendUrl.trim()}.\n\nIf using Hugging Face Space:\n• Ensure the Space is running (may take 30s to wake)\n• Check SUPABASE_URL and SUPABASE_KEY are set in Space secrets\n\nIf using local PC:\n• Ensure FinPilot desktop is open\n• Phone and PC must be on the same Wi-Fi`,
      );
    }
  };

  const resync = async () => {
    setSyncing(true);
    try {
      await testConnection(url.trim(), key.trim(), wsId.trim());
      Alert.alert('Sync complete', 'Data will refresh when you pull down on any list screen.');
    } catch (e: any) {
      Alert.alert('Sync failed', e.message);
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = () => {
    Alert.alert(
      'Disconnect Workspace',
      'This removes your local connection settings. Your cloud data in Supabase is NOT deleted.\n\nContinue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await clearWorkspace();
            setApiConfig(null as any);
            router.replace('/');
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={s.navTitle}>Settings</Text>
        <TouchableOpacity onPress={checkStatus} style={{ padding: 4 }}>
          <Ionicons name="refresh-outline" size={20} color={C.brand} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

          {/* ── Status ── */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Connection Status</Text>
            <StatusRow
              label="Supabase"
              status={supaStatus}
              okText="Connected"
              errText="Unreachable"
            />
            <StatusRow
              label="Cloud PDF Backend"
              status={backendStatus}
              okText="Reachable"
              errText="Unreachable"
              idleText={backendUrl.trim() ? 'Not checked' : 'Not configured'}
            />
            <TouchableOpacity style={s.checkBtn} onPress={checkStatus}>
              {supaStatus === 'checking' || backendStatus === 'checking'
                ? <ActivityIndicator size="small" color={C.brand} />
                : <Text style={s.checkBtnText}>Check Status</Text>}
            </TouchableOpacity>
          </View>

          {/* ── Supabase ── */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Supabase</Text>
            <Field label="Project URL" value={url} onChange={setUrl} placeholder="https://xxxx.supabase.co" keyboardType="url" />
            <Field label="API Key (Publishable or Anon)" value={key} onChange={setKey} placeholder="sb_publishable_... or eyJ..." secure />
            <Field label="Workspace ID" value={wsId} onChange={setWsId} placeholder="e.g. daralsalam-office" />
          </View>

          {/* ── Cloud PDF Backend ── */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Cloud PDF Backend</Text>
            <Text style={s.cardHint}>
              Enter the Hugging Face Space URL for cloud PDF generation — works without your PC being on.
              Optionally, enter your desktop machine's local IP if you prefer local generation on the same Wi-Fi.
            </Text>
            <Field
              label="Cloud PDF Backend URL"
              value={backendUrl}
              onChange={setBackendUrl}
              placeholder="https://zohairazmat-finpilot-ai-backend.hf.space"
              keyboardType="url"
            />
            <Text style={s.fieldHint}>
              Default: Hugging Face Space (always available). Alternatively, use http://&lt;PC-IP&gt;:8001 for local backend on the same Wi-Fi.
            </Text>
          </View>

          {/* ── Actions ── */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Actions</Text>

            <ActionButton
              label={saving ? 'Saving…' : 'Save Connection'}
              icon="save-outline"
              color={C.brand}
              onPress={saveConnection}
              loading={saving}
            />

            <ActionButton
              label="Test Backend"
              icon="wifi-outline"
              color="#0ea5e9"
              onPress={testBackend}
            />

            <ActionButton
              label={syncing ? 'Syncing…' : 'Re-sync Now'}
              icon="sync-outline"
              color={C.success}
              onPress={resync}
              loading={syncing}
            />

            <ActionButton
              label="Disconnect Workspace"
              icon="log-out-outline"
              color={C.err}
              onPress={disconnect}
            />
          </View>

          <Text style={s.hint}>
            Saving updates your connection without wiping local data.{'\n'}
            Disconnect only removes stored credentials — cloud data is untouched.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label, value, onChange, placeholder, secure, keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secure?: boolean;
  keyboardType?: any;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={secure}
        keyboardType={keyboardType ?? 'default'}
      />
    </View>
  );
}

function StatusRow({
  label, status, okText, errText, idleText,
}: {
  label: string;
  status: Status;
  okText: string;
  errText: string;
  idleText?: string;
}) {
  const dot = status === 'ok' ? C.success : status === 'err' ? C.err : C.muted;
  const text =
    status === 'ok' ? okText :
    status === 'err' ? errText :
    status === 'checking' ? 'Checking…' :
    (idleText ?? 'Unknown');
  return (
    <View style={s.statusRow}>
      <Text style={s.statusLabel}>{label}</Text>
      <View style={s.statusRight}>
        {status === 'checking'
          ? <ActivityIndicator size="small" color={C.brand} style={{ marginRight: 6 }} />
          : <View style={[s.dot, { backgroundColor: dot }]} />}
        <Text style={[s.statusText, { color: dot }]}>{text}</Text>
      </View>
    </View>
  );
}

function ActionButton({
  label, icon, color, onPress, loading,
}: {
  label: string;
  icon: any;
  color: string;
  onPress: () => void;
  loading?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[s.actionBtn, { borderColor: color }]}
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.75}
    >
      {loading
        ? <ActivityIndicator size="small" color={color} />
        : <Ionicons name={icon} size={18} color={color} />}
      <Text style={[s.actionText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  navbar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 12, gap: 10,
  },
  navTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: C.text },
  card: {
    backgroundColor: C.card, marginHorizontal: 16, marginBottom: 14,
    borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 18,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.4 },
  cardHint: { fontSize: 12, color: C.sub, marginBottom: 14, lineHeight: 17 },
  label: { fontSize: 12, color: C.sub, marginBottom: 6, fontWeight: '500' },
  input: {
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
    color: C.text, fontSize: 14,
  },
  fieldHint: { fontSize: 11, color: C.muted, lineHeight: 16, marginTop: -10, marginBottom: 4 },
  statusRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  statusLabel: { fontSize: 13, color: C.sub, fontWeight: '500' },
  statusRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '600' },
  checkBtn: {
    marginTop: 14, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: C.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  checkBtnText: { fontSize: 13, fontWeight: '600', color: C.brand },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 13, paddingHorizontal: 16,
    borderRadius: 12, borderWidth: 1.5,
    marginBottom: 10, backgroundColor: C.bg,
  },
  actionText: { fontSize: 14, fontWeight: '600' },
  hint: { textAlign: 'center', color: C.muted, fontSize: 12, lineHeight: 18, marginHorizontal: 24 },
});
