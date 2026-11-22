import { z } from 'zod';
import { ApplicationError } from '@/shared/application/application-error';
import type { PermissionScope } from '@/modules/authentication/domain/permissions';
import type { InvoiceApi, InvoiceDetailsDto, InvoiceDto, InvoiceFields, InvoicePage, InvoiceQuery, InvoiceUpdateFields, InvoiceQrPreview } from '../application/invoice-api';

export interface InvoiceTransport {
  invoice(method: 'GET' | 'POST' | 'PATCH', path: string, query: string, body?: FormData | { readonly qrContent: string },
    options?: { readonly signal?: AbortSignal; readonly idempotencyKey?: string; readonly binary?: boolean }): Promise<unknown>;
}
const id = z.string().regex(/^[a-f0-9]{24}$/);
const amounts = z.object({ amount: z.string().regex(/^\d{1,14}\.\d{2}$/), vatAmount: z.string().regex(/^\d{1,14}\.\d{2}$/),
  otherTaxesAmount: z.string().regex(/^\d{1,14}\.\d{2}$/), totalAmount: z.string().regex(/^\d{1,14}\.\d{2}$/) }).strict();
const qrMetadata = z.object({ parserVersion: z.literal('invoice-key-value-v1'), contentHash: z.string().regex(/^[a-f0-9]{64}$/), cufe: z.string().regex(/^[a-f0-9]{96}$/).optional(), sourceUrl: z.string().url().optional() }).strict();
const invoice = z.object({ id, origin: z.enum(['MANUAL', 'QR']), qrMetadata: qrMetadata.optional(), thirdPartyId: id, assignmentId: id, driverId: id, vehicleId: id,
  vehiclePlate: z.string().max(32).nullable(), invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  invoiceTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/), invoiceAtUtc: z.string().datetime(), invoiceNumber: z.string().min(1).max(64), issuerNit: z.string().regex(/^\d{1,20}$/),
  buyerDocument: z.string().min(1).max(40), amounts, version: z.number().int().positive(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  imageUrl: z.string().startsWith('/api/invoices/').nullable() }).strict();
const page = z.object({ items: z.array(invoice), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().positive().max(100) }).strict();
const details = z.object({ invoice, editability: z.object({ available: z.boolean(), reason: z.enum(['PERMISSION_INSUFFICIENT', 'EDIT_POLICY_UNAVAILABLE', 'EDIT_WINDOW_CLOSED', 'QR_IMMUTABLE']).nullable() }).strict() }).strict();
const qrPreview = z.object({ invoiceDate: z.string(), invoiceTime: z.string(), invoiceAtUtc: z.string(), invoiceNumber: z.string(), issuerNit: z.string(), buyerDocument: z.string(),
  amount: z.string(), vatAmount: z.string(), otherTaxesAmount: z.string(), totalAmount: z.string(), metadata: qrMetadata }).strict();
function parse<T>(schema: z.ZodType<T>, value: unknown): T { const parsed = schema.safeParse(value); if (!parsed.success) throw new ApplicationError('INVALID_RESPONSE'); return parsed.data; }
function queryParams(scope: PermissionScope, query?: InvoiceQuery) {
  if (scope.kind !== 'organization' || scope.companyId !== null || !id.safeParse(scope.thirdPartyId).success) throw new ApplicationError('FORBIDDEN');
  const params = new URLSearchParams({ scope: 'organization', thirdPartyId: scope.thirdPartyId! });
  if (query) for (const key of ['page', 'pageSize', 'sort', 'direction', 'q', 'vehicleId', 'dateFrom', 'dateTo'] as const) {
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
    async previewQr(scope, qrContent, signal) {
      if (typeof qrContent !== 'string' || !qrContent || new TextEncoder().encode(qrContent).length > 16 * 1024) throw new ApplicationError('CONFIGURATION');
      return parse(qrPreview, await http.invoice('POST', 'invoices/qr/preview', queryParams(scope), JSONBody({ qrContent }), { signal })) as InvoiceQrPreview;
    },
    async createQr(scope, input, idempotencyKey, signal) {
      if (!id.safeParse(input.assignmentId).success || !id.safeParse(input.vehicleId).success || !idempotencyKey) throw new ApplicationError('CONFIGURATION');
      const { image, ...payload } = input;
      return scoped(await http.invoice('POST', 'invoices/qr', queryParams(scope), multipart(payload, image), { signal, idempotencyKey }), scope);
    },
  };
}
function JSONBody(value: { readonly qrContent: string }) { return value; }
