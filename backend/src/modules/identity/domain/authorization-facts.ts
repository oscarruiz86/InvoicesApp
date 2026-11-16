import type { ApplicationRole } from './actor';

export type OrganizationScope =
  | { readonly kind: 'self' | 'global'; readonly companyId: null; readonly thirdPartyId: null }
  | { readonly kind: 'organization'; readonly companyId: string | null; readonly thirdPartyId: string | null };
export interface LocalCapability {
  readonly role: ApplicationRole;
  readonly companyId: string | null;
  readonly thirdPartyId: string | null;
  readonly active: boolean;
}
/** Facts supplied by Organizations, never reconstructed from client claims. */
export interface OrganizationEvidence {
  readonly subject: string;
  readonly scope: OrganizationScope;
  readonly revision: string;
  readonly companyActive: boolean;
  readonly thirdPartyActive: boolean;
  readonly relationshipActive: boolean;
  readonly capabilities: readonly LocalCapability[];
}
export interface ResourceFacts {
  readonly type: 'companies' | 'third-parties' | 'users' | 'drivers' | 'vehicles' | 'assignments' | 'invoices' | 'parameters' | 'roles' | 'associations' | 'audit';
  readonly id: string;
  readonly revision: string;
  readonly companyId: string | null;
  readonly thirdPartyId: string | null;
  readonly ownerSubject?: string;
  readonly active?: boolean;
  readonly vehicleActive?: boolean;
  readonly assignmentActive?: boolean;
  readonly assignedSubject?: string;
  readonly origin?: 'MANUAL' | 'QR';
  readonly eligible?: boolean;
  readonly targetSubject?: string;
  readonly targetRole?: ApplicationRole;
  readonly associationKind?: 'company-third-party' | 'user-company' | 'user-third-party';
}
export type DenialReason = 'PERMISSION' | 'CONTEXT' | 'RESOURCE' | 'ELIGIBILITY';
export type AuthorizationDecision = { readonly allowed: true } | { readonly allowed: false; readonly reason: DenialReason };
export const sameScope = (a: OrganizationScope, b: OrganizationScope) => a.kind === b.kind && a.companyId === b.companyId && a.thirdPartyId === b.thirdPartyId;
export function validScope(scope: OrganizationScope): boolean {
  const id = (value: string | null) => value === null || (typeof value === 'string' && value.trim().length > 0 && value.length <= 128);
  return id(scope.companyId) && id(scope.thirdPartyId) && (scope.kind === 'organization'
    ? Boolean(scope.companyId || scope.thirdPartyId)
    : ['self', 'global'].includes(scope.kind) && scope.companyId === null && scope.thirdPartyId === null);
}
