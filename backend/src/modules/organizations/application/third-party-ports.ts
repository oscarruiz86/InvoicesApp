import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import type { OrganizationScope } from '@/modules/identity/domain/authorization-facts';
import type { AuthorizationPolicy } from '@/modules/identity/domain/permissions';
import type { ThirdParty, ThirdPartyRecord, ThirdPartyRelationship } from '../domain/third-party';

export interface ThirdPartyQuery {
  page: number; pageSize: number; q?: string; status?: 'ACTIVE' | 'INACTIVE'; documentType?: 'NIT';
  relatedCompanyId?: string;
  relationshipActiveOnly?: boolean;
  country?: string; department?: string; city?: string;
  sort: 'businessName' | 'documentNumber' | 'createdAt' | 'updatedAt' | 'status' | 'country' | 'department' | 'city'; direction: 'asc' | 'desc';
}
export interface ThirdPartyEvent {
  eventId: string; correlationId: string; at: string; subject: string; companyId: string | null; thirdPartyId: string;
  scope: OrganizationScope; action: 'THIRD_PARTY_CREATED' | 'THIRD_PARTY_UPDATED' | 'THIRD_PARTY_ACTIVATED' | 'THIRD_PARTY_DEACTIVATED' | 'RELATIONSHIP_ACTIVATED' | 'RELATIONSHIP_DEACTIVATED';
  result: 'allowed'; beforeVersion: string | null; afterVersion: string; changedFields: readonly string[];
}
export interface ThirdPartyTransaction {
  policy(): Promise<AuthorizationPolicy>;
  evidence(subject: string, scope: OrganizationScope): Promise<import('@/modules/identity/domain/authorization-facts').OrganizationEvidence | undefined>;
  coordinate(subject: string, scope: OrganizationScope, policyVersion: string, thirdPartyId?: string, requireRelationship?: boolean): Promise<void>;
  find(id: string, scope: OrganizationScope): Promise<ThirdPartyRecord | null>;
  list(scope: OrganizationScope, query: ThirdPartyQuery): Promise<{ items: ThirdPartyRecord[]; total: number }>;
  save(value: ThirdParty, expectedVersion: string | null): Promise<ThirdPartyRecord>;
  relationship(companyId: string, thirdPartyId: string): Promise<(ThirdPartyRelationship & { version: string }) | null>;
  saveRelationship(value: ThirdPartyRelationship, expectedVersion: string | null): Promise<(ThirdPartyRelationship & { version: string })>;
  record(event: ThirdPartyEvent): Promise<void>;
}
export interface ThirdPartyRepository { run<T>(write: boolean, action: (transaction: ThirdPartyTransaction) => Promise<T>): Promise<T>; nextId(): string }
export interface ThirdPartyAccess { actor: AuthenticatedActor; scope: OrganizationScope }
