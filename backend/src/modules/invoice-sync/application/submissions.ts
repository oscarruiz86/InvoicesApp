import { createHash } from 'node:crypto';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import type { InvoiceAuthorizationPort, InvoiceImageInput } from '@/modules/invoices/application/invoice-ports';
import type { CreateInvoiceCommand, createInvoices } from '@/modules/invoices/application/invoices';
import { InvoiceSubmissionError, type InvoiceSubmission, type InvoiceSubmissionCause } from '../domain/submission';
import type { InvoiceSyncFactsPort, OfflineSubmissionRepository, SubmissionImagesPort } from './submission-ports';
import { parseInvoiceQr } from '@/modules/invoices/domain/invoice-qr';

type InvoiceService = ReturnType<typeof createInvoices>;
export interface OfflineSubmissionCommand {
  readonly thirdPartyId: string; readonly origin: 'MANUAL' | 'QR'; readonly assignmentId: string; readonly vehicleId: string;
  readonly payload: Record<string, string>; readonly image?: InvoiceImageInput; readonly idempotencyKey: string;
}
export class OfflineSubmissionError extends Error {
  constructor(readonly code: 'INVALID_REQUEST' | 'FORBIDDEN' | 'IDEMPOTENCY_CONFLICT' | 'SUBMISSION_NOT_FOUND' | 'SUBMISSION_STORAGE_UNAVAILABLE'
    | 'SUBMISSION_VERSION_CONFLICT' | 'AUTHORIZATION_UNAVAILABLE') { super(code); }
}
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
const codeOf = (value: unknown) => value && typeof value === 'object' && 'code' in value ? String(value.code) : value instanceof Error ? value.message : '';
function hash(value: unknown) { return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex'); }

function manualCommand(record: InvoiceSubmission, image?: InvoiceImageInput): CreateInvoiceCommand & { readonly idempotencyKey: string } {
  const field = (name: keyof InvoiceSubmission['payload']): string => {
    const value = record.payload[name];
    if (typeof value !== 'string') throw new OfflineSubmissionError('INVALID_REQUEST');
    return value;
  };
  return { thirdPartyId: record.thirdPartyId, assignmentId: record.assignmentId, vehicleId: record.vehicleId,
    invoiceDate: field('invoiceDate'), invoiceTime: field('invoiceTime'), invoiceNumber: field('invoiceNumber'), issuerNit: field('issuerNit'),
    buyerDocument: field('buyerDocument'), amount: field('amount'), vatAmount: field('vatAmount'), otherTaxesAmount: field('otherTaxesAmount'),
    totalAmount: field('totalAmount'), ...(image ? { image } : {}), idempotencyKey: record.idempotencyKey };
}

function reviewFields(record: InvoiceSubmission): Record<string, string> {
  const values = record.origin === 'QR' ? parseInvoiceQr(record.payload.qrContent!) : record.payload;
  const fields = ['invoiceDate', 'invoiceTime', 'invoiceNumber', 'issuerNit', 'buyerDocument', 'amount', 'vatAmount', 'otherTaxesAmount', 'totalAmount'];
  return Object.fromEntries(fields.flatMap(key => typeof values[key as keyof typeof values] === 'string' ? [[key, values[key as keyof typeof values] as string]] : []));
}

function correctionReason(origin: OfflineSubmissionCommand['origin'], code: string): string {
  if (code === 'IMAGE_REQUIRED') return 'Adjunta una imagen de la factura en formato JPEG o PNG y presenta un registro nuevo.';
  if (code === 'IMAGE_TOO_LARGE') return 'La imagen supera 5 MiB. Adjunta una imagen más pequeña y presenta un registro nuevo.';
  if (['IMAGE_TYPE_UNSUPPORTED', 'IMAGE_INVALID', 'IMAGE_DIMENSIONS_INVALID'].includes(code))
    return 'La imagen no es válida o no se puede leer. Adjunta una imagen JPEG o PNG legible y presenta un registro nuevo.';
  if (origin === 'QR') return 'No se pudo validar el código QR. Vuelve a escanearlo o captura la factura manualmente.';
  return 'Revisa la fecha, hora (HH:mm:ss), número, NIT, documento, valores e imagen de la factura. Corrige los datos indicados y presenta un registro nuevo.';
}

export function createOfflineInvoiceSubmissions(deps: { readonly repository: OfflineSubmissionRepository; readonly invoices: InvoiceService;
  readonly authorization: InvoiceAuthorizationPort; readonly images: SubmissionImagesPort; readonly facts: InvoiceSyncFactsPort;
  readonly clock: { now(): Date }; readonly ids: { next(): string } }) {
  async function transition(current: InvoiceSubmission, input: Parameters<OfflineSubmissionRepository['transition']>[0]) {
    try { return await deps.repository.transition(input); }
    catch (error) {
      if (error instanceof InvoiceSubmissionError && error.code === 'SUBMISSION_VERSION_CONFLICT') {
        throw new OfflineSubmissionError('SUBMISSION_VERSION_CONFLICT');
      }
      throw error;
    }
  }
  async function finishCorrection(record: InvoiceSubmission, reason: string) {
    return transition(record, { current: record, expectedVersion: record.version, status: 'REQUIRES_CORRECTION', now: deps.clock.now(), resolutionReason: reason });
  }
  async function finishRejected(record: InvoiceSubmission, reason: string) {
    return transition(record, { current: record, expectedVersion: record.version, status: 'REJECTED', now: deps.clock.now(), resolutionReason: reason });
  }
  async function discardStage(input: { readonly id: string; readonly thirdPartyId: string; readonly ownerSubject: string;
    readonly reference: NonNullable<InvoiceSubmission['imageReference']> }): Promise<void> {
    try { await deps.images.remove(input.reference); }
    catch {
      await deps.repository.scheduleImageCleanup({ submissionId: input.id, thirdPartyId: input.thirdPartyId,
        ownerSubject: input.ownerSubject, reference: input.reference, now: deps.clock.now() }).catch(() => undefined);
    }
  }
  async function authorizeAdmin(actor: AuthenticatedActor, thirdPartyId: string, permission: 'invoices:read' | 'invoices:update') {
    if (!validId(thirdPartyId)) throw new OfflineSubmissionError('INVALID_REQUEST');
    try {
      const receipt = await deps.authorization.authorize({ actor, thirdPartyId, permission });
      if (!receipt.roles.includes('THIRD_PARTY_ADMIN')) throw new OfflineSubmissionError('FORBIDDEN');
    } catch (error) { if (error instanceof OfflineSubmissionError) throw error; throw new OfflineSubmissionError('FORBIDDEN'); }
  }
  async function process(actor: AuthenticatedActor, record: InvoiceSubmission): Promise<InvoiceSubmission> {
    if (record.status !== 'PENDING') return record;
    const assignment = await deps.facts.assignment({ subject: record.ownerSubject, thirdPartyId: record.thirdPartyId, assignmentId: record.assignmentId, vehicleId: record.vehicleId });
    if (assignment.status === 'MISSING' || !assignment.facts) return finishRejected(record, 'La asignación no pertenece al conductor o ya no existe.');
    let parsed: Awaited<ReturnType<InvoiceService['previewQr']>> | null = null;
    if (record.origin === 'QR') {
      try { parsed = await deps.invoices.previewQr(actor, { thirdPartyId: record.thirdPartyId, qrContent: record.payload.qrContent! }); }
      catch (error) {
        const code = codeOf(error);
        if (['QR_INVALID', 'QR_INCOMPLETE', 'QR_UNSUPPORTED'].includes(code)) return finishCorrection(record, 'El código QR no se pudo leer o le faltan datos. Vuelve a escanearlo o captura la factura manualmente.');
        if (code === 'FORBIDDEN') return finishRejected(record, 'La autorización para registrar facturas no está vigente.');
        throw new OfflineSubmissionError('AUTHORIZATION_UNAVAILABLE');
      }
    }
    let image: InvoiceImageInput | undefined;
    try { if (record.imageReference) image = await deps.images.read(record.imageReference); }
    catch { throw new OfflineSubmissionError('SUBMISSION_STORAGE_UNAVAILABLE'); }
    try {
      const invoice = record.origin === 'MANUAL'
        ? await deps.invoices.createFromOfflineSubmission(actor, manualCommand(record, image), { id: record.id, expectedVersion: record.version })
        : await deps.invoices.createQrFromOfflineSubmission(actor, { thirdPartyId: record.thirdPartyId, assignmentId: record.assignmentId, vehicleId: record.vehicleId,
          qrContent: record.payload.qrContent!, ...(image ? { image } : {}), idempotencyKey: record.idempotencyKey }, { id: record.id, expectedVersion: record.version });
      const result = await deps.repository.find({ id: record.id, thirdPartyId: record.thirdPartyId, ownerSubject: record.ownerSubject });
      if (!result || result.status !== 'SYNCHRONIZED' || result.resultInvoiceId !== invoice.id) throw new OfflineSubmissionError('SUBMISSION_STORAGE_UNAVAILABLE');
      return result;
    } catch (error) {
      const code = codeOf(error);
      if (code === 'INVOICE_DUPLICATE') {
        const fresh = await deps.facts.duplicates({ thirdPartyId: record.thirdPartyId, issuerNit: parsed?.issuerNit ?? record.payload.issuerNit!,
          invoiceNumber: parsed?.invoiceNumber ?? record.payload.invoiceNumber!, ...(parsed?.metadata.cufe ? { cufe: parsed.metadata.cufe } : {}) });
        const latestAssignment = await deps.facts.assignment({ subject: record.ownerSubject, thirdPartyId: record.thirdPartyId, assignmentId: record.assignmentId, vehicleId: record.vehicleId });
        const nextCauses: InvoiceSubmissionCause[] = [...(fresh.causes.length ? fresh.causes : ['BUSINESS_DUPLICATE' as const]),
          ...(latestAssignment.status === 'CLOSED' ? ['ASSIGNMENT_CLOSED' as const] : [])];
        return transition(record, { current: record, expectedVersion: record.version, status: 'CONFLICT', now: deps.clock.now(), causes: nextCauses,
          candidateInvoiceIds: fresh.candidates.map(value => value.id) });
      }
      if (['QR_INVALID', 'QR_INCOMPLETE', 'QR_UNSUPPORTED', 'INVALID_REQUEST', 'IMAGE_REQUIRED', 'IMAGE_TOO_LARGE', 'IMAGE_TYPE_UNSUPPORTED', 'IMAGE_INVALID', 'IMAGE_DIMENSIONS_INVALID'].includes(code))
        return finishCorrection(record, correctionReason(record.origin, code));
      if (code === 'ASSIGNMENT_NOT_ELIGIBLE') {
        const current = await deps.facts.assignment({ subject: record.ownerSubject, thirdPartyId: record.thirdPartyId, assignmentId: record.assignmentId, vehicleId: record.vehicleId });
        if (current.status === 'CLOSED') {
          const fresh = await deps.facts.duplicates({ thirdPartyId: record.thirdPartyId, issuerNit: parsed?.issuerNit ?? record.payload.issuerNit!,
            invoiceNumber: parsed?.invoiceNumber ?? record.payload.invoiceNumber!, ...(parsed?.metadata.cufe ? { cufe: parsed.metadata.cufe } : {}) });
          return transition(record, { current: record, expectedVersion: record.version, status: 'CONFLICT', now: deps.clock.now(),
            causes: [...fresh.causes, 'ASSIGNMENT_CLOSED'], candidateInvoiceIds: fresh.candidates.map(value => value.id) });
        }
        return finishRejected(record, 'La asignación dejó de ser válida para el conductor.');
      }
      if (code === 'INVOICE_VERSION_CONFLICT') {
        const latest = await deps.repository.find({ id: record.id, thirdPartyId: record.thirdPartyId, ownerSubject: record.ownerSubject });
        if (latest && latest.status !== 'PENDING') return latest;
        throw new OfflineSubmissionError('SUBMISSION_VERSION_CONFLICT');
      }
      if (code === 'FORBIDDEN') return finishRejected(record, 'La autorización para registrar facturas no está vigente.');
      if (['AUTHORIZATION_UNAVAILABLE', 'CONFIGURATION_ERROR'].includes(code)) throw new OfflineSubmissionError('AUTHORIZATION_UNAVAILABLE');
      throw new OfflineSubmissionError('SUBMISSION_STORAGE_UNAVAILABLE');
    }
  }

  return {
    async submit(actor: AuthenticatedActor, command: OfflineSubmissionCommand): Promise<InvoiceSubmission> {
      if (!validId(command.thirdPartyId) || !validId(command.assignmentId) || !validId(command.vehicleId) || !command.idempotencyKey || command.idempotencyKey.length > 128
        || !['MANUAL', 'QR'].includes(command.origin) || (command.origin === 'QR' ? typeof command.payload.qrContent !== 'string' : 'qrContent' in command.payload)
        || command.origin === 'MANUAL' && !command.image) throw new OfflineSubmissionError('INVALID_REQUEST');
      try {
        const receipt = await deps.authorization.authorize({ actor, thirdPartyId: command.thirdPartyId, permission: 'invoices:create' });
        if (!receipt.roles.includes('DRIVER')) throw new OfflineSubmissionError('FORBIDDEN');
      } catch (error) { if (error instanceof OfflineSubmissionError) throw error; throw new OfflineSubmissionError('FORBIDDEN'); }
      const requestHash = hash({ origin: command.origin, thirdPartyId: command.thirdPartyId, ownerSubject: actor.subject, assignmentId: command.assignmentId,
        vehicleId: command.vehicleId, payload: command.payload, image: command.image ? { sha256: command.image.sha256, contentType: command.image.contentType, size: command.image.size } : null });
      const existing = await deps.repository.findByIdentity({ thirdPartyId: command.thirdPartyId, ownerSubject: actor.subject, idempotencyKey: command.idempotencyKey });
      if (existing && existing.requestHash !== requestHash) throw new OfflineSubmissionError('IDEMPOTENCY_CONFLICT');
      if (existing) return process(actor, existing);
      const id = deps.ids.next();
      let imageReference: InvoiceSubmission['imageReference'] = null;
      if (command.image) imageReference = await deps.images.stage({ submissionId: id, thirdPartyId: command.thirdPartyId, vehicleId: command.vehicleId, image: command.image });
      try {
        const submission = await deps.repository.create({ id, ownerSubject: actor.subject, thirdPartyId: command.thirdPartyId, origin: command.origin,
          assignmentId: command.assignmentId, vehicleId: command.vehicleId, idempotencyKey: command.idempotencyKey, requestHash,
          payload: command.payload, imageReference, now: deps.clock.now() });
        if (submission.id !== id && imageReference) await discardStage({ id, thirdPartyId: command.thirdPartyId, ownerSubject: actor.subject, reference: imageReference });
        return process(actor, submission);
      } catch (error) {
        if (imageReference) await discardStage({ id, thirdPartyId: command.thirdPartyId, ownerSubject: actor.subject, reference: imageReference });
        if (codeOf(error) === 'IDEMPOTENCY_CONFLICT') throw new OfflineSubmissionError('IDEMPOTENCY_CONFLICT');
        throw error;
      }
    },
    async own(actor: AuthenticatedActor, input: { readonly id: string; readonly thirdPartyId: string }) {
      if (!validId(input.id) || !validId(input.thirdPartyId)) throw new OfflineSubmissionError('INVALID_REQUEST');
      try {
        const receipt = await deps.authorization.authorize({ actor, thirdPartyId: input.thirdPartyId, permission: 'invoices:read' });
        if (!receipt.roles.includes('DRIVER')) throw new OfflineSubmissionError('FORBIDDEN');
      } catch (error) { if (error instanceof OfflineSubmissionError) throw error; throw new OfflineSubmissionError('FORBIDDEN'); }
      return deps.repository.find({ id: input.id, thirdPartyId: input.thirdPartyId, ownerSubject: actor.subject });
    },
    async ownHistory(actor: AuthenticatedActor, input: { readonly thirdPartyId: string; readonly page: number; readonly pageSize: number }) {
      if (!validId(input.thirdPartyId) || !Number.isSafeInteger(input.page) || input.page < 1
        || !Number.isSafeInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) throw new OfflineSubmissionError('INVALID_REQUEST');
      let historyQuery: ReturnType<typeof deps.repository.listOwned> extends Promise<infer T> ? T : never;
      let includeAssignmentLabels = false;
      try {
        const receipt = await deps.authorization.authorize({ actor, thirdPartyId: input.thirdPartyId, permission: 'invoices:read' });
        if (receipt.roles.includes('DRIVER')) historyQuery = await deps.repository.listOwned({ ownerSubject: actor.subject, ...input });
        else if (receipt.roles.includes('THIRD_PARTY_ADMIN')) {
          historyQuery = await deps.repository.listForThirdParty(input);
          includeAssignmentLabels = true;
        }
        else throw new OfflineSubmissionError('FORBIDDEN');
      } catch (error) { if (error instanceof OfflineSubmissionError) throw error; throw new OfflineSubmissionError('FORBIDDEN'); }
      const page = historyQuery!;
      const assignmentLabels = includeAssignmentLabels
        ? await deps.facts.historyAssignments({ thirdPartyId: input.thirdPartyId, assignments: page.items.map(({ record }) => ({ subject: record.ownerSubject,
          assignmentId: record.assignmentId, vehicleId: record.vehicleId })) }).catch(() => [])
        : [];
      const assignmentLabelsById = new Map(assignmentLabels.map(value => [value.assignmentId, value]));
      const items = await Promise.all(page.items.map(async ({ record, resolution }) => {
        let fields: Record<string, string> = {};
        try { fields = reviewFields(record); } catch { /* Invalid QR submissions remain visible with the fields that can be identified. */ }
        let linkedInvoice: { readonly invoiceNumber: string; readonly invoiceDate: string } | undefined;
        if (resolution?.action === 'LINK_DUPLICATE' && resolution.resultInvoiceId) {
          const [candidate] = await deps.facts.candidates({ thirdPartyId: record.thirdPartyId, ids: [resolution.resultInvoiceId] }).catch(() => []);
          if (candidate) linkedInvoice = { invoiceNumber: candidate.invoiceNumber, invoiceDate: candidate.invoiceDate };
        }
        return {
          id: record.id, thirdPartyId: record.thirdPartyId, origin: record.origin, status: record.status, createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString(),
          causes: record.causes, invoiceNumber: fields.invoiceNumber ?? null, invoiceDate: fields.invoiceDate ?? null,
          issuerNit: fields.issuerNit ?? null, totalAmount: fields.totalAmount ?? null, resolutionReason: record.resolutionReason,
          resolution: resolution ? { action: resolution.action, at: resolution.at.toISOString(), reason: resolution.reason,
            resultInvoiceNumber: linkedInvoice?.invoiceNumber ?? (record.status === 'SYNCHRONIZED' ? fields.invoiceNumber ?? null : null),
            resultInvoiceDate: linkedInvoice?.invoiceDate ?? (record.status === 'SYNCHRONIZED' ? fields.invoiceDate ?? null : null) } : null,
          ...(includeAssignmentLabels ? { driverName: assignmentLabelsById.get(record.assignmentId)?.driverName ?? null,
            vehiclePlate: assignmentLabelsById.get(record.assignmentId)?.vehiclePlate ?? null } : {}),
        };
      }));
      return { ...page, items };
    },
    async adminConflicts(actor: AuthenticatedActor, input: { readonly thirdPartyId: string; readonly page: number; readonly pageSize: number }) {
      await authorizeAdmin(actor, input.thirdPartyId, 'invoices:read');
      if (!Number.isSafeInteger(input.page) || input.page < 1 || !Number.isSafeInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100)
        throw new OfflineSubmissionError('INVALID_REQUEST');
      const page = await deps.repository.listConflicts(input);
      const items = await Promise.all(page.items.map(async record => ({ record, reviewFields: reviewFields(record),
        candidates: await deps.facts.candidates({ thirdPartyId: record.thirdPartyId, ids: record.candidateInvoiceIds }) })));
      return { ...page, items };
    },
    async adminImage(actor: AuthenticatedActor, input: { readonly id: string; readonly thirdPartyId: string }) {
      await authorizeAdmin(actor, input.thirdPartyId, 'invoices:read');
      if (!validId(input.id)) throw new OfflineSubmissionError('INVALID_REQUEST');
      const record = await deps.repository.find({ id: input.id, thirdPartyId: input.thirdPartyId });
      if (!record || record.status !== 'CONFLICT' || !record.imageReference) throw new OfflineSubmissionError('SUBMISSION_NOT_FOUND');
      try { return await deps.images.read(record.imageReference); }
      catch { throw new OfflineSubmissionError('SUBMISSION_STORAGE_UNAVAILABLE'); }
    },
    async resolveConflict(actor: AuthenticatedActor, input: { readonly id: string; readonly thirdPartyId: string; readonly expectedVersion: number;
      readonly action: 'LINK_DUPLICATE' | 'APPROVE_CLOSED_ASSIGNMENT' | 'REJECT'; readonly reason: string; readonly resultInvoiceId?: string }) {
      await authorizeAdmin(actor, input.thirdPartyId, 'invoices:update');
      if (!validId(input.id) || !validId(input.thirdPartyId) || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1
        || !input.reason.trim() || input.reason.trim().length > 500) throw new OfflineSubmissionError('INVALID_REQUEST');
      const record = await deps.repository.find({ id: input.id, thirdPartyId: input.thirdPartyId });
      if (!record) throw new OfflineSubmissionError('SUBMISSION_NOT_FOUND');
      const reason = input.reason.trim();
      if (record.status !== 'CONFLICT' || record.version !== input.expectedVersion) {
        if (['SYNCHRONIZED', 'LINKED', 'REJECTED'].includes(record.status) && record.version === input.expectedVersion + 1) {
          const retryAction = input.action;
          const resultInvoiceId = retryAction === 'LINK_DUPLICATE' ? input.resultInvoiceId
            : retryAction === 'APPROVE_CLOSED_ASSIGNMENT' ? record.resultInvoiceId ?? undefined : undefined;
          if ((retryAction === 'LINK_DUPLICATE' || retryAction === 'APPROVE_CLOSED_ASSIGNMENT') && !resultInvoiceId)
            throw new OfflineSubmissionError('SUBMISSION_VERSION_CONFLICT');
          try { return await deps.repository.resolve({ current: record, expectedVersion: input.expectedVersion, action: retryAction,
            actorSubject: actor.subject, reason, now: deps.clock.now(), ...(resultInvoiceId ? { resultInvoiceId } : {}) }); }
          catch (error) { if (codeOf(error) === 'SUBMISSION_VERSION_CONFLICT') throw new OfflineSubmissionError('SUBMISSION_VERSION_CONFLICT'); throw error; }
        }
        throw new OfflineSubmissionError('SUBMISSION_VERSION_CONFLICT');
      }
      if (input.action === 'LINK_DUPLICATE') {
        if (!input.resultInvoiceId || !record.causes.some(cause => cause !== 'ASSIGNMENT_CLOSED')) throw new OfflineSubmissionError('INVALID_REQUEST');
        return deps.repository.resolve({ current: record, expectedVersion: input.expectedVersion, action: 'LINK_DUPLICATE', actorSubject: actor.subject,
          reason, now: deps.clock.now(), resultInvoiceId: input.resultInvoiceId });
      }
      if (input.action === 'REJECT') {
        if (input.resultInvoiceId !== undefined) throw new OfflineSubmissionError('INVALID_REQUEST');
        return deps.repository.resolve({ current: record, expectedVersion: input.expectedVersion, action: 'REJECT', actorSubject: actor.subject, reason, now: deps.clock.now() });
      }
      if (input.resultInvoiceId !== undefined || record.causes.length !== 1 || record.causes[0] !== 'ASSIGNMENT_CLOSED' || !record.imageReference)
        throw new OfflineSubmissionError('INVALID_REQUEST');
      const assignment = await deps.facts.assignment({ subject: record.ownerSubject, thirdPartyId: record.thirdPartyId, assignmentId: record.assignmentId, vehicleId: record.vehicleId });
      if (assignment.status !== 'CLOSED' || !assignment.facts) throw new OfflineSubmissionError('SUBMISSION_VERSION_CONFLICT');
      let image: InvoiceImageInput;
      try { image = await deps.images.read(record.imageReference); }
      catch { throw new OfflineSubmissionError('SUBMISSION_STORAGE_UNAVAILABLE'); }
      try {
        if (record.origin === 'MANUAL') await deps.invoices.createOfflineException(actor, manualCommand(record, image), {
          ownerSubject: record.ownerSubject, assignment: assignment.facts, submissionId: record.id, expectedVersion: record.version, reason });
        else await deps.invoices.createOfflineException(actor, { thirdPartyId: record.thirdPartyId, assignmentId: record.assignmentId, vehicleId: record.vehicleId,
          qrContent: record.payload.qrContent!, image, idempotencyKey: record.idempotencyKey }, {
          ownerSubject: record.ownerSubject, assignment: assignment.facts, submissionId: record.id, expectedVersion: record.version, reason });
        const result = await deps.repository.find({ id: record.id, thirdPartyId: record.thirdPartyId, ownerSubject: record.ownerSubject });
        if (!result || result.status !== 'SYNCHRONIZED') throw new OfflineSubmissionError('SUBMISSION_STORAGE_UNAVAILABLE');
        return result;
      } catch (error) {
        if (codeOf(error) === 'ASSIGNMENT_HISTORICAL_INTERVAL_INVALID') throw new OfflineSubmissionError('INVALID_REQUEST');
        if (codeOf(error) === 'INVOICE_DUPLICATE') {
          const fields = record.origin === 'QR' ? parseInvoiceQr(record.payload.qrContent!) : record.payload;
          const duplicates = await deps.facts.duplicates({ thirdPartyId: record.thirdPartyId, issuerNit: fields.issuerNit!, invoiceNumber: fields.invoiceNumber!,
            ...(record.origin === 'QR' && parseInvoiceQr(record.payload.qrContent!).metadata.cufe ? { cufe: parseInvoiceQr(record.payload.qrContent!).metadata.cufe } : {}) });
          if (duplicates.causes.length) return deps.repository.transition({ current: record, expectedVersion: record.version, status: 'CONFLICT', now: deps.clock.now(),
            causes: [...duplicates.causes, 'ASSIGNMENT_CLOSED'], candidateInvoiceIds: duplicates.candidates.map(candidate => candidate.id) });
        }
        throw error;
      }
    },
  };
}
