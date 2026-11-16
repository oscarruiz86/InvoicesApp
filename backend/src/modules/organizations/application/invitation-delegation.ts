import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import type { Authorization } from '@/modules/identity/application/authorization';
import type { OrganizationScope } from '@/modules/identity/domain/authorization-facts';
import { normalizeRecipientEmail, normalizeRoles } from '../domain/invitations';
import type { OrganizationReader } from './context-ports';

export interface DelegationRequest {
  readonly organizationId: string;
  readonly organizationType: 'COMPANY' | 'THIRD_PARTY';
  readonly companyId: string | null;
  readonly roles: readonly string[];
}
export interface InvitationDelegationRequest extends DelegationRequest { readonly recipientEmail: string }
export interface MembershipDelegationRequest extends DelegationRequest { readonly subject: string }

export class InvitationDelegationDenied extends Error {
  constructor() { super('INVITATION_DELEGATION_DENIED'); this.name = 'InvitationDelegationDenied'; }
}

const globalScope: OrganizationScope = { kind: 'global', companyId: null, thirdPartyId: null };
const scopeFor = (organizationType: 'COMPANY' | 'THIRD_PARTY', organizationId: string): OrganizationScope => ({ kind: 'organization',
  companyId: organizationType === 'COMPANY' ? organizationId : null, thirdPartyId: organizationType === 'THIRD_PARTY' ? organizationId : null });

export function createInvitationDelegation(deps: { organizations: OrganizationReader; authorization: Authorization }) {
  async function authorizeRoles(actor: AuthenticatedActor, request: DelegationRequest): Promise<void> {
    try {
      const roles = normalizeRoles(request.organizationType, request.roles);
      const target = await deps.organizations.find(request.organizationId);
      if (!target?.active || target.type !== request.organizationType) throw new InvitationDelegationDenied();
      if (request.organizationType === 'COMPANY') {
        if (roles.length !== 1 || roles[0] !== 'COMPANY_ADMIN') throw new InvitationDelegationDenied();
        await deps.authorization.requirePermission(actor, 'users:associate', globalScope);
        return;
      }
      const relationshipScope: OrganizationScope | null = request.companyId ? { kind: 'organization', companyId: request.companyId, thirdPartyId: request.organizationId } : null;
      const relationshipEvidence = relationshipScope ? await deps.organizations.read(actor.subject, relationshipScope) : null;
      if (relationshipScope && !relationshipEvidence?.relationshipActive) throw new InvitationDelegationDenied();
      if (request.companyId) {
        if (roles.length === 1 && roles[0] === 'THIRD_PARTY_ADMIN' && relationshipEvidence?.capabilities.some(capability => capability.active
          && capability.role === 'COMPANY_ADMIN' && capability.companyId === request.companyId)) {
          await deps.authorization.requirePermission(actor, 'users:associate', relationshipScope!);
          return;
        }
      }
      if (roles.length !== 1 || roles[0] !== 'DRIVER') throw new InvitationDelegationDenied();
      await deps.authorization.requirePermission(actor, 'drivers:create', scopeFor('THIRD_PARTY', request.organizationId));
    } catch { throw new InvitationDelegationDenied(); }
  }
  return {
    invitation: async (actor: AuthenticatedActor, request: InvitationDelegationRequest): Promise<void> => {
      try {
        if (!actor.email || normalizeRecipientEmail(actor.email) === normalizeRecipientEmail(request.recipientEmail)) throw new InvitationDelegationDenied();
        await authorizeRoles(actor, request);
      } catch { throw new InvitationDelegationDenied(); }
    },
    membershipRoles: async (actor: AuthenticatedActor, request: MembershipDelegationRequest): Promise<void> => {
      try {
        if (!request.subject || request.subject === actor.subject) throw new InvitationDelegationDenied();
        const roles = normalizeRoles(request.organizationType, request.roles);
        const target = await deps.organizations.find(request.organizationId);
        if (!target?.active || target.type !== request.organizationType) throw new InvitationDelegationDenied();
        if (request.organizationType === 'COMPANY') {
          if (roles.some(role => role !== 'COMPANY_ADMIN')) throw new InvitationDelegationDenied();
          await deps.authorization.requirePermission(actor, 'users:associate', globalScope);
          return;
        }
        if (roles.includes('THIRD_PARTY_ADMIN')) {
          if (!request.companyId) throw new InvitationDelegationDenied();
          const relationshipScope: OrganizationScope = { kind: 'organization', companyId: request.companyId, thirdPartyId: request.organizationId };
          const evidence = await deps.organizations.read(actor.subject, relationshipScope);
          if (!evidence?.relationshipActive || !evidence.capabilities.some(capability => capability.active && capability.role === 'COMPANY_ADMIN' && capability.companyId === request.companyId)) {
            throw new InvitationDelegationDenied();
          }
          await deps.authorization.requirePermission(actor, 'users:associate', relationshipScope);
        }
        if (roles.includes('DRIVER')) await deps.authorization.requirePermission(actor, 'drivers:create', scopeFor('THIRD_PARTY', request.organizationId));
      } catch { throw new InvitationDelegationDenied(); }
    },
  };
}
