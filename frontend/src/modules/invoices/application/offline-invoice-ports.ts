export type OfflineInvoiceStatus = 'PENDING' | 'SENDING' | 'RETRYABLE_FAILURE' | 'REQUIRES_CORRECTION' | 'CONFLICT' | 'SYNCHRONIZED' | 'LINKED' | 'REJECTED';

export interface OfflineInvoiceRecord {
  readonly id: string;
  readonly subject: string;
  readonly thirdPartyId: string;
  readonly origin: 'MANUAL' | 'QR';
  readonly assignmentId: string;
  readonly vehicleId: string;
  readonly payload: Record<string, string>;
  readonly image?: Blob;
  readonly status: OfflineInvoiceStatus;
  readonly createdAt: string;
  readonly idempotencyKey: string;
  readonly message?: string;
  readonly serverSubmissionId?: string;
  readonly resultInvoiceId?: string | null;
}

export interface CachedOfflineAssignment {
  readonly id: string;
  readonly thirdPartyId: string;
  readonly vehicleId: string;
  readonly vehiclePlate?: string | null;
  readonly driver: { readonly id: string; readonly name: string };
  readonly status: 'ACTIVE';
  readonly startedAt: string;
  readonly endedAt: null;
  readonly version: number;
}

export interface OfflineCredentialRecord {
  readonly id: string;
  readonly subject: string;
  readonly thirdPartyId: string;
  readonly credential: string;
  readonly expiresAt: string;
  readonly assignmentIds: readonly string[];
  readonly assignments: readonly CachedOfflineAssignment[];
  readonly updatedAt: string;
}

export interface OfflineInvoiceQueuePort {
  save(record: Omit<OfflineInvoiceRecord, 'id' | 'status' | 'createdAt' | 'idempotencyKey'> & { readonly id?: string; readonly idempotencyKey?: string }): Promise<OfflineInvoiceRecord>;
  list(subject: string, thirdPartyId: string): Promise<OfflineInvoiceRecord[]>;
  listSubject(subject: string): Promise<OfflineInvoiceRecord[]>;
  recoverInterrupted(subject: string, thirdPartyId: string): Promise<OfflineInvoiceRecord[]>;
  update(record: OfflineInvoiceRecord): Promise<void>;
  clear(): Promise<void>;
  removeSubject(subject: string): Promise<void>;
  removeContext(subject: string, thirdPartyId: string): Promise<void>;
  remove(id: string): Promise<void>;
  saveCredential(record: OfflineCredentialRecord): Promise<void>;
  listCredentials(): Promise<OfflineCredentialRecord[]>;
  getCredential(subject: string, thirdPartyId: string): Promise<OfflineCredentialRecord | null>;
  removeCredential(subject: string, thirdPartyId: string): Promise<void>;
  subscribe(listener: () => void): () => void;
}

export interface OfflineCredentialClaims {
  readonly sub: string;
  readonly thirdPartyId: string;
  readonly assignmentIds: readonly string[];
  readonly scope: 'invoice:offline-capture';
  readonly iss: 'invoice-app';
  readonly aud: 'invoice-offline-capture';
  readonly iat: number;
  readonly exp: number;
  readonly jti: string;
}

export type OfflineCredentialPublicJwk = JsonWebKey & { readonly kid: string };
export type OfflineCredentialVerifier = (record: OfflineCredentialRecord, publicJwks: readonly OfflineCredentialPublicJwk[], now?: number) => Promise<OfflineCredentialClaims | null>;
