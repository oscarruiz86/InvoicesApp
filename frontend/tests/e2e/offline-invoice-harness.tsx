import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { OfflineInvoiceCapturePage } from '@/modules/invoices/presentation/offline-invoice-capture-page';
import { offlineInvoiceQueue } from '@/modules/invoices/infrastructure/offline-invoice-queue';
import type { OfflineCredentialClaims, OfflineCredentialRecord, OfflineCredentialVerifier } from '@/modules/invoices/application/offline-invoice-ports';
import type { QrDecoder } from '@/modules/invoices/application/qr-decoder';
import { theme } from '@/shared/theme/theme';

const subject = 'offline-e2e-driver', thirdPartyId = 'offline-e2e-third-party', assignmentId = 'offline-e2e-assignment';
const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000);
const assignment: OfflineCredentialRecord['assignments'][number] = { id: assignmentId, thirdPartyId, vehicleId: 'offline-e2e-vehicle', vehiclePlate: 'ABC123',
  driver: { id: subject, name: 'Conductor E2E' }, status: 'ACTIVE', startedAt: new Date().toISOString(), endedAt: null, version: 1 };
const ticket: OfflineCredentialRecord = { id: `${subject}:${thirdPartyId}`, subject, thirdPartyId, credential: 'E2E-only-ticket', expiresAt: expiresAt.toISOString(),
  assignmentIds: [assignmentId], assignments: [assignment], updatedAt: new Date().toISOString() };
const claims: OfflineCredentialClaims = { sub: subject, thirdPartyId, assignmentIds: [assignmentId], scope: 'invoice:offline-capture',
  iss: 'invoice-app', aud: 'invoice-offline-capture', iat: Math.floor(Date.now() / 1000), exp: Math.floor(expiresAt.getTime() / 1000), jti: 'offline-e2e-ticket' };
const verifyCredential: OfflineCredentialVerifier = async record => record.id === ticket.id ? claims : null;
const decoder: QrDecoder = { preload: async () => {}, openCamera: async (_video, onResult) => {
  queueMicrotask(() => onResult('contenido QR E2E sin formato, pendiente de validación del servidor'));
  return { stop: () => {}, destroy: () => {} };
}, decodeImage: async () => 'contenido QR E2E sin formato, pendiente de validación del servidor' };

createRoot(document.getElementById('root')!).render(<ThemeProvider theme={theme}><CssBaseline />
  <OfflineInvoiceCapturePage ticket={ticket} claims={claims} publicJwks={[]} loadDecoder={async () => decoder}
    offlineQueue={offlineInvoiceQueue} verifyCredential={verifyCredential} />
</ThemeProvider>);
