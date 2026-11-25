import QrScanner from 'qr-scanner';
import type { QrCameraSession, QrDecoder } from '../application/qr-decoder';

const maxImageBytes = 5 * 1024 * 1024;
const maxImagePixels = 20_000_000;
let qrWorkerReady: Promise<void> | undefined;

function withinTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('OFFLINE_SHELL_UNAVAILABLE')), 5000);
    promise.then(value => { window.clearTimeout(timeout); resolve(value); }, error => { window.clearTimeout(timeout); reject(error); });
  });
}

async function ensureOfflineShellControl(): Promise<void> {
  if (!('serviceWorker' in navigator)) throw new Error('OFFLINE_SHELL_UNAVAILABLE');
  const registration = await withinTimeout(navigator.serviceWorker.ready);
  if (!registration.active) throw new Error('OFFLINE_SHELL_UNAVAILABLE');
  if (navigator.serviceWorker.controller) return;
  await new Promise<void>((resolve, reject) => {
    function finish(error?: Error) {
      window.clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      if (error) reject(error); else resolve();
    }
    function onControllerChange() { if (navigator.serviceWorker.controller) finish(); }
    const timeout = window.setTimeout(() => finish(new Error('OFFLINE_SHELL_UNAVAILABLE')), 5000);
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
  });
}

export function createQrScannerAdapter(): QrDecoder {
  return {
    async preload() {
      if (import.meta.env.PROD) await ensureOfflineShellControl();
      qrWorkerReady ??= (async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        try { await QrScanner.scanImage(canvas, { returnDetailedScanResult: true }); }
        catch (error) {
          if ((error instanceof Error && error.message === QrScanner.NO_QR_CODE_FOUND) || error === QrScanner.NO_QR_CODE_FOUND) return;
          throw new Error('QR_WORKER_UNAVAILABLE', { cause: error });
        }
      })().catch(error => { qrWorkerReady = undefined; throw error; });
      await qrWorkerReady;
    },
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
