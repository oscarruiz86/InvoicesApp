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
import type { OfflineCredentialVerifier, OfflineInvoiceQueuePort } from '@/modules/invoices/application/offline-invoice-ports';
import type { AssignmentApi } from '@/modules/fleet/application/fleet-api';
import { RequestError } from '@/shared/application/request-error';
import { InvoicesPage } from '@/modules/invoices/presentation/invoices-page';

const scope: PermissionScope = { kind: 'organization', companyId: null, thirdPartyId: '0123456789abcdef01234567' };
const permissions = ['invoices:read', 'invoices:create', 'invoices:update'] as const;
const params = new URLSearchParams(window.location.search), adminMode = params.has('admin');
const roles = adminMode ? ['THIRD_PARTY_ADMIN'] as const : ['DRIVER'] as const;
const snapshot = (target: PermissionScope) => ({ subject: 'invoice-browser-test', scope: target, roles, permissions,
  policyVersion: '1', contextRevision: '1', evaluatedAt: new Date().toISOString(), refreshAfterSeconds: 30 as const });
let sessionState: SessionSnapshot = { status: 'authenticated', credentialRevision: 1 };
const session: SessionPort = { snapshot: () => sessionState, subscribe: () => () => {}, initialize: async () => {}, login: async () => {}, logout: async () => {}, invalidate: () => { sessionState = { status: 'error' }; } };
const authorization = createAuthorizationStore(async target => snapshot(target), session, { automatic: false, visible: () => true });
void authorization.getState().setContext(scope);
const record: InvoiceDto = { id: 'abcdef0123456789abcdef01', origin: 'MANUAL', captureChannel: 'ONLINE', thirdPartyId: scope.thirdPartyId!, assignmentId: 'abcdef0123456789abcdef02',
  driverId: 'abcdef0123456789abcdef03', vehicleId: 'abcdef0123456789abcdef04', vehiclePlate: 'ABC123', invoiceDate: '2026-11-20', invoiceTime: '12:30:00',
  invoiceAtUtc: '2026-11-20T17:30:00.000Z', invoiceNumber: 'FAC-E2E-1', issuerNit: '900123456', buyerDocument: '900654321',
  amounts: { amount: '100.00', vatAmount: '19.00', otherTaxesAmount: '0.00', totalAmount: '119.00' }, version: 1,
  createdAt: '2026-11-20T12:00:00.000Z', updatedAt: '2026-11-20T12:00:00.000Z', imageUrl: null };
const qrContent = 'NumFac=QR-E2E-1\nFecFac=2026-11-20\nHorFac=12:30:00\nNitFac=900123456\nDocAdq=900654321\nValFac=100\nValIva=19\nValOtroIm=0\nValTolFac=119';
const qrInvoice: InvoiceDto = { ...record, origin: 'QR', invoiceNumber: 'QR-E2E-1', qrMetadata: { parserVersion: 'invoice-key-value-v1', contentHash: 'a'.repeat(64) } };
const offlineSubmission = { id: 'c'.repeat(24), thirdPartyId: 'b'.repeat(24), origin: 'MANUAL' as const, assignmentId: 'd'.repeat(24), vehicleId: 'e'.repeat(24),
  causes: [] as const, candidateInvoiceIds: [] as const, status: 'SYNCHRONIZED' as const, version: 2, createdAt: new Date().toISOString(), expiresAt: null, resultInvoiceId: 'f'.repeat(24), resolutionReason: null };
const conflictCause = params.get('admin') === 'duplicate' ? ['BUSINESS_DUPLICATE'] as const : ['ASSIGNMENT_CLOSED'] as const;
const conflictSubmission = { ...offlineSubmission, thirdPartyId: scope.thirdPartyId!, causes: conflictCause, candidateInvoiceIds: conflictCause[0] === 'BUSINESS_DUPLICATE' ? [record.id] : [],
  status: 'CONFLICT' as const, resultInvoiceId: null, resolutionReason: null };
let conflictResolved = false;
const api: InvoiceApi = { issueOfflineCredential: async () => ({ credential: '', expiresAt: new Date().toISOString(), subject: 'driver', thirdPartyId: 'b'.repeat(24), assignmentIds: [] }),
  submitOffline: async () => offlineSubmission, offlineSubmission: async () => offlineSubmission,
  listOfflineSubmissionHistory: async (_scope, page, pageSize) => ({ items: [], total: 0, page, pageSize }),
  listOfflineConflicts: async () => ({ items: adminMode && !conflictResolved ? [{ submission: conflictSubmission, reviewFields: { invoiceDate: record.invoiceDate,
    invoiceNumber: record.invoiceNumber, issuerNit: record.issuerNit, buyerDocument: record.buyerDocument, totalAmount: record.amounts.totalAmount },
    candidates: conflictCause[0] === 'BUSINESS_DUPLICATE' ? [{ id: record.id, invoiceNumber: record.invoiceNumber, issuerNit: record.issuerNit,
      invoiceDate: record.invoiceDate, cause: 'BUSINESS_DUPLICATE' as const }] : [], imageAvailable: true }] : [], total: adminMode && !conflictResolved ? 1 : 0, page: 1, pageSize: 20 }),
  offlineConflictImage: async () => new Blob(['image'], { type: 'image/jpeg' }), resolveOfflineConflict: async (_scope, _id, input) => {
    if (params.get('admin') === 'stale') throw new RequestError('SUBMISSION_VERSION_CONFLICT');
    conflictResolved = true; return { ...conflictSubmission, status: input.action === 'REJECT' ? 'REJECTED' as const
      : input.action === 'LINK_DUPLICATE' ? 'LINKED' as const : 'SYNCHRONIZED' as const, resolutionReason: input.reason };
  },
  list: async (_scope, query) => ({ items: query.page === 1 ? [{ ...record, editability: { available: true, reason: null } }] : [], total: 1, page: query.page, pageSize: query.pageSize }),
  detail: async () => ({ invoice: record, editability: { available: false, reason: 'EDIT_POLICY_UNAVAILABLE' } }), create: async () => record, update: async () => record, image: async () => new Blob(),
  createQr: async () => qrInvoice };
const qrDecoder: QrDecoder = { openCamera: async (_video, onResult) => { queueMicrotask(() => onResult(qrContent)); return { stop: () => {}, destroy: () => {} }; }, decodeImage: async () => qrContent };
const assignment = { id: record.assignmentId, thirdPartyId: record.thirdPartyId, vehicleId: record.vehicleId, vehiclePlate: record.vehiclePlate!,
  driver: { id: record.driverId, name: 'Conductor de prueba' }, status: 'ACTIVE' as const, startedAt: record.createdAt, endedAt: null, version: 1 };
const assignments: AssignmentApi = { listAssignments: async () => ({ items: [assignment], total: 1, page: 1, pageSize: 100 }),
  getAssignment: async () => assignment, createAssignment: async () => assignment, closeAssignment: async () => ({ ...assignment, status: 'CLOSED' }) };
const offlineQueue = { save: async (value: Parameters<OfflineInvoiceQueuePort['save']>[0]) => ({ ...value, id: 'offline-1', status: 'PENDING' as const, createdAt: new Date().toISOString(), idempotencyKey: value.idempotencyKey ?? 'offline-1' }),
  list: async () => [], listSubject: async () => [], recoverInterrupted: async () => [], update: async () => {}, clear: async () => {}, removeSubject: async () => {},
  removeContext: async () => {}, remove: async () => {}, saveCredential: async () => {}, listCredentials: async () => [], getCredential: async () => null,
  removeCredential: async () => {}, subscribe: () => () => {} } as unknown as OfflineInvoiceQueuePort;
const verifyCredential: OfflineCredentialVerifier = async () => null;
const context = Object.assign(createStore(() => ({ status: 'ready' as const, generation: 1, activeContext: {
  kind: 'ORGANIZATION' as const, organizationType: 'THIRD_PARTY' as const, organizationId: scope.thirdPartyId!, organizationName: 'Tercero de prueba',
  roles, authorization: { subject: 'invoice-browser-test' },
} })), {
  register: () => () => {}, capture: () => ({ scope, signal: new AbortController().signal, isCurrent: () => true, release: () => {} })
}) as unknown as ContextStore;

createRoot(document.getElementById('root')!).render(<ThemeProvider theme={theme}><CssBaseline /><InvoicesPage api={api} assignments={assignments} context={context} authorization={authorization}
  loadQrDecoder={async () => qrDecoder} offlineQueue={offlineQueue} verifyCredential={verifyCredential} /></ThemeProvider>);
