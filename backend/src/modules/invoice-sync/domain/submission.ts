export type InvoiceSubmissionOrigin = 'MANUAL' | 'QR';
export type InvoiceSubmissionStatus = 'PENDING' | 'CONFLICT' | 'REQUIRES_CORRECTION' | 'SYNCHRONIZED' | 'LINKED' | 'REJECTED';
export type InvoiceSubmissionCause = 'BUSINESS_DUPLICATE' | 'CUFE_DUPLICATE' | 'ASSIGNMENT_CLOSED';
export interface SubmissionImageReference {
  readonly provider: 'local'; readonly key: string; readonly contentType: 'image/jpeg' | 'image/png'; readonly size: number;
  readonly width: number; readonly height: number; readonly sha256: string;
}

export interface InvoiceSubmission {
  readonly id: string;
  readonly ownerSubject: string;
  readonly thirdPartyId: string;
  readonly origin: InvoiceSubmissionOrigin;
  readonly assignmentId: string;
  readonly vehicleId: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly payload: Readonly<Record<string, string>>;
  readonly imageReference: SubmissionImageReference | null;
  readonly causes: readonly InvoiceSubmissionCause[];
  readonly candidateInvoiceIds: readonly string[];
  readonly status: InvoiceSubmissionStatus;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly expiresAt: Date | null;
  readonly resultInvoiceId: string | null;
  readonly resolutionReason: string | null;
}

export class InvoiceSubmissionError extends Error {
  constructor(readonly code: 'INVALID_SUBMISSION' | 'SUBMISSION_VERSION_CONFLICT' | 'SUBMISSION_TRANSITION_INVALID') { super(code); }
}

const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
const validDate = (value: unknown): value is Date => value instanceof Date && Number.isFinite(value.getTime());
const statuses: readonly InvoiceSubmissionStatus[] = ['PENDING', 'CONFLICT', 'REQUIRES_CORRECTION', 'SYNCHRONIZED', 'LINKED', 'REJECTED'];
const causes: readonly InvoiceSubmissionCause[] = ['BUSINESS_DUPLICATE', 'CUFE_DUPLICATE', 'ASSIGNMENT_CLOSED'];

export function createInvoiceSubmission(input: {
  readonly id: string; readonly ownerSubject: string; readonly thirdPartyId: string; readonly origin: InvoiceSubmissionOrigin;
  readonly assignmentId: string; readonly vehicleId: string; readonly idempotencyKey: string; readonly requestHash: string;
  readonly payload: Readonly<Record<string, string>>; readonly imageReference?: SubmissionImageReference | null; readonly now: Date;
}): InvoiceSubmission {
  const keys = ['id', 'ownerSubject', 'thirdPartyId', 'origin', 'assignmentId', 'vehicleId', 'idempotencyKey', 'requestHash', 'payload', 'imageReference', 'now'];
  const image = input.imageReference ?? null;
  if (Object.keys(input).some(key => !keys.includes(key)) || !validId(input.id) || !validId(input.thirdPartyId) || !validId(input.assignmentId)
    || !validId(input.vehicleId) || typeof input.ownerSubject !== 'string' || !input.ownerSubject || input.ownerSubject.length > 128
    || !['MANUAL', 'QR'].includes(input.origin) || typeof input.idempotencyKey !== 'string' || !input.idempotencyKey || input.idempotencyKey.length > 128
    || typeof input.requestHash !== 'string' || !/^[a-f0-9]{64}$/.test(input.requestHash) || !input.payload || typeof input.payload !== 'object'
    || Object.values(input.payload).some(value => typeof value !== 'string' || value.length > 16_384)
    || Object.keys(input.payload).length > 32 || !validDate(input.now)
    || image !== null && (image.provider !== 'local' || !/^([a-f0-9]{24}\/){4}imagen\.(?:jpg|png)$/.test(image.key)
      || !['image/jpeg', 'image/png'].includes(image.contentType) || !Number.isSafeInteger(image.size) || image.size < 1 || image.size > 5 * 1024 * 1024
      || !Number.isSafeInteger(image.width) || image.width < 1 || !Number.isSafeInteger(image.height) || image.height < 1 || !/^[a-f0-9]{64}$/.test(image.sha256))) throw new InvoiceSubmissionError('INVALID_SUBMISSION');
  if (input.origin === 'QR' ? typeof input.payload.qrContent !== 'string' || !input.payload.qrContent : 'qrContent' in input.payload)
    throw new InvoiceSubmissionError('INVALID_SUBMISSION');
  return Object.freeze({ id: input.id, ownerSubject: input.ownerSubject, thirdPartyId: input.thirdPartyId, origin: input.origin,
    assignmentId: input.assignmentId, vehicleId: input.vehicleId, idempotencyKey: input.idempotencyKey, requestHash: input.requestHash,
    payload: Object.freeze({ ...input.payload }), imageReference: image ? Object.freeze({ ...image }) : null,
    causes: [], candidateInvoiceIds: [], status: 'PENDING', version: 1, createdAt: new Date(input.now), updatedAt: new Date(input.now),
    expiresAt: null, resultInvoiceId: null, resolutionReason: null });
}

export function transitionInvoiceSubmission(input: { readonly current: InvoiceSubmission; readonly expectedVersion: number;
  readonly status: InvoiceSubmissionStatus; readonly now: Date; readonly causes?: readonly InvoiceSubmissionCause[];
  readonly candidateInvoiceIds?: readonly string[]; readonly resultInvoiceId?: string | null; readonly resolutionReason?: string | null }): InvoiceSubmission {
  const { current } = input;
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion !== current.version) throw new InvoiceSubmissionError('SUBMISSION_VERSION_CONFLICT');
  if (!statuses.includes(input.status) || !validDate(input.now) || (input.causes ?? []).some(cause => !causes.includes(cause))
    || (input.candidateInvoiceIds ?? []).some(value => !validId(value))) throw new InvoiceSubmissionError('INVALID_SUBMISSION');
  const allowed: Readonly<Record<InvoiceSubmissionStatus, readonly InvoiceSubmissionStatus[]>> = {
    PENDING: ['CONFLICT', 'REQUIRES_CORRECTION', 'SYNCHRONIZED', 'REJECTED'], CONFLICT: ['CONFLICT', 'LINKED', 'SYNCHRONIZED', 'REJECTED'],
    REQUIRES_CORRECTION: ['REJECTED'], SYNCHRONIZED: [], LINKED: [], REJECTED: [],
  };
  if (!allowed[current.status].includes(input.status)) throw new InvoiceSubmissionError('SUBMISSION_TRANSITION_INVALID');
  const isConflict = input.status === 'CONFLICT';
  if (isConflict && !(input.causes?.length)) throw new InvoiceSubmissionError('INVALID_SUBMISSION');
  if (current.status === 'CONFLICT' && isConflict && JSON.stringify([...new Set(input.causes ?? [])].sort()) === JSON.stringify([...new Set(current.causes)].sort())
    && JSON.stringify([...new Set(input.candidateInvoiceIds ?? [])].sort()) === JSON.stringify([...new Set(current.candidateInvoiceIds)].sort())) {
    throw new InvoiceSubmissionError('SUBMISSION_TRANSITION_INVALID');
  }
  if ((input.status === 'SYNCHRONIZED' || input.status === 'LINKED') && !validId(input.resultInvoiceId)) throw new InvoiceSubmissionError('INVALID_SUBMISSION');
  if (['SYNCHRONIZED', 'LINKED', 'REJECTED'].includes(input.status) && (!input.resolutionReason?.trim() || input.resolutionReason.length > 500)) throw new InvoiceSubmissionError('INVALID_SUBMISSION');
  const resolved = ['SYNCHRONIZED', 'LINKED', 'REJECTED'].includes(input.status);
  const timeBound = isConflict || input.status === 'REQUIRES_CORRECTION';
  return Object.freeze({ ...current, status: input.status, version: current.version + 1, updatedAt: new Date(input.now),
    causes: isConflict ? [...new Set(input.causes)] : current.causes,
    candidateInvoiceIds: isConflict ? [...new Set(input.candidateInvoiceIds ?? [])] : current.candidateInvoiceIds,
    expiresAt: timeBound ? new Date(input.now.getTime() + 30 * 86_400_000) : current.expiresAt,
    imageReference: current.imageReference,
    resultInvoiceId: input.resultInvoiceId ?? current.resultInvoiceId, resolutionReason: input.resolutionReason ?? current.resolutionReason,
    ...(resolved && !isConflict ? { expiresAt: null } : {}) });
}
