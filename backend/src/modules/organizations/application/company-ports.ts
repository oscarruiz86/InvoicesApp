import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import type { OrganizationScope } from '@/modules/identity/domain/authorization-facts';
import type { AuthorizationPolicy, Permission } from '@/modules/identity/domain/permissions';
import type { Company, CompanyRecord } from '../domain/company';
import type { OrganizationEvidence, ResourceFacts } from '@/modules/identity/domain/authorization-facts';

export interface CompanyQuery { page: number; pageSize: number; q?: string; status?: 'ACTIVE' | 'INACTIVE'; documentType?: 'NIT'; country?: string; department?: string; city?: string; sort: 'businessName' | 'documentNumber' | 'createdAt' | 'updatedAt' | 'status'; direction: 'asc' | 'desc' }
export interface Administrator { associationId: string; subject: string; capability: 'COMPANY_ADMIN'; active: boolean; version: string }
export interface CompanyEvent { eventId: string; correlationId: string; at: string; subject: string; companyId: string; scope: OrganizationScope; action: 'COMPANY_CREATED' | 'COMPANY_UPDATED' | 'COMPANY_ACTIVATED' | 'COMPANY_DEACTIVATED'; result: 'allowed'; before: Company | null; after: Company; beforeVersion: string | null; afterVersion: string }
/** A transaction-local facade; no driver session escapes infrastructure. */
export interface CompanyTransaction {
  policy(): Promise<AuthorizationPolicy>;
  evidence(subject: string, scope: OrganizationScope): Promise<OrganizationEvidence | undefined>;
  coordinate(subject: string, scope: OrganizationScope, policyVersion: string): Promise<void>;
  find(id: string, scope: OrganizationScope): Promise<CompanyRecord | null>;
  list(scope: OrganizationScope, query: CompanyQuery): Promise<{ items: CompanyRecord[]; total: number }>;
  save(value: Company, expectedVersion: string | null): Promise<CompanyRecord>;
  administrators(id: string, page: number, pageSize: number, active?: boolean): Promise<{ items: Administrator[]; total: number }>;
  record(event: CompanyEvent): Promise<void>;
}
export interface CompanyRepository {
  run<T>(write: boolean, action: (transaction: CompanyTransaction) => Promise<T>): Promise<T>;
  nextId(): string;
}
export interface CompanyAccess { actor: AuthenticatedActor; scope: OrganizationScope }
export interface CompanyPermissionCheck { permission: Permission; facts?: ResourceFacts }
