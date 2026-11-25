import type { PermissionScope } from '@/modules/authentication/domain/permissions';

export interface InvoiceAmounts { readonly amount: string; readonly vatAmount: string; readonly otherTaxesAmount: string; readonly totalAmount: string }
export interface InvoiceDto {
  readonly id: string; readonly origin: 'MANUAL' | 'QR'; readonly captureChannel: 'ONLINE' | 'OFFLINE'; readonly qrMetadata?: { readonly parserVersion: 'invoice-key-value-v1'; readonly contentHash: string; readonly cufe?: string; readonly sourceUrl?: string };
  readonly thirdPartyId: string; readonly assignmentId: string; readonly driverId: string;
  readonly vehicleId: string; readonly vehiclePlate: string | null; readonly invoiceDate: string; readonly invoiceTime: string; readonly invoiceAtUtc: string;
  readonly invoiceNumber: string; readonly issuerNit: string; readonly buyerDocument: string; readonly amounts: InvoiceAmounts;
  readonly version: number; readonly createdAt: string; readonly updatedAt: string; readonly imageUrl: string | null;
}
export interface InvoiceDetailsDto {
  readonly invoice: InvoiceDto;
  readonly editability: { readonly available: boolean; readonly reason: 'PERMISSION_INSUFFICIENT' | 'EDIT_POLICY_UNAVAILABLE' | 'EDIT_WINDOW_CLOSED' | 'QR_IMMUTABLE' | null };
}
export interface InvoiceListItemDto extends InvoiceDto {
  readonly editability: InvoiceDetailsDto['editability'];
}
export interface InvoicePage { readonly items: readonly InvoiceListItemDto[]; readonly total: number; readonly page: number; readonly pageSize: number }
export type OfflineSubmissionState = 'PENDING' | 'CONFLICT' | 'REQUIRES_CORRECTION' | 'SYNCHRONIZED' | 'LINKED' | 'REJECTED';
export interface OfflineSubmissionDto {
  readonly id: string; readonly thirdPartyId: string; readonly origin: 'MANUAL' | 'QR'; readonly assignmentId: string; readonly vehicleId: string;
  readonly causes: readonly ('BUSINESS_DUPLICATE' | 'CUFE_DUPLICATE' | 'ASSIGNMENT_CLOSED')[]; readonly candidateInvoiceIds: readonly string[];
  readonly status: OfflineSubmissionState; readonly version: number; readonly createdAt: string; readonly expiresAt: string | null;
  readonly resultInvoiceId: string | null; readonly resolutionReason: string | null;
}
export interface OfflineInvoiceConflictCandidateDto {
  readonly id: string; readonly invoiceNumber: string; readonly issuerNit: string; readonly invoiceDate: string;
  readonly cause: 'BUSINESS_DUPLICATE' | 'CUFE_DUPLICATE';
}
export interface OfflineInvoiceConflictItemDto {
  readonly submission: OfflineSubmissionDto;
  readonly reviewFields: Partial<Record<'invoiceDate' | 'invoiceTime' | 'invoiceNumber' | 'issuerNit' | 'buyerDocument' | 'amount' | 'vatAmount' | 'otherTaxesAmount' | 'totalAmount', string>>;
  readonly candidates: readonly OfflineInvoiceConflictCandidateDto[];
  readonly imageAvailable: boolean;
}
export interface OfflineInvoiceConflictPageDto { readonly items: readonly OfflineInvoiceConflictItemDto[]; readonly total: number; readonly page: number; readonly pageSize: number }
export interface OfflineSubmissionHistoryItemDto {
  readonly id: string; readonly thirdPartyId: string; readonly origin: 'MANUAL' | 'QR'; readonly status: OfflineSubmissionState;
  readonly driverName?: string | null; readonly vehiclePlate?: string | null;
  readonly createdAt: string; readonly updatedAt: string; readonly causes: readonly ('BUSINESS_DUPLICATE' | 'CUFE_DUPLICATE' | 'ASSIGNMENT_CLOSED')[];
  readonly invoiceNumber: string | null; readonly invoiceDate: string | null; readonly issuerNit: string | null; readonly totalAmount: string | null;
  readonly resolutionReason: string | null;
  readonly resolution: { readonly action: 'LINK_DUPLICATE' | 'APPROVE_CLOSED_ASSIGNMENT' | 'REJECT'; readonly at: string; readonly reason: string;
    readonly resultInvoiceNumber: string | null; readonly resultInvoiceDate: string | null } | null;
}
export interface OfflineSubmissionHistoryPageDto { readonly items: readonly OfflineSubmissionHistoryItemDto[]; readonly total: number; readonly page: number; readonly pageSize: number }
export type OfflineInvoiceResolutionInput =
  | { readonly action: 'LINK_DUPLICATE'; readonly expectedVersion: number; readonly reason: string; readonly resultInvoiceId: string }
  | { readonly action: 'APPROVE_CLOSED_ASSIGNMENT'; readonly expectedVersion: number; readonly reason: string }
  | { readonly action: 'REJECT'; readonly expectedVersion: number; readonly reason: string };
export interface InvoiceQuery {
  readonly page: number; readonly pageSize: number; readonly sort: 'invoiceDate' | 'invoiceNumber' | 'totalAmount' | 'createdAt';
  readonly direction: 'asc' | 'desc'; readonly q?: string; readonly vehicleId?: string; readonly driverId?: string; readonly dateFrom?: string; readonly dateTo?: string;
}
export interface InvoiceFields {
  readonly assignmentId: string; readonly vehicleId: string; readonly invoiceDate: string; readonly invoiceTime: string;
  readonly invoiceNumber: string; readonly issuerNit: string; readonly buyerDocument: string; readonly amount: string;
  readonly vatAmount: string; readonly otherTaxesAmount: string; readonly totalAmount: string; readonly image?: File;
}
export interface InvoiceUpdateFields extends Partial<Omit<InvoiceFields, 'assignmentId' | 'vehicleId'>> { readonly expectedVersion: number }
export interface InvoiceQrPreview { readonly invoiceDate: string; readonly invoiceTime: string; readonly invoiceAtUtc: string; readonly invoiceNumber: string;
  readonly issuerNit: string; readonly buyerDocument: string; readonly amount: string; readonly vatAmount: string; readonly otherTaxesAmount: string;
  readonly totalAmount: string; readonly metadata: Pick<NonNullable<InvoiceDto['qrMetadata']>, 'parserVersion' | 'cufe' | 'sourceUrl'> }
export interface InvoiceApi {
  issueOfflineCredential(scope: PermissionScope, assignments: readonly { readonly assignmentId: string; readonly vehicleId: string }[], signal: AbortSignal): Promise<{ readonly credential: string; readonly expiresAt: string; readonly subject: string; readonly thirdPartyId: string; readonly assignmentIds: readonly string[] }>;
  submitOffline(scope: PermissionScope, input: { readonly origin: 'MANUAL' | 'QR'; readonly assignmentId: string; readonly vehicleId: string; readonly payload: Record<string, string>; readonly image?: File }, idempotencyKey: string, signal: AbortSignal): Promise<OfflineSubmissionDto>;
  offlineSubmission(scope: PermissionScope, id: string, signal: AbortSignal): Promise<OfflineSubmissionDto>;
  listOfflineSubmissionHistory(scope: PermissionScope, page: number, pageSize: number, signal: AbortSignal): Promise<OfflineSubmissionHistoryPageDto>;
  listOfflineConflicts(scope: PermissionScope, page: number, pageSize: number, signal: AbortSignal): Promise<OfflineInvoiceConflictPageDto>;
  offlineConflictImage(scope: PermissionScope, id: string, signal: AbortSignal): Promise<Blob>;
  resolveOfflineConflict(scope: PermissionScope, id: string, input: OfflineInvoiceResolutionInput, signal: AbortSignal): Promise<OfflineSubmissionDto>;
  list(scope: PermissionScope, query: InvoiceQuery, signal: AbortSignal): Promise<InvoicePage>;
  detail(scope: PermissionScope, id: string, signal: AbortSignal): Promise<InvoiceDetailsDto>;
  create(scope: PermissionScope, fields: InvoiceFields, idempotencyKey: string, signal: AbortSignal): Promise<InvoiceDto>;
  update(scope: PermissionScope, id: string, fields: InvoiceUpdateFields, signal: AbortSignal): Promise<InvoiceDto>;
  image(scope: PermissionScope, id: string, signal: AbortSignal): Promise<Blob>;
  createQr(scope: PermissionScope, input: { readonly qrContent: string; readonly assignmentId: string; readonly vehicleId: string; readonly image?: File }, idempotencyKey: string, signal: AbortSignal): Promise<InvoiceDto>;
}
