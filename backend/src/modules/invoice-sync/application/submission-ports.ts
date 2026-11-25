import type { InvoiceAssignmentFacts } from '@/modules/fleet/application/assignment-ports';
import type { InvoiceImageInput } from '@/modules/invoices/application/invoice-ports';
import type { createInvoiceSubmission, InvoiceSubmission, InvoiceSubmissionCause, SubmissionImageReference, transitionInvoiceSubmission } from '../domain/submission';

export interface InvoiceDuplicateCandidate {
  readonly id: string;
  readonly invoiceNumber: string;
  readonly issuerNit: string;
  readonly invoiceDate: string;
  readonly cause: 'BUSINESS_DUPLICATE' | 'CUFE_DUPLICATE';
}

export interface OfflineSubmissionResolutionEvent {
  readonly action: 'LINK_DUPLICATE' | 'APPROVE_CLOSED_ASSIGNMENT' | 'REJECT';
  readonly at: Date;
  readonly reason: string;
  readonly resultInvoiceId?: string;
}

export interface OwnedOfflineSubmission {
  readonly record: InvoiceSubmission;
  readonly resolution: OfflineSubmissionResolutionEvent | null;
}

export interface OfflineSubmissionRepository {
  create(input: Parameters<typeof createInvoiceSubmission>[0]): Promise<InvoiceSubmission>;
  find(input: { readonly id: string; readonly thirdPartyId: string; readonly ownerSubject?: string }): Promise<InvoiceSubmission | null>;
  findByIdentity(input: { readonly thirdPartyId: string; readonly ownerSubject: string; readonly idempotencyKey: string }): Promise<InvoiceSubmission | null>;
  listConflicts(input: { readonly thirdPartyId: string; readonly page: number; readonly pageSize: number }): Promise<{
    readonly items: readonly InvoiceSubmission[]; readonly total: number; readonly page: number; readonly pageSize: number;
  }>;
  listOwned(input: { readonly ownerSubject: string; readonly thirdPartyId: string; readonly page: number; readonly pageSize: number }): Promise<{
    readonly items: readonly OwnedOfflineSubmission[]; readonly total: number; readonly page: number; readonly pageSize: number;
  }>;
  listForThirdParty(input: { readonly thirdPartyId: string; readonly page: number; readonly pageSize: number }): Promise<{
    readonly items: readonly OwnedOfflineSubmission[]; readonly total: number; readonly page: number; readonly pageSize: number;
  }>;
  transition(input: Parameters<typeof transitionInvoiceSubmission>[0]): Promise<InvoiceSubmission>;
  resolve(input: ResolveOfflineSubmissionInput): Promise<InvoiceSubmission>;
  scheduleImageCleanup(input: { readonly submissionId: string; readonly thirdPartyId: string; readonly ownerSubject: string;
    readonly reference: SubmissionImageReference; readonly now: Date }): Promise<void>;
  expired(input: { readonly now: Date; readonly limit: number }): Promise<InvoiceSubmission[]>;
  pendingImageCleanup(limit: number): Promise<readonly { readonly submissionId: string; readonly reference: SubmissionImageReference }[]>;
  completeImageCleanup(submissionId: string): Promise<void>;
}

export interface ResolveOfflineSubmissionInput {
  readonly current: InvoiceSubmission;
  readonly expectedVersion: number;
  readonly action: 'LINK_DUPLICATE' | 'APPROVE_CLOSED_ASSIGNMENT' | 'REJECT';
  readonly actorSubject: string;
  readonly reason: string;
  readonly now: Date;
  readonly resultInvoiceId?: string;
}

export interface SubmissionImagesPort {
  stage(input: { readonly submissionId: string; readonly thirdPartyId: string; readonly vehicleId: string; readonly image: InvoiceImageInput }): Promise<SubmissionImageReference>;
  read(reference: SubmissionImageReference): Promise<InvoiceImageInput>;
  remove(reference: SubmissionImageReference): Promise<void>;
}

export interface InvoiceSyncFactsPort {
  assignment(input: { readonly subject: string; readonly thirdPartyId: string; readonly assignmentId: string; readonly vehicleId: string }):
    Promise<{ readonly status: 'ACTIVE' | 'CLOSED' | 'MISSING'; readonly facts?: InvoiceAssignmentFacts }>;
  historyAssignments(input: { readonly thirdPartyId: string; readonly assignments: readonly { readonly subject: string; readonly assignmentId: string; readonly vehicleId: string }[] }):
    Promise<readonly { readonly assignmentId: string; readonly driverName: string | null; readonly vehiclePlate: string | null }[]>;
  duplicates(input: { readonly thirdPartyId: string; readonly issuerNit: string; readonly invoiceNumber: string; readonly cufe?: string }):
    Promise<{ readonly causes: readonly InvoiceSubmissionCause[]; readonly candidates: readonly InvoiceDuplicateCandidate[] }>;
  candidates(input: { readonly thirdPartyId: string; readonly ids: readonly string[] }): Promise<readonly InvoiceDuplicateCandidate[]>;
}
