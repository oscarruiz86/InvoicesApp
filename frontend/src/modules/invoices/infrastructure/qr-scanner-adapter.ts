import QrScanner from 'qr-scanner';
import type { QrCameraSession, QrDecoder } from '../application/qr-decoder';

const maxImageBytes = 5 * 1024 * 1024;
const maxImagePixels = 20_000_000;

export function createQrScannerAdapter(): QrDecoder {
  return {
    async openCamera(video, onResult, onError): Promise<QrCameraSession> {
      const scanner = new QrScanner(video, result => onResult(result.data), {
        returnDetailedScanResult: true,
        preferredCamera: 'environment',
        maxScansPerSecond: 8,
        highlightScanRegion: true,
        highlightCodeOutline: true,
      });
      try {
        await scanner.start();
      } catch (error) {
        scanner.destroy();
        onError(error);
        throw error;
      }
      return { stop: () => scanner.stop(), destroy: () => { scanner.stop(); scanner.destroy(); } };
    },

    async decodeImage(file, signal) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > maxImageBytes) throw new Error('QR_IMAGE_UNSUPPORTED');
      let bitmap: ImageBitmap;
      try { bitmap = await createImageBitmap(file); } catch { throw new Error('QR_IMAGE_INVALID'); }
      try {
        if (bitmap.width * bitmap.height > maxImagePixels) throw new Error('QR_IMAGE_TOO_LARGE');
      } finally { bitmap.close(); }
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      try {
        const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        return result.data;
      } catch (error) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        if (error instanceof Error && error.message.startsWith('QR_IMAGE_')) throw error;
        throw new Error('QR_NOT_FOUND', { cause: error });
      }
    },
  };
}
