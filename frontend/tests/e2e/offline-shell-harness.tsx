import { createQrScannerAdapter } from '@/modules/invoices/infrastructure/qr-scanner-adapter';
import { offlineInvoiceQueue } from '@/modules/invoices/infrastructure/offline-invoice-queue';
import { readClientEnvironment } from '@/shared/infrastructure/config/client-environment';
import { findValidOfflineCredential } from '@/modules/invoices/infrastructure/offline-credential';

const subject = 'offline-shell-e2e-driver';
const thirdPartyId = '111111111111111111111111';
const assignmentId = '222222222222222222222222';
const vehicleId = '333333333333333333333333';
const assignment = { id: assignmentId, thirdPartyId, vehicleId, vehiclePlate: 'ABC123',
  driver: { id: subject, name: 'Conductor E2E' }, status: 'ACTIVE' as const, startedAt: new Date().toISOString(), endedAt: null, version: 1 };

declare global {
  interface Window {
    offlineShellE2e: {
      seedCredential(credential: string, expiresAt: string, jwks: string): Promise<void>;
      preloadQrReader(): Promise<void>;
      hasValidCredential(): Promise<boolean>;
    };
  }
}

window.offlineShellE2e = {
  async seedCredential(credential, expiresAt, jwks) {
    if (__OFFLINE_SHELL_E2E__) localStorage.setItem('offline-shell-e2e-jwks', jwks);
    await offlineInvoiceQueue.saveCredential({ id: `${subject}:${thirdPartyId}`, subject, thirdPartyId, credential, expiresAt,
      assignmentIds: [assignmentId], assignments: [assignment], updatedAt: new Date().toISOString() });
  },
  async preloadQrReader() { await createQrScannerAdapter().preload?.(); },
  async hasValidCredential() {
    const environment = readClientEnvironment({ ...import.meta.env, VITE_OFFLINE_CREDENTIAL_PUBLIC_JWKS:
      (__OFFLINE_SHELL_E2E__ ? localStorage.getItem('offline-shell-e2e-jwks') : null) ?? import.meta.env.VITE_OFFLINE_CREDENTIAL_PUBLIC_JWKS });
    return Boolean(await findValidOfflineCredential(await offlineInvoiceQueue.listCredentials(), environment.offlineCredentialPublicJwks));
  },
};

document.getElementById('root')!.innerHTML = '<main><h1>Preparación offline</h1><p>La credencial de prueba y el lector QR usan los adaptadores reales de la aplicación.</p></main>';
