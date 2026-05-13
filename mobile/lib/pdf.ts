/**
 * PDF download + share via the FinPilot desktop backend.
 *
 * The backend (FastAPI, port 8001) runs on the user's desktop machine and
 * uses pdf_generator.py (ReportLab) to produce pixel-perfect PDFs that
 * include the company letterhead image, Arabic/English header, TRN bar,
 * stamp, and signature sections — identical to what the desktop app shows.
 *
 * Mobile fetches the PDF bytes over LAN (same Wi-Fi as the desktop machine),
 * saves to the app cache, and shares via the native share sheet.
 *
 * Routes the backend exposes:
 *   GET /api/invoices/{id}/pdf
 *   GET /api/quotations/{id}/pdf
 *   GET /api/delivery-notes/{id}/pdf
 *   GET /api/purchase-orders/{id}/pdf
 */

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { getBackendUrl } from '@/lib/api';

export async function downloadAndSharePDF(
  apiPath: string,       // e.g. "/api/invoices/123/pdf"
  filename: string,      // e.g. "Invoice_INV-0042.pdf"
): Promise<void> {
  const base = getBackendUrl();
  if (!base) {
    Alert.alert(
      'Backend not configured',
      'To generate PDFs, enter your desktop machine\'s IP in the connect screen (e.g. http://192.168.1.5:8001). Ensure FinPilot desktop is running and you are on the same Wi-Fi network.',
    );
    return;
  }

  const url = `${base}${apiPath}`;
  const dest = `${FileSystem.cacheDirectory}${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  try {
    const result = await FileSystem.downloadAsync(url, dest);
    if (result.status !== 200) {
      throw new Error(`Backend returned HTTP ${result.status}. Is the desktop app running?`);
    }
    await Sharing.shareAsync(result.uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: filename,
    });
  } catch (e: any) {
    const msg: string = e.message ?? String(e);
    if (msg.includes('Network request failed') || msg.includes('ECONNREFUSED') || msg.includes('connect')) {
      Alert.alert(
        'Desktop not reachable',
        `Could not reach ${base}.\n\nEnsure:\n• FinPilot desktop is open\n• Your phone and PC are on the same Wi-Fi\n• The IP address is correct`,
      );
    } else {
      Alert.alert('PDF failed', msg);
    }
  }
}
