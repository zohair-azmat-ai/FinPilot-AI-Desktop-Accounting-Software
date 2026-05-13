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

export async function viewPDF(apiPath: string): Promise<void> {
  const url = buildPdfUrl(apiPath);
  if (!url) { noBackendAlert(); return; }
  try {
    await Linking.openURL(url);
  } catch {
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
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const dest = `${FileSystem.cacheDirectory}${safe}`;

  try {
    const result = await FileSystem.downloadAsync(url, dest);
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
