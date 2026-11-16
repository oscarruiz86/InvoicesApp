import type { AuthenticatedActor, ApplicationRole } from '@/modules/identity/domain/actor';
import type { OrganizationAccessReader } from '@/modules/identity/application/authorization-ports';
import type { OrganizationScope } from '@/modules/identity/domain/authorization-facts';
import type { PermissionsSnapshot } from '@/modules/identity/application/authorization';
import type { ContextSelection, Organization, OrganizationDestination } from '../domain/organization';

export interface OrganizationReader extends OrganizationAccessReader {
  candidates(subject: string): Promise<readonly Organization[]>;
  find(id: string): Promise<Organization | null>;
}
export interface ContextPermissions {
  getEffectivePermissions(actor: AuthenticatedActor, scope: OrganizationScope): Promise<PermissionsSnapshot>;
}
export type ResolvedContext = ({ readonly kind: 'GLOBAL'; readonly roles: readonly ApplicationRole[] } |
  ({ readonly kind: 'ORGANIZATION' } & OrganizationDestination)) & { readonly authorization: PermissionsSnapshot };
export interface AvailableContexts { readonly organizations: readonly OrganizationDestination[]; readonly globalAvailable: boolean }
export type ResolutionReason = 'INITIAL' | 'SWITCH' | 'RESTORE';
export interface ContextEvent {
  readonly eventId: string; readonly correlationId: string; readonly at: string; readonly subject: string;
  readonly action: 'CONTEXT_SELECTED' | 'CONTEXT_SWITCH_REQUESTED' | 'CONTEXT_RESTORED' | 'CONTEXT_DENIED' | 'CONTEXT_INVALIDATED';
  readonly result: 'allowed' | 'denied'; readonly selection?: ContextSelection;
  readonly suppressed: number;
}
export interface ContextAudit { record(event: ContextEvent): Promise<void> }
export interface OrganizationContexts {
  available(actor: AuthenticatedActor): Promise<AvailableContexts>;
  resolve(actor: AuthenticatedActor, selection: ContextSelection, reason: ResolutionReason): Promise<ResolvedContext>;
}
