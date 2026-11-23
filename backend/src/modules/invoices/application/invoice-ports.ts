import type { Invoice } from '../domain/invoice';
import type { InvoiceEditPolicy } from '../domain/edit-window';
import type { AuthenticatedActor, ApplicationRole } from '@/modules/identity/domain/actor';
import type { InvoiceAssignmentFacts } from '@/modules/fleet/application/assignment-ports';

export type InvoicePermission = 'invoices:create' | 'invoices:read' | 'invoices:update';
export interface InvoiceAuthorityReceipt {
  readonly roles: readonly ApplicationRole[];
  readonly policyVersion: string;
  readonly contextRevision: string | null;
}
export interface InvoiceAuthorizationPort {
  authorize(input: { readonly actor: AuthenticatedActor; readonly thirdPartyId: string; readonly permission: InvoicePermission }): Promise<InvoiceAuthorityReceipt>;
}
export interface InvoiceTransactionAuthorityPort {
  confirm(input: InvoiceAuthorityReceipt & { readonly actorSubject: string; readonly thirdPartyId: string;
    readonly requiredRole: ApplicationRole; readonly transactionContext: unknown }): Promise<void>;
}

export type { InvoiceAssignmentFacts } from '@/modules/fleet/application/assignment-ports';
export interface InvoiceAssignmentConfirmationPort {
  readOwnActive(input: { readonly actorSubject: string; readonly thirdPartyId: string; readonly assignmentId: string; readonly vehicleId: string }): Promise<InvoiceAssignmentFacts | null>;
}

export type InvoiceEditPolicyEvidence = { readonly state: 'UNAVAILABLE' } | { readonly state: 'AVAILABLE'; readonly policy: InvoiceEditPolicy };
export interface InvoiceEditPolicyReader { read(input: { readonly thirdPartyId: string }): Promise<InvoiceEditPolicyEvidence> }
export interface InvoiceEditPolicyConfirmationPort {
  confirm(input: { readonly thirdPartyId: string; readonly revision: string; readonly scope: string; readonly transactionContext: unknown }): Promise<void>;
}

export interface InvoiceListQuery {
  readonly thirdPartyId: string;
  readonly ownerSubject?: string;
  readonly q?: string;
  readonly vehicleId?: string;
  readonly driverId?: string;
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: 'invoiceDate' | 'invoiceNumber' | 'totalAmount' | 'createdAt';
  readonly direction: 'asc' | 'desc';
}
export interface InvoiceImageInput {
  readonly data: Buffer;
  readonly contentType: 'image/jpeg' | 'image/png';
  readonly size: number;
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
}
export interface InvoiceImageReference {
  readonly provider: 'local'; readonly key: string; readonly contentType: 'image/jpeg' | 'image/png';
  readonly size: number; readonly width: number; readonly height: number; readonly sha256: string;
}
export interface PreparedInvoiceImage { readonly reference: InvoiceImageReference; readonly operationId: string }
export interface InvoiceImageStoragePort {
  prepare(input: { readonly image: InvoiceImageInput; readonly companyId: string; readonly thirdPartyId: string; readonly vehicleId: string; readonly invoiceId: string;
    readonly previousReference?: InvoiceImageReference }): Promise<PreparedInvoiceImage>;
  read(reference: InvoiceImageReference): Promise<Buffer>;
  commit(prepared: PreparedInvoiceImage): Promise<void>;
  compensate(prepared: PreparedInvoiceImage): Promise<void>;
  finalize(prepared: PreparedInvoiceImage): Promise<void>;
  remove(reference: InvoiceImageReference): Promise<void>;
}
export interface InvoiceImageDocumentInput { readonly id: string; readonly reference: InvoiceImageReference }
export interface InvoiceImagePayload extends InvoiceImageInput {
  readonly id: string;
}
export interface InvoiceImageContent extends Omit<InvoiceImagePayload, 'id'> { readonly id: string }
export interface InvoiceImageNormalizer {
  normalize(input: { readonly data: Uint8Array; readonly claimedType: string }): Promise<InvoiceImageInput>;
}
export interface InvoicePage { readonly items: readonly Invoice[]; readonly total: number }
export interface InvoiceRepositoryPort {
  list(query: InvoiceListQuery): Promise<InvoicePage>;
  find(input: { readonly id: string; readonly thirdPartyId: string; readonly ownerSubject?: string }): Promise<Invoice | null>;
  readImageReference(input: { readonly invoice: Invoice }): Promise<InvoiceImageReference | null>;
  create(input: { readonly invoice: Invoice; readonly image?: InvoiceImageDocumentInput; readonly actorSubject: string; readonly idempotencyKey: string; readonly requestHash: string; readonly authority: InvoiceAuthorityReceipt; readonly assignment: InvoiceAssignmentFacts; readonly correlationId: string }): Promise<Invoice>;
  edit(input: { readonly current: Invoice; readonly next: Invoice; readonly image?: InvoiceImageDocumentInput; readonly editPolicy?: InvoiceEditPolicy;
    readonly actorSubject: string; readonly expectedVersion: number; readonly authority: InvoiceAuthorityReceipt; readonly correlationId: string }): Promise<Invoice>;
}
export interface InvoiceAuditEvent {
  readonly eventId: string;
  readonly correlationId: string;
  readonly action: 'INVOICE_CREATED' | 'INVOICE_UPDATED';
  readonly actorSubject: string;
  readonly invoiceId: string;
  readonly thirdPartyId: string;
  readonly at: string;
  readonly changedFields: readonly string[];
}
export interface InvoiceAuditPort { record(event: InvoiceAuditEvent): Promise<void> }
export interface InvoiceClock { now(): Date }
export interface InvoiceIds { next(): string }
export interface InvoiceCorrelationId { next(): string }
