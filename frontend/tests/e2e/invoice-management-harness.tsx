import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { createStore } from 'zustand/vanilla';
import { theme } from '@/shared/theme/theme';
import { createAuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { PermissionScope } from '@/modules/authentication/domain/permissions';
import type { SessionPort, SessionSnapshot } from '@/modules/authentication/application/session-ports';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import type { InvoiceApi, InvoiceDto } from '@/modules/invoices/application/invoice-api';
import type { QrDecoder } from '@/modules/invoices/application/qr-decoder';
import type { AssignmentApi } from '@/modules/fleet/application/fleet-api';
import { InvoicesPage } from '@/modules/invoices/presentation/invoices-page';

const scope: PermissionScope = { kind: 'organization', companyId: null, thirdPartyId: '0123456789abcdef01234567' };
const permissions = ['invoices:read', 'invoices:create', 'invoices:update'] as const;
const snapshot = (target: PermissionScope) => ({ subject: 'invoice-browser-test', scope: target, roles: ['DRIVER'] as const, permissions,
  policyVersion: '1', contextRevision: '1', evaluatedAt: new Date().toISOString(), refreshAfterSeconds: 30 as const });
let sessionState: SessionSnapshot = { status: 'authenticated', credentialRevision: 1 };
const session: SessionPort = { snapshot: () => sessionState, subscribe: () => () => {}, initialize: async () => {}, login: async () => {}, logout: async () => {}, invalidate: () => { sessionState = { status: 'error' }; } };
const authorization = createAuthorizationStore(async target => snapshot(target), session, { automatic: false, visible: () => true });
void authorization.getState().setContext(scope);
const record: InvoiceDto = { id: 'abcdef0123456789abcdef01', origin: 'MANUAL', thirdPartyId: scope.thirdPartyId!, assignmentId: 'abcdef0123456789abcdef02',
  driverId: 'abcdef0123456789abcdef03', vehicleId: 'abcdef0123456789abcdef04', vehiclePlate: 'ABC123', invoiceDate: '2026-11-20', invoiceTime: '12:30:00',
  invoiceAtUtc: '2026-11-20T17:30:00.000Z', invoiceNumber: 'FAC-E2E-1', issuerNit: '900123456', buyerDocument: '900654321',
  amounts: { amount: '100.00', vatAmount: '19.00', otherTaxesAmount: '0.00', totalAmount: '119.00' }, version: 1,
  createdAt: '2026-11-20T12:00:00.000Z', updatedAt: '2026-11-20T12:00:00.000Z', imageUrl: null };
const qrContent = 'NumFac=QR-E2E-1\nFecFac=2026-11-20\nHorFac=12:30:00\nNitFac=900123456\nDocAdq=900654321\nValFac=100\nValIva=19\nValOtroIm=0\nValTolFac=119';
const qrInvoice: InvoiceDto = { ...record, origin: 'QR', invoiceNumber: 'QR-E2E-1', qrMetadata: { parserVersion: 'invoice-key-value-v1', contentHash: 'a'.repeat(64) } };
const api: InvoiceApi = { list: async (_scope, query) => ({ items: query.page === 1 ? [record] : [], total: 1, page: query.page, pageSize: query.pageSize }),
  detail: async () => ({ invoice: record, editability: { available: false, reason: 'EDIT_POLICY_UNAVAILABLE' } }), create: async () => record, update: async () => record, image: async () => new Blob(),
  createQr: async () => qrInvoice };
const qrDecoder: QrDecoder = { openCamera: async (_video, onResult) => { queueMicrotask(() => onResult(qrContent)); return { stop: () => {}, destroy: () => {} }; }, decodeImage: async () => qrContent };
const assignment = { id: record.assignmentId, thirdPartyId: record.thirdPartyId, vehicleId: record.vehicleId, vehiclePlate: record.vehiclePlate!,
  driver: { id: record.driverId, name: 'Conductor de prueba' }, status: 'ACTIVE' as const, startedAt: record.createdAt, endedAt: null, version: 1 };
const assignments: AssignmentApi = { listAssignments: async () => ({ items: [assignment], total: 1, page: 1, pageSize: 100 }),
  getAssignment: async () => assignment, createAssignment: async () => assignment, closeAssignment: async () => ({ ...assignment, status: 'CLOSED' }) };
const context = Object.assign(createStore(() => ({ status: 'ready' as const, generation: 1 })), {
  register: () => () => {}, capture: () => ({ scope, signal: new AbortController().signal, isCurrent: () => true, release: () => {} })
}) as unknown as ContextStore;

createRoot(document.getElementById('root')!).render(<ThemeProvider theme={theme}><CssBaseline /><InvoicesPage api={api} assignments={assignments} context={context} authorization={authorization} loadQrDecoder={async () => qrDecoder} /></ThemeProvider>);
