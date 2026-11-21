import type { PermissionScope } from '@/modules/authentication/domain/permissions';

export interface InvoiceAmounts { readonly amount: string; readonly vatAmount: string; readonly otherTaxesAmount: string; readonly totalAmount: string }
export interface InvoiceDto {
  readonly id: string; readonly origin: 'MANUAL'; readonly thirdPartyId: string; readonly assignmentId: string; readonly driverId: string;
  readonly vehicleId: string; readonly vehiclePlate: string | null; readonly invoiceDate: string; readonly invoiceTime: string; readonly invoiceAtUtc: string;
  readonly invoiceNumber: string; readonly issuerNit: string; readonly buyerDocument: string; readonly amounts: InvoiceAmounts;
  readonly version: number; readonly createdAt: string; readonly updatedAt: string; readonly imageUrl: string | null;
}
export interface InvoiceDetailsDto {
  readonly invoice: InvoiceDto;
  readonly editability: { readonly available: boolean; readonly reason: 'PERMISSION_INSUFFICIENT' | 'EDIT_POLICY_UNAVAILABLE' | 'EDIT_WINDOW_CLOSED' | null };
}
export interface InvoicePage { readonly items: readonly InvoiceDto[]; readonly total: number; readonly page: number; readonly pageSize: number }
export interface InvoiceQuery {
  readonly page: number; readonly pageSize: number; readonly sort: 'invoiceDate' | 'invoiceNumber' | 'totalAmount' | 'createdAt';
  readonly direction: 'asc' | 'desc'; readonly q?: string; readonly vehicleId?: string; readonly dateFrom?: string; readonly dateTo?: string;
}
export interface InvoiceFields {
  readonly assignmentId: string; readonly vehicleId: string; readonly invoiceDate: string; readonly invoiceTime: string;
  readonly invoiceNumber: string; readonly issuerNit: string; readonly buyerDocument: string; readonly amount: string;
  readonly vatAmount: string; readonly otherTaxesAmount: string; readonly totalAmount: string; readonly image?: File;
}
export interface InvoiceUpdateFields extends Partial<Omit<InvoiceFields, 'assignmentId' | 'vehicleId'>> { readonly expectedVersion: number }
export interface InvoiceApi {
  list(scope: PermissionScope, query: InvoiceQuery, signal: AbortSignal): Promise<InvoicePage>;
  detail(scope: PermissionScope, id: string, signal: AbortSignal): Promise<InvoiceDetailsDto>;
  create(scope: PermissionScope, fields: InvoiceFields, idempotencyKey: string, signal: AbortSignal): Promise<InvoiceDto>;
  update(scope: PermissionScope, id: string, fields: InvoiceUpdateFields, signal: AbortSignal): Promise<InvoiceDto>;
  image(scope: PermissionScope, id: string, signal: AbortSignal): Promise<Blob>;
}
