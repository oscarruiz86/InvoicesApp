import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import { createInvoice, createQrInvoice, InvoiceDomainError, type Invoice } from '../domain/invoice';
import { InvoiceQrError, parseInvoiceQr } from '../domain/invoice-qr';
import { evaluateInvoiceEditWindow, type InvoiceEditPolicy } from '../domain/edit-window';
import type { InvoiceAssignmentConfirmationPort, InvoiceAuthorizationPort, InvoiceClock, InvoiceCorrelationId,
  InvoiceEditPolicyReader, InvoiceIds, InvoiceImageInput, InvoiceListQuery, InvoiceRepositoryPort } from './invoice-ports';
import type { InvoiceImageNormalizer } from './invoice-ports';

export type InvoiceUseCaseErrorCode = 'INVALID_REQUEST' | 'FORBIDDEN' | 'RESOURCE_NOT_FOUND' | 'INVOICE_STORAGE_UNAVAILABLE'
  | 'AUTHORIZATION_UNAVAILABLE' | 'ASSIGNMENT_NOT_ELIGIBLE' | 'ASSIGNMENT_EVIDENCE_UNAVAILABLE'
  | 'INVOICE_DUPLICATE' | 'IDEMPOTENCY_CONFLICT' | 'INVOICE_VERSION_CONFLICT' | 'EDIT_WINDOW_CLOSED'
  | 'EDIT_POLICY_UNAVAILABLE' | 'INVOICE_AUDIT_UNAVAILABLE' | 'IMAGE_REQUIRED' | 'QR_INVALID' | 'QR_INCOMPLETE' | 'QR_UNSUPPORTED' | 'QR_IMMUTABLE';
export class InvoiceUseCaseError extends Error {
  constructor(readonly code: InvoiceUseCaseErrorCode) { super(code); }
}
export interface CreateInvoiceCommand {
  readonly thirdPartyId: string; readonly assignmentId: string; readonly vehicleId: string;
  readonly invoiceDate: string; readonly invoiceTime: string; readonly invoiceNumber: string; readonly issuerNit: string;
  readonly buyerDocument: string; readonly amount: string; readonly vatAmount: string; readonly otherTaxesAmount: string;
  readonly totalAmount: string; readonly image?: InvoiceImageInput;
}
export interface CreateQrInvoiceCommand { readonly thirdPartyId: string; readonly assignmentId: string; readonly vehicleId: string;
  readonly qrContent: string; readonly image?: InvoiceImageInput }
export interface InvoiceDetailsView {
  readonly invoice: Invoice;
  readonly editability: { readonly available: boolean; readonly reason: 'PERMISSION_INSUFFICIENT' | 'EDIT_POLICY_UNAVAILABLE' | 'EDIT_WINDOW_CLOSED' | 'QR_IMMUTABLE' | null };
}

const id = (value: unknown): value is string => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
const sorts = ['invoiceDate', 'invoiceNumber', 'totalAmount', 'createdAt'] as const;
export function validateInvoiceListQuery(input: InvoiceListQuery): void {
  const allowed = ['thirdPartyId', 'ownerSubject', 'q', 'vehicleId', 'driverId', 'dateFrom', 'dateTo', 'page', 'pageSize', 'sort', 'direction'];
  if (!input || Object.keys(input).some(key => !allowed.includes(key)) || !id(input.thirdPartyId)
    || (input.ownerSubject !== undefined && (!input.ownerSubject || input.ownerSubject.length > 128))
    || (input.vehicleId !== undefined && !id(input.vehicleId)) || (input.driverId !== undefined && !id(input.driverId))
    || (input.q !== undefined && (!input.q.trim() || input.q.length > 100))
    || (input.dateFrom !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(input.dateFrom))
    || (input.dateTo !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(input.dateTo))
    || !Number.isSafeInteger(input.page) || input.page < 1 || input.page > 1_000_000
    || !Number.isSafeInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100
    || !sorts.includes(input.sort) || (input.direction !== 'asc' && input.direction !== 'desc')) throw new InvoiceUseCaseError('INVALID_REQUEST');
  if (input.dateFrom && input.dateTo && input.dateFrom > input.dateTo) throw new InvoiceUseCaseError('INVALID_REQUEST');
}
function mapError(error: unknown): InvoiceUseCaseError {
  if (error instanceof InvoiceUseCaseError) return error;
  if (error instanceof InvoiceDomainError) return new InvoiceUseCaseError('INVALID_REQUEST');
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : error instanceof Error ? error.message : '';
  if (['FORBIDDEN', 'AUTHORIZATION_UNAVAILABLE', 'RESOURCE_NOT_FOUND', 'ASSIGNMENT_NOT_ELIGIBLE', 'ASSIGNMENT_EVIDENCE_UNAVAILABLE',
    'INVOICE_DUPLICATE', 'IDEMPOTENCY_CONFLICT', 'INVOICE_VERSION_CONFLICT', 'EDIT_WINDOW_CLOSED', 'EDIT_POLICY_UNAVAILABLE',
    'INVOICE_AUDIT_UNAVAILABLE'].includes(code)) return new InvoiceUseCaseError(code as InvoiceUseCaseErrorCode);
  return new InvoiceUseCaseError('INVOICE_STORAGE_UNAVAILABLE');
}
function assertRole(roles: readonly string[], allowed: 'DRIVER' | 'THIRD_PARTY_ADMIN'): void {
  if (!roles.includes(allowed)) throw new InvoiceUseCaseError('FORBIDDEN');
}
function isAllowedChangeRole(roles: readonly string[]): boolean { return roles.includes('DRIVER') || roles.includes('THIRD_PARTY_ADMIN'); }

export function createInvoices(deps: {
  readonly repository: InvoiceRepositoryPort; readonly authorization: InvoiceAuthorizationPort;
  readonly assignments: InvoiceAssignmentConfirmationPort; readonly editPolicy: InvoiceEditPolicyReader;
  readonly imageNormalizer: InvoiceImageNormalizer; readonly clock: InvoiceClock; readonly ids: InvoiceIds; readonly correlationId: InvoiceCorrelationId;
  readonly qrContentHasher: { sha256(content: string): string };
}) {
  function parseQr(content: unknown) {
    const parsed = parseInvoiceQr(content);
    const { canonicalContent, ...result } = parsed;
    return { ...result, metadata: { ...result.metadata, contentHash: deps.qrContentHasher.sha256(canonicalContent) } };
  }
  async function authorize(actor: AuthenticatedActor, thirdPartyId: string, permission: 'invoices:create' | 'invoices:read' | 'invoices:update') {
    if (!id(thirdPartyId)) throw new InvoiceUseCaseError('INVALID_REQUEST');
    try { return await deps.authorization.authorize({ actor, thirdPartyId, permission }); }
    catch (error) { throw mapError(error); }
  }
  return {
    normalizeImage: (input: { readonly data: Uint8Array; readonly claimedType: string }) => deps.imageNormalizer.normalize(input),
    async list(actor: AuthenticatedActor, input: InvoiceListQuery) {
      validateInvoiceListQuery(input);
      const receipt = await authorize(actor, input.thirdPartyId, 'invoices:read');
      if (!isAllowedChangeRole(receipt.roles)) throw new InvoiceUseCaseError('FORBIDDEN');
      const scoped = receipt.roles.includes('DRIVER') ? { ...input, ownerSubject: actor.subject } : input;
      try {
        const page = await deps.repository.list(scoped);
        let updateAllowed = false;
        try { await authorize(actor, input.thirdPartyId, 'invoices:update'); updateAllowed = true; }
        catch (error) { const mapped = mapError(error); if (mapped.code !== 'FORBIDDEN') throw mapped; }
        if (!updateAllowed) return { ...page, items: page.items.map(invoice => ({ invoice, editability: { available: false, reason: 'PERMISSION_INSUFFICIENT' as const } })), page: input.page, pageSize: input.pageSize };
        if (receipt.roles.includes('THIRD_PARTY_ADMIN')) return { ...page, items: page.items.map(invoice => ({ invoice, editability: { available: true, reason: null } })), page: input.page, pageSize: input.pageSize };
        const manuals = page.items.filter(invoice => invoice.origin === 'MANUAL');
        const policyEvidence = manuals.length
          ? await deps.editPolicy.read({ thirdPartyId: input.thirdPartyId }).catch(() => ({ state: 'UNAVAILABLE' as const }))
          : null;
        const items = page.items.map(invoice => {
          if (invoice.origin === 'QR') return { invoice, editability: { available: false, reason: 'QR_IMMUTABLE' as const } };
          if (!policyEvidence || policyEvidence.state === 'UNAVAILABLE') return { invoice, editability: { available: false, reason: 'EDIT_POLICY_UNAVAILABLE' as const } };
          const window = evaluateInvoiceEditWindow({ createdAt: invoice.createdAt, now: deps.clock.now(), policy: policyEvidence.policy });
          if (window === 'POLICY_UNAVAILABLE') return { invoice, editability: { available: false, reason: 'EDIT_POLICY_UNAVAILABLE' as const } };
          if (window === 'CLOSED') return { invoice, editability: { available: false, reason: 'EDIT_WINDOW_CLOSED' as const } };
          return { invoice, editability: { available: true, reason: null } };
        });
        return { ...page, items, page: input.page, pageSize: input.pageSize };
      }
      catch (error) { throw mapError(error); }
    },
    async detail(actor: AuthenticatedActor, input: { readonly id: string; readonly thirdPartyId: string }) {
      if (!id(input.id)) throw new InvoiceUseCaseError('INVALID_REQUEST');
      const receipt = await authorize(actor, input.thirdPartyId, 'invoices:read');
      if (!isAllowedChangeRole(receipt.roles)) throw new InvoiceUseCaseError('FORBIDDEN');
      try {
        const driverOnly = receipt.roles.includes('DRIVER') && !receipt.roles.includes('THIRD_PARTY_ADMIN');
        const invoice = await deps.repository.find({ id: input.id, thirdPartyId: input.thirdPartyId,
          ...(driverOnly ? { ownerSubject: actor.subject } : {}) });
        if (!invoice) throw new InvoiceUseCaseError('RESOURCE_NOT_FOUND');
        let updateAllowed = false;
        try { await authorize(actor, input.thirdPartyId, 'invoices:update'); updateAllowed = true; }
        catch (error) { const mapped = mapError(error); if (mapped.code !== 'FORBIDDEN') throw mapped; }
        if (!updateAllowed) return { invoice, editability: { available: false, reason: 'PERMISSION_INSUFFICIENT' as const } } satisfies InvoiceDetailsView;
        if (receipt.roles.includes('THIRD_PARTY_ADMIN')) return { invoice, editability: { available: true, reason: null } } satisfies InvoiceDetailsView;
        if (invoice.origin === 'QR') return { invoice, editability: { available: false, reason: 'QR_IMMUTABLE' as const } } satisfies InvoiceDetailsView;
        const policyEvidence = await deps.editPolicy.read({ thirdPartyId: input.thirdPartyId }).catch(() => ({ state: 'UNAVAILABLE' as const }));
        if (policyEvidence.state === 'UNAVAILABLE') return { invoice, editability: { available: false, reason: 'EDIT_POLICY_UNAVAILABLE' as const } } satisfies InvoiceDetailsView;
        const window = evaluateInvoiceEditWindow({ createdAt: invoice.createdAt, now: deps.clock.now(), policy: policyEvidence.policy });
        if (window === 'POLICY_UNAVAILABLE') return { invoice, editability: { available: false, reason: 'EDIT_POLICY_UNAVAILABLE' as const } } satisfies InvoiceDetailsView;
        if (window === 'CLOSED') return { invoice, editability: { available: false, reason: 'EDIT_WINDOW_CLOSED' as const } } satisfies InvoiceDetailsView;
        return { invoice, editability: { available: true, reason: null } } satisfies InvoiceDetailsView;
      } catch (error) { throw mapError(error); }
    },
    async image(actor: AuthenticatedActor, input: { readonly id: string; readonly thirdPartyId: string }) {
      const detail = await this.detail(actor, input);
      return deps.repository.readImage({ invoice: detail.invoice });
    },
    async create(actor: AuthenticatedActor, input: CreateInvoiceCommand & { readonly idempotencyKey: string }) {
      const { idempotencyKey, image, ...command } = input;
      const allowed = ['thirdPartyId', 'assignmentId', 'vehicleId', 'invoiceDate', 'invoiceTime', 'invoiceNumber', 'issuerNit',
        'buyerDocument', 'amount', 'vatAmount', 'otherTaxesAmount', 'totalAmount', 'image', 'idempotencyKey'];
      if (Object.keys(input).some(key => !allowed.includes(key)) || !idempotencyKey || idempotencyKey.length > 128
        || !id(command.assignmentId) || !id(command.vehicleId)) throw new InvoiceUseCaseError('INVALID_REQUEST');
      const receipt = await authorize(actor, command.thirdPartyId, 'invoices:create');
      assertRole(receipt.roles, 'DRIVER');
      if (!image) throw new InvoiceUseCaseError('IMAGE_REQUIRED');
      try {
        const assignment = await deps.assignments.readOwnActive({ actorSubject: actor.subject, thirdPartyId: command.thirdPartyId,
          assignmentId: command.assignmentId, vehicleId: command.vehicleId });
        if (!assignment) throw new InvoiceUseCaseError('ASSIGNMENT_NOT_ELIGIBLE');
        const imagePayload = image ? { ...image, id: deps.ids.next() } : undefined;
        const invoice = createInvoice({ ...command, id: deps.ids.next(), ownerSubject: actor.subject, driverId: assignment.driverId,
          vehiclePlate: assignment.vehiclePlate, imageId: imagePayload?.id ?? null, now: deps.clock.now() });
        const requestHash = JSON.stringify({ thirdPartyId: invoice.thirdPartyId, ownerSubject: invoice.ownerSubject, assignmentId: invoice.assignmentId,
          origin: invoice.origin, vehicleId: invoice.vehicleId, invoiceDate: invoice.invoiceDate, invoiceTime: invoice.invoiceTime, invoiceNumber: invoice.invoiceNumber,
          issuerNit: invoice.issuerNit, buyerDocument: invoice.buyerDocument, amounts: invoice.amounts,
          image: imagePayload ? { sha256: imagePayload.sha256, contentType: imagePayload.contentType, size: imagePayload.size } : null });
        return await deps.repository.create({ invoice, image: imagePayload, actorSubject: actor.subject, idempotencyKey, requestHash, authority: receipt,
          assignment, correlationId: deps.correlationId.next() });
      } catch (error) { throw mapError(error); }
    },
    async previewQr(actor: AuthenticatedActor, input: { readonly thirdPartyId: string; readonly qrContent: string }) {
      if (Object.keys(input).some(key => !['thirdPartyId', 'qrContent'].includes(key))) throw new InvoiceUseCaseError('INVALID_REQUEST');
      const receipt = await authorize(actor, input.thirdPartyId, 'invoices:create'); assertRole(receipt.roles, 'DRIVER');
      try { return parseQr(input.qrContent); } catch (error) { if (error instanceof InvoiceQrError) throw new InvoiceUseCaseError(error.code as InvoiceUseCaseErrorCode); throw error; }
    },
    async createQr(actor: AuthenticatedActor, input: CreateQrInvoiceCommand & { readonly idempotencyKey: string }) {
      const { qrContent, idempotencyKey, image, ...refs } = input;
      if (Object.keys(input).some(key => !['thirdPartyId', 'assignmentId', 'vehicleId', 'qrContent', 'idempotencyKey', 'image'].includes(key))
        || typeof qrContent !== 'string' || !id(refs.assignmentId) || !id(refs.vehicleId) || !idempotencyKey || idempotencyKey.length > 128)
        throw new InvoiceUseCaseError('INVALID_REQUEST');
      const receipt = await authorize(actor, refs.thirdPartyId, 'invoices:create'); assertRole(receipt.roles, 'DRIVER');
      try {
        const parsed = parseQr(qrContent);
        const assignment = await deps.assignments.readOwnActive({ actorSubject: actor.subject, thirdPartyId: refs.thirdPartyId,
          assignmentId: refs.assignmentId, vehicleId: refs.vehicleId });
        if (!assignment) throw new InvoiceUseCaseError('ASSIGNMENT_NOT_ELIGIBLE');
        const imagePayload = image ? { ...image, id: deps.ids.next() } : undefined;
        const { metadata, invoiceAtUtc, ...fields } = parsed;
        const invoice = createQrInvoice({ ...fields, id: deps.ids.next(), ownerSubject: actor.subject, thirdPartyId: refs.thirdPartyId,
          assignmentId: refs.assignmentId, driverId: assignment.driverId, vehicleId: refs.vehicleId, vehiclePlate: assignment.vehiclePlate,
          imageId: imagePayload?.id ?? null, now: deps.clock.now() }, metadata, invoiceAtUtc);
        const requestHash = JSON.stringify({ origin: 'QR', thirdPartyId: invoice.thirdPartyId, ownerSubject: invoice.ownerSubject,
          assignmentId: invoice.assignmentId, vehicleId: invoice.vehicleId, invoiceDate: invoice.invoiceDate, invoiceTime: invoice.invoiceTime,
          invoiceNumber: invoice.invoiceNumber, issuerNit: invoice.issuerNit, buyerDocument: invoice.buyerDocument, amounts: invoice.amounts,
          qrMetadata: invoice.qrMetadata, image: imagePayload ? { sha256: imagePayload.sha256, contentType: imagePayload.contentType, size: imagePayload.size } : null });
        return await deps.repository.create({ invoice, image: imagePayload, actorSubject: actor.subject, idempotencyKey, requestHash,
          authority: receipt, assignment, correlationId: deps.correlationId.next() });
      } catch (error) { if (error instanceof InvoiceQrError) throw new InvoiceUseCaseError(error.code as InvoiceUseCaseErrorCode); throw mapError(error); }
    },
    async edit(actor: AuthenticatedActor, input: { readonly id: string; readonly thirdPartyId: string; readonly expectedVersion: number; readonly changes: Partial<CreateInvoiceCommand> }) {
      if (!id(input.id) || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) throw new InvoiceUseCaseError('INVALID_REQUEST');
      const receipt = await authorize(actor, input.thirdPartyId, 'invoices:update');
      if (!isAllowedChangeRole(receipt.roles)) throw new InvoiceUseCaseError('FORBIDDEN');
      const driverOwner = receipt.roles.includes('DRIVER') && !receipt.roles.includes('THIRD_PARTY_ADMIN') ? actor.subject : undefined;
      try {
        const current = await deps.repository.find({ id: input.id, thirdPartyId: input.thirdPartyId, ...(driverOwner ? { ownerSubject: driverOwner } : {}) });
        if (!current) throw new InvoiceUseCaseError('RESOURCE_NOT_FOUND');
        if (current.version !== input.expectedVersion) throw new InvoiceUseCaseError('INVOICE_VERSION_CONFLICT');
        const thirdPartyAdmin = receipt.roles.includes('THIRD_PARTY_ADMIN');
        const now = deps.clock.now();
        let policy: InvoiceEditPolicy | undefined;
        if (!thirdPartyAdmin) {
          if (current.origin === 'QR') throw new InvoiceUseCaseError('QR_IMMUTABLE');
          const evidence = await deps.editPolicy.read({ thirdPartyId: input.thirdPartyId });
          if (evidence.state === 'UNAVAILABLE') throw new InvoiceUseCaseError('EDIT_POLICY_UNAVAILABLE');
          policy = evidence.policy;
          const window = evaluateInvoiceEditWindow({ createdAt: current.createdAt, now, policy });
          if (window === 'POLICY_UNAVAILABLE') throw new InvoiceUseCaseError('EDIT_POLICY_UNAVAILABLE');
          if (current.origin !== 'MANUAL' || window === 'CLOSED') throw new InvoiceUseCaseError('EDIT_WINDOW_CLOSED');
        }
        const values = { invoiceDate: current.invoiceDate, invoiceTime: current.invoiceTime, invoiceNumber: current.invoiceNumber,
          issuerNit: current.issuerNit, buyerDocument: current.buyerDocument, amount: current.amounts.amount, vatAmount: current.amounts.vatAmount,
          otherTaxesAmount: current.amounts.otherTaxesAmount, totalAmount: current.amounts.totalAmount, imageId: current.imageId };
        const { image, ...changes } = input.changes;
        const imagePayload = image ? { ...image, id: deps.ids.next() } : undefined;
        const updatedManual = createInvoice({ ...values, ...changes, id: current.id, ownerSubject: current.ownerSubject, thirdPartyId: current.thirdPartyId,
          assignmentId: current.assignmentId, driverId: current.driverId, vehicleId: current.vehicleId, vehiclePlate: current.vehiclePlate,
          imageId: imagePayload?.id ?? current.imageId, now });
        const next: Invoice = current.origin === 'QR' ? { ...updatedManual, origin: 'QR', qrMetadata: current.qrMetadata } : updatedManual;
        const changed = current.invoiceDate !== next.invoiceDate || current.invoiceTime !== next.invoiceTime || current.invoiceNumber !== next.invoiceNumber
          || current.issuerNit !== next.issuerNit || current.buyerDocument !== next.buyerDocument || current.imageId !== next.imageId
          || JSON.stringify(current.amounts) !== JSON.stringify(next.amounts);
        if (!changed) return current;
        const versioned: Invoice = { ...next, version: current.version + 1, createdAt: current.createdAt };
        return await deps.repository.edit({ current, next: versioned, image: imagePayload, ...(policy ? { editPolicy: policy } : {}), actorSubject: actor.subject,
          expectedVersion: input.expectedVersion, authority: receipt, correlationId: deps.correlationId.next() });
      } catch (error) { throw mapError(error); }
    },
  };
}
