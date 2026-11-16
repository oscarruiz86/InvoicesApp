import type { AuthorizationPolicy, Grant, Permission } from '../domain/permissions';
import type { OrganizationEvidence, OrganizationScope, ResourceFacts } from '../domain/authorization-facts';

export interface OrganizationAccessReader { read(subject: string, scope: OrganizationScope): Promise<OrganizationEvidence | null> }
/** Must apply scope and ownership filters BEFORE pagination/counting. Null hides inaccessible IDs. */
export interface ResourceAccessReader { read(subject: string, scope: OrganizationScope, permission: Permission, id: string): Promise<ResourceFacts | null> }
export interface AuthorizationReceipt {
  readonly subject: string; readonly permission: Permission; readonly scope: OrganizationScope;
  readonly policyVersion: string; readonly contextRevision: string | null; readonly resourceRevision: string;
}
/** Owner must serialize revision checks and the write at one confirmation point. Not a client credential. */
export interface AuthorizedMutation<T> { commit(receipt: AuthorizationReceipt): Promise<T> }
export interface SecurityEvent {
  readonly eventId: string; readonly at: string; readonly subject: string;
  readonly action: 'ACCESS_DENIED' | 'POLICY_CHANGED'; readonly result: 'denied' | 'allowed';
  readonly reason: 'PERMISSION' | 'CONTEXT' | 'RESOURCE' | 'ELIGIBILITY' | 'POLICY';
  readonly correlationId: string; readonly suppressed: number;
  readonly permission?: Permission;
  readonly scope?: OrganizationScope;
  readonly resource?: { readonly type: 'authorization-policy'; readonly id: 'active' };
  readonly beforeVersion?: string; readonly afterVersion?: string;
}
export interface SecurityAudit { record(event: SecurityEvent): Promise<void> }
export interface PolicyReader { read(): Promise<AuthorizationPolicy> }
export interface PolicyWriter {
  /** Must atomically capture the immutable event with the revision or reject without mutation. */
  replace(expectedVersion: string, grants: readonly Grant[], event: SecurityEvent): Promise<AuthorizationPolicy>;
}
export interface AuthorizationClock { now(): Date }
export interface EventIdentity { next(): string }
