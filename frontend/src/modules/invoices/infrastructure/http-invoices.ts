import { z } from 'zod';
import { ApplicationError } from '@/shared/application/application-error';
import type { PermissionScope } from '@/modules/authentication/domain/permissions';
import type { InvoiceApi, InvoiceDetailsDto, InvoiceDto, InvoiceFields, InvoicePage, InvoiceQuery, InvoiceUpdateFields, OfflineSubmissionDto, OfflineSubmissionHistoryPageDto,
  OfflineInvoiceConflictPageDto, OfflineInvoiceResolutionInput } from '../application/invoice-api';

export interface InvoiceTransport {
  invoice(method: 'GET' | 'POST' | 'PATCH', path: string, query: string, body?: unknown,
    options?: { readonly signal?: AbortSignal; readonly idempotencyKey?: string; readonly binary?: boolean }): Promise<unknown>;
}
const id = z.string().regex(/^[a-f0-9]{24}$/);
const amounts = z.object({ amount: z.string().regex(/^\d{1,14}\.\d{2}$/), vatAmount: z.string().regex(/^\d{1,14}\.\d{2}$/),
  otherTaxesAmount: z.string().regex(/^\d{1,14}\.\d{2}$/), totalAmount: z.string().regex(/^\d{1,14}\.\d{2}$/) }).strict();
const qrMetadata = z.object({ parserVersion: z.literal('invoice-key-value-v1'), contentHash: z.string().regex(/^[a-f0-9]{64}$/), cufe: z.string().regex(/^[a-f0-9]{96}$/).optional(), sourceUrl: z.string().url().optional() }).strict();
const invoice = z.object({ id, origin: z.enum(['MANUAL', 'QR']), captureChannel: z.enum(['ONLINE', 'OFFLINE']), qrMetadata: qrMetadata.optional(), thirdPartyId: id, assignmentId: id, driverId: id, vehicleId: id,
  vehiclePlate: z.string().max(32).nullable(), invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  invoiceTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/), invoiceAtUtc: z.string().datetime(), invoiceNumber: z.string().min(1).max(64), issuerNit: z.string().regex(/^\d{1,20}$/),
  buyerDocument: z.string().min(1).max(40), amounts, version: z.number().int().positive(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  imageUrl: z.string().startsWith('/api/invoices/').nullable() }).strict();
const editability = z.object({ available: z.boolean(), reason: z.enum(['PERMISSION_INSUFFICIENT', 'EDIT_POLICY_UNAVAILABLE', 'EDIT_WINDOW_CLOSED', 'QR_IMMUTABLE']).nullable() }).strict();
const listItem = invoice.extend({ editability });
const page = z.object({ items: z.array(listItem), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().positive().max(100) }).strict();
const details = z.object({ invoice, editability }).strict();
const submission = z.object({ id, thirdPartyId: id, origin: z.enum(['MANUAL', 'QR']), assignmentId: id, vehicleId: id,
  causes: z.array(z.enum(['BUSINESS_DUPLICATE', 'CUFE_DUPLICATE', 'ASSIGNMENT_CLOSED'])), candidateInvoiceIds: z.array(id),
  status: z.enum(['PENDING', 'CONFLICT', 'REQUIRES_CORRECTION', 'SYNCHRONIZED', 'LINKED', 'REJECTED']), version: z.number().int().positive(),
  createdAt: z.string().datetime(), expiresAt: z.string().datetime().nullable(), resultInvoiceId: id.nullable(), resolutionReason: z.string().max(500).nullable() }).strict();
const conflictCandidate = z.object({ id, invoiceNumber: z.string(), issuerNit: z.string(), invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cause: z.enum(['BUSINESS_DUPLICATE', 'CUFE_DUPLICATE']) }).strict();
const conflictItem = z.object({ submission, reviewFields: z.object({ invoiceDate: z.string().optional(), invoiceTime: z.string().optional(), invoiceNumber: z.string().optional(), issuerNit: z.string().optional(),
  buyerDocument: z.string().optional(), amount: z.string().optional(), vatAmount: z.string().optional(), otherTaxesAmount: z.string().optional(), totalAmount: z.string().optional() }).strict(),
  candidates: z.array(conflictCandidate), imageAvailable: z.boolean() }).strict();
const conflictPage = z.object({ items: z.array(conflictItem), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().positive().max(100) }).strict();
const historyItem = z.object({ id, thirdPartyId: id, origin: z.enum(['MANUAL', 'QR']), status: z.enum(['PENDING', 'CONFLICT', 'REQUIRES_CORRECTION', 'SYNCHRONIZED', 'LINKED', 'REJECTED']),
  driverName: z.string().max(200).nullable().optional(), vehiclePlate: z.string().max(32).nullable().optional(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(), causes: z.array(z.enum(['BUSINESS_DUPLICATE', 'CUFE_DUPLICATE', 'ASSIGNMENT_CLOSED'])),
  invoiceNumber: z.string().nullable(), invoiceDate: z.string().nullable(), issuerNit: z.string().nullable(), totalAmount: z.string().nullable(), resolutionReason: z.string().max(500).nullable(),
  resolution: z.object({ action: z.enum(['LINK_DUPLICATE', 'APPROVE_CLOSED_ASSIGNMENT', 'REJECT']), at: z.string().datetime(), reason: z.string().max(500),
    resultInvoiceNumber: z.string().nullable(), resultInvoiceDate: z.string().nullable() }).strict().nullable() }).strict();
const historyPage = z.object({ items: z.array(historyItem), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().positive().max(100) }).strict();
function parse<T>(schema: z.ZodType<T>, value: unknown): T { const parsed = schema.safeParse(value); if (!parsed.success) throw new ApplicationError('INVALID_RESPONSE'); return parsed.data; }
function queryParams(scope: PermissionScope, query?: InvoiceQuery) {
  if (scope.kind !== 'organization' || scope.companyId !== null || !id.safeParse(scope.thirdPartyId).success) throw new ApplicationError('FORBIDDEN');
  const params = new URLSearchParams({ scope: 'organization', thirdPartyId: scope.thirdPartyId! });
  if (query) for (const key of ['page', 'pageSize', 'sort', 'direction', 'q', 'vehicleId', 'driverId', 'dateFrom', 'dateTo'] as const) {
    const value = query[key]; if (value !== undefined) params.set(key, String(value));
  }
  return params.toString();
}
function resourcePath(value: string, image = false) {
  if (!id.safeParse(value).success) throw new ApplicationError('CONFIGURATION');
  return `invoices/${value}${image ? '/image' : ''}`;
}
function multipart(payload: unknown, file?: File) {
  const body = new FormData(); body.set('payload', JSON.stringify(payload)); if (file) body.set('image', file, file.name); return body;
}
function scoped(raw: unknown, scope: PermissionScope, expectedId?: string): InvoiceDto {
  const value = parse(invoice, raw);
  if (value.thirdPartyId !== scope.thirdPartyId || (expectedId && value.id !== expectedId)) throw new ApplicationError('INVALID_RESPONSE');
  return value;
}
export function createInvoiceApi(http: InvoiceTransport): InvoiceApi {
  return {
    async issueOfflineCredential(scope, assignments, signal) {
      const result = parse(z.object({ credential: z.string().min(1).max(8192), expiresAt: z.string().datetime(), subject: z.string().min(1).max(128),
        thirdPartyId: id, assignmentIds: z.array(id).min(1).max(100) }).strict(),
      await http.invoice('POST', 'invoice-sync/offline-credential', queryParams(scope), { assignments }, { signal }));
      if (result.thirdPartyId !== scope.thirdPartyId || result.assignmentIds.length !== assignments.length
        || assignments.some(value => !result.assignmentIds.includes(value.assignmentId))) throw new ApplicationError('INVALID_RESPONSE');
      return result;
    },
    async submitOffline(scope, input, idempotencyKey, signal) {
      if (!id.safeParse(input.assignmentId).success || !id.safeParse(input.vehicleId).success || !idempotencyKey || idempotencyKey.length > 128) throw new ApplicationError('CONFIGURATION');
      const body = multipart({ origin: input.origin, assignmentId: input.assignmentId, vehicleId: input.vehicleId, ...input.payload }, input.image);
      const result = parse(submission, await http.invoice('POST', 'invoice-sync/submissions', queryParams(scope), body, { signal, idempotencyKey }));
      if (result.thirdPartyId !== scope.thirdPartyId || result.origin !== input.origin) throw new ApplicationError('INVALID_RESPONSE');
      return result as OfflineSubmissionDto;
    },
    async offlineSubmission(scope, idValue, signal) {
      if (!id.safeParse(idValue).success) throw new ApplicationError('CONFIGURATION');
      const result = parse(submission, await http.invoice('GET', `invoice-sync/submissions/${idValue}`, queryParams(scope), undefined, { signal }));
      if (result.thirdPartyId !== scope.thirdPartyId || result.id !== idValue) throw new ApplicationError('INVALID_RESPONSE');
      return result as OfflineSubmissionDto;
    },
    async listOfflineSubmissionHistory(scope, pageNumber, pageSize, signal) {
      if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new ApplicationError('CONFIGURATION');
      const query = `${queryParams(scope)}&page=${pageNumber}&pageSize=${pageSize}`;
      const result = parse(historyPage, await http.invoice('GET', 'invoice-sync/submissions', query, undefined, { signal }));
      if (result.items.some(item => item.thirdPartyId !== scope.thirdPartyId)) throw new ApplicationError('INVALID_RESPONSE');
      return result as OfflineSubmissionHistoryPageDto;
    },
    async listOfflineConflicts(scope, pageNumber, pageSize, signal) {
      if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new ApplicationError('CONFIGURATION');
      const query = `${queryParams(scope)}&page=${pageNumber}&pageSize=${pageSize}`;
      const result = parse(conflictPage, await http.invoice('GET', 'invoice-sync/conflicts', query, undefined, { signal }));
      if (result.items.some(item => item.submission.thirdPartyId !== scope.thirdPartyId || item.candidates.some(candidate => !item.submission.candidateInvoiceIds.includes(candidate.id))))
        throw new ApplicationError('INVALID_RESPONSE');
      return result as OfflineInvoiceConflictPageDto;
    },
    async offlineConflictImage(scope, idValue, signal) {
      if (!id.safeParse(idValue).success) throw new ApplicationError('CONFIGURATION');
      const raw = await http.invoice('GET', `invoice-sync/submissions/${idValue}/image`, queryParams(scope), undefined, { signal, binary: true });
      if (!(raw instanceof Blob) || !['image/jpeg', 'image/png'].includes(raw.type) || raw.size > 5 * 1024 * 1024) throw new ApplicationError('INVALID_RESPONSE');
      return raw;
    },
    async resolveOfflineConflict(scope, idValue, input: OfflineInvoiceResolutionInput, signal) {
      if (!id.safeParse(idValue).success || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) throw new ApplicationError('CONFIGURATION');
      const result = parse(submission, await http.invoice('POST', `invoice-sync/submissions/${idValue}/resolution`, queryParams(scope), input, { signal }));
      if (result.id !== idValue || result.thirdPartyId !== scope.thirdPartyId) throw new ApplicationError('INVALID_RESPONSE');
      return result as OfflineSubmissionDto;
    },
    async list(scope, query, signal) {
      const result = parse(page, await http.invoice('GET', 'invoices', queryParams(scope, query), undefined, { signal }));
      if (result.items.some(item => item.thirdPartyId !== scope.thirdPartyId)) throw new ApplicationError('INVALID_RESPONSE');
      return result as InvoicePage;
    },
    async detail(scope, idValue, signal) {
      const result = parse(details, await http.invoice('GET', resourcePath(idValue), queryParams(scope), undefined, { signal }));
      return { ...result, invoice: scoped(result.invoice, scope, idValue) } as InvoiceDetailsDto;
    },
    async create(scope, fields: InvoiceFields, idempotencyKey, signal) {
      if (!id.safeParse(fields.assignmentId).success || !id.safeParse(fields.vehicleId).success || !idempotencyKey || idempotencyKey.length > 128) throw new ApplicationError('CONFIGURATION');
      const { image, ...payload } = fields;
      return scoped(await http.invoice('POST', 'invoices', queryParams(scope), multipart(payload, image), { signal, idempotencyKey }), scope);
    },
    async update(scope, idValue, fields: InvoiceUpdateFields, signal) {
      const { image, ...payload } = fields;
      return scoped(await http.invoice('PATCH', resourcePath(idValue), queryParams(scope), multipart(payload, image), { signal }), scope, idValue);
    },
    async image(scope, idValue, signal) {
      const raw = await http.invoice('GET', resourcePath(idValue, true), queryParams(scope), undefined, { signal, binary: true });
      if (!(raw instanceof Blob) || !['image/jpeg', 'image/png'].includes(raw.type) || raw.size > 5 * 1024 * 1024) throw new ApplicationError('INVALID_RESPONSE');
      return raw;
    },
    async createQr(scope, input, idempotencyKey, signal) {
      if (!id.safeParse(input.assignmentId).success || !id.safeParse(input.vehicleId).success || !idempotencyKey) throw new ApplicationError('CONFIGURATION');
      const { image, ...payload } = input;
      return scoped(await http.invoice('POST', 'invoices/qr', queryParams(scope), multipart(payload, image), { signal, idempotencyKey }), scope);
    },
  };
}
