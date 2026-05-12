import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'finpilot_workspace_v1';

export interface WorkspaceConfig {
  url: string;
  anonKey: string;
  workspaceId: string;
}

export async function saveWorkspace(cfg: WorkspaceConfig): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(cfg));
}

export async function loadWorkspace(): Promise<WorkspaceConfig | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function clearWorkspace(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
