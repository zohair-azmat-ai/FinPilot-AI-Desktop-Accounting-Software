/**
 * PDF download + share via the FinPilot desktop backend.
 *
 * Uses expo-file-system/legacy (SDK 54 — downloadAsync moved to legacy subpath).
 *
 * Routes the backend exposes:
 *   GET /api/invoices/{id_or_number}/pdf
 *   GET /api/quotations/{id_or_number}/pdf
 *   GET /api/delivery-notes/{id_or_number}/pdf
 *   GET /api/purchase-orders/{id_or_number}/pdf
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert, Linking } from 'react-native';
import { getBackendUrl } from '@/lib/api';

const REACH_TIMEOUT_MS = 5000;

function noBackendAlert() {
  Alert.alert(
    'Backend not configured',
    "To use PDF features, enter your desktop machine's IP in Settings → Desktop Backend URL (e.g. http://192.168.1.5:8001). Ensure FinPilot desktop is running and you are on the same Wi-Fi network.",
  );
}

function networkErrorAlert(base: string) {
  Alert.alert(
    'Desktop not reachable',
    `Could not reach ${base}.\n\nEnsure:\n• FinPilot desktop is open\n• Your phone and PC are on the same Wi-Fi\n• The IP address is correct in Settings`,
  );
}

export function buildPdfUrl(apiPath: string): string | null {
  const base = getBackendUrl();
  if (!base) return null;
  return `${base}${apiPath}`;
}

/** Quick 5-second reachability probe — resolves true if backend responds, false on timeout/error. */
async function isBackendReachable(base: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REACH_TIMEOUT_MS);
  try {
    console.log(`[pdf] Probing backend reachability: ${base}/health`);
    const res = await fetch(`${base}/health`, { method: 'GET', signal: controller.signal });
    console.log(`[pdf] Probe status: ${res.status}`);
    return res.ok;
  } catch (e: any) {
    console.log(`[pdf] Probe failed: ${e?.message ?? e}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function viewPDF(apiPath: string): Promise<void> {
  const base = getBackendUrl();
  if (!base) { noBackendAlert(); return; }

  const url = `${base}${apiPath}`;
  console.log(`[pdf] viewPDF → ${url}`);

  const reachable = await isBackendReachable(base);
  if (!reachable) { networkErrorAlert(base); return; }

  try {
    await Linking.openURL(url);
  } catch (e: any) {
    console.log(`[pdf] Linking.openURL failed: ${e?.message ?? e}`);
    Alert.alert('Cannot open PDF', `Could not open: ${url}`);
  }
}

export async function downloadAndSharePDF(
  apiPath: string,
  filename: string,
): Promise<void> {
  const base = getBackendUrl();
  if (!base) { noBackendAlert(); return; }

  const url = `${base}${apiPath}`;
  console.log(`[pdf] downloadAndSharePDF → ${url}`);

  const reachable = await isBackendReachable(base);
  if (!reachable) { networkErrorAlert(base); return; }

  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const dest = `${FileSystem.cacheDirectory}${safe}`;

  try {
    console.log(`[pdf] Downloading to: ${dest}`);
    const result = await FileSystem.downloadAsync(url, dest);
    console.log(`[pdf] Download status: ${result.status}, uri: ${result.uri}`);
    if (result.status !== 200) {
      throw new Error(`Backend returned HTTP ${result.status}. Is FinPilot desktop running?`);
    }
    await Sharing.shareAsync(result.uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: filename,
    });
  } catch (e: any) {
    const msg: string = e.message ?? String(e);
    console.log(`[pdf] Error: ${msg}`);
    if (
      msg.includes('Network request failed') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('connect') ||
      msg.includes('Unable to resolve host')
    ) {
      networkErrorAlert(base);
    } else {
      Alert.alert('PDF failed', msg);
    }
  }
}
