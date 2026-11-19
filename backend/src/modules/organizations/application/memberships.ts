import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import type { Authorization } from '@/modules/identity/application/authorization';
import type { IdentityProfileReader, ColombianDocumentType } from '@/modules/identity/application/identity-profile-reader';
import type { OrganizationScope } from '@/modules/identity/domain/authorization-facts';
import { AuthorizationUnavailable } from '@/modules/identity/application/authorization-errors';
import type { InvitationRepositoryPort } from './invitations';
import type { OrganizationReader } from './context-ports';
import type { LocalRole, OrganizationType } from '../domain/organization';
import type { Membership } from '../domain/invitations';
import type { MembershipDelegationRequest } from './invitation-delegation';

export class MembershipUseCaseError extends Error {
  constructor(readonly code: 'INVALID_REQUEST' | 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'UNAVAILABLE') { super(code); }
}

export interface MembershipView {
  readonly id: string; readonly status: Membership['status']; readonly roles: readonly LocalRole[]; readonly revision: number;
  readonly profile: null | { readonly fullName: string; readonly documentType: ColombianDocumentType; readonly documentNumber: string; readonly email: string };
  readonly organization?: { readonly id: string; readonly organizationType: OrganizationType; readonly name: string };
}

const selectedScope = (organizationType: OrganizationType, organizationId: string, companyId: string | null): OrganizationScope => ({ kind: 'organization',
  companyId: organizationType === 'COMPANY' ? organizationId : companyId, thirdPartyId: organizationType === 'THIRD_PARTY' ? organizationId : null });
const globalScope: OrganizationScope = { kind: 'global', companyId: null, thirdPartyId: null };
const permissionFor = (organizationType: OrganizationType, companyId: string | null, mutation: boolean) => organizationType === 'COMPANY' || companyId
  ? mutation ? 'users:associate' as const : 'users:read' as const
  : mutation ? 'drivers:update' as const : 'drivers:read' as const;

export function createMemberships(deps: {
  repository: InvitationRepositoryPort & {
    listMemberships(input: { organizationId: string; organizationType: OrganizationType; status?: Membership['status']; role?: LocalRole; subjects?: readonly string[]; page: number; pageSize: number }): Promise<{ readonly items: readonly { readonly membership: Membership; readonly roles: readonly LocalRole[] }[]; readonly total: number }>;
    listMembershipsByCompany(input: { companyId: string; status?: Membership['status']; role?: LocalRole; subjects?: readonly string[]; page: number; pageSize: number }): Promise<{ readonly items: readonly { readonly membership: Membership; readonly roles: readonly LocalRole[]; readonly organization: { readonly id: string; readonly organizationType: OrganizationType; readonly name: string } }[]; readonly total: number }>;
    findMembership(input: { membershipId: string; organizationId: string; organizationType: OrganizationType }): Promise<{ readonly membership: Membership; readonly roles: readonly LocalRole[] } | null>;
    changeMembership(input: { membershipId: string; expectedRevision: number; actorSubject: string; now: Date; status?: Membership['status']; roles?: readonly string[]; companyId: string | null }): Promise<{
      readonly membership: Membership; readonly roles: readonly LocalRole[]; readonly replacement?: { readonly membership: Membership; readonly roles: readonly LocalRole[] };
    }>;
  };
  organizations: OrganizationReader; authorization: Authorization; identity: IdentityProfileReader; now(): Date;
  authorizeDelegation(actor: AuthenticatedActor, request: MembershipDelegationRequest): Promise<void>;
}) {
  async function authorize(actor: AuthenticatedActor, organizationId: string, organizationType: OrganizationType, companyId: string | null, mutation = false) {
    const organization = await deps.organizations.find(organizationId);
    if (!organization || organization.type !== organizationType || (companyId && organizationType !== 'THIRD_PARTY')) throw new MembershipUseCaseError('NOT_FOUND');
    const scope = actor.roles.includes('APP_ADMIN') ? globalScope : selectedScope(organizationType, organizationId, companyId);
    try { await deps.authorization.requirePermission(actor, permissionFor(organizationType, companyId, mutation), scope); }
    catch (error) { throw new MembershipUseCaseError(error instanceof AuthorizationUnavailable ? 'UNAVAILABLE' : 'FORBIDDEN'); }
  }
  async function profile(subject: string) {
    let value;
    try { value = await deps.identity.read(subject); } catch { throw new MembershipUseCaseError('UNAVAILABLE'); }
    if (!value || !value.fullName || !value.documentType || !value.documentNumber || !value.email) throw new MembershipUseCaseError('UNAVAILABLE');
    return { fullName: value.fullName, documentType: value.documentType, documentNumber: value.documentNumber, email: value.email };
  }
  function view(item: { membership: Membership; roles: readonly LocalRole[] }, personal: MembershipView['profile'], organization?: MembershipView['organization']): MembershipView {
    return { id: item.membership.id, status: item.membership.status, roles: item.roles, revision: item.membership.revision, profile: personal,
      ...(organization ? { organization } : {}) };
  }
  return {
    async searchUsers(actor: AuthenticatedActor, input: { organizationId: string; organizationType: OrganizationType; companyId: string | null; search?: string; documentNumber?: string }) {
      if (!input.search && !input.documentNumber) throw new MembershipUseCaseError('INVALID_REQUEST');
      await authorize(actor, input.organizationId, input.organizationType, input.companyId, true);
      if (!deps.identity.search) throw new MembershipUseCaseError('UNAVAILABLE');
      let matches;
      try { matches = await deps.identity.search({ text: input.search, documentNumber: input.documentNumber, emailOnly: Boolean(input.search && !input.documentNumber) }); }
      catch { throw new MembershipUseCaseError('UNAVAILABLE'); }
      return { items: matches.filter(value => value.enabled && value.profileComplete && value.fullName && value.documentType && value.documentNumber && value.email)
        .map(value => ({ fullName: value.fullName!, documentType: value.documentType!, documentNumber: value.documentNumber!, email: value.email! })) };
    },
    async list(actor: AuthenticatedActor, input: { organizationId: string; organizationType: OrganizationType; companyId: string | null; status?: Membership['status']; search?: string; documentNumber?: string; role?: LocalRole; page: number; pageSize: number }) {
      if (!Number.isSafeInteger(input.page) || input.page < 1 || !Number.isSafeInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) throw new MembershipUseCaseError('INVALID_REQUEST');
      await authorize(actor, input.organizationId, input.organizationType, input.companyId);
      let subjects: readonly string[] | undefined;
      if (input.search || input.documentNumber) {
        if (!deps.identity.search) throw new MembershipUseCaseError('UNAVAILABLE');
        try { subjects = (await deps.identity.search({ text: input.search, documentNumber: input.documentNumber })).map(profile => profile.subject); }
        catch { throw new MembershipUseCaseError('UNAVAILABLE'); }
      }
      const result = await deps.repository.listMemberships({ ...input, ...(subjects ? { subjects } : {}) });
      const items = await Promise.all(result.items.map(async item => {
        let personal: MembershipView['profile'] = null;
        try { personal = await profile(item.membership.subject); } catch { /* One unavailable identity profile must not hide the remaining memberships. */ }
        return view(item, personal);
      }));
      return { items, page: input.page, pageSize: input.pageSize, total: result.total };
    },
    async listByCompany(actor: AuthenticatedActor, input: { companyId: string; status?: Membership['status']; search?: string; documentNumber?: string; role?: LocalRole; page: number; pageSize: number }) {
      if (!Number.isSafeInteger(input.page) || input.page < 1 || !Number.isSafeInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) throw new MembershipUseCaseError('INVALID_REQUEST');
      await authorize(actor, input.companyId, 'COMPANY', null);
      let subjects: readonly string[] | undefined;
      if (input.search || input.documentNumber) {
        if (!deps.identity.search) throw new MembershipUseCaseError('UNAVAILABLE');
        try { subjects = (await deps.identity.search({ text: input.search, documentNumber: input.documentNumber })).map(profile => profile.subject); }
        catch { throw new MembershipUseCaseError('UNAVAILABLE'); }
      }
      const result = await deps.repository.listMembershipsByCompany({ ...input, ...(subjects ? { subjects } : {}) });
      const items = await Promise.all(result.items.map(async item => {
        let personal: MembershipView['profile'] = null;
        try { personal = await profile(item.membership.subject); } catch { /* Keep one unavailable identity profile from hiding other company associations. */ }
        return view(item, personal, item.organization);
      }));
      return { items, page: input.page, pageSize: input.pageSize, total: result.total };
    },
    async profile(actor: AuthenticatedActor, input: { membershipId: string; organizationId: string; organizationType: OrganizationType; companyId: string | null }) {
      await authorize(actor, input.organizationId, input.organizationType, input.companyId);
      const item = await deps.repository.findMembership(input);
      if (!item) throw new MembershipUseCaseError('NOT_FOUND');
      if (item.membership.status !== 'ACTIVE') throw new MembershipUseCaseError('FORBIDDEN');
      return view(item, await profile(item.membership.subject));
    },
    async change(actor: AuthenticatedActor, input: { membershipId: string; expectedRevision: number; organizationId: string; organizationType: OrganizationType; companyId: string | null; status?: Membership['status']; roles?: readonly string[] }) {
      if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1 || (input.status === undefined && input.roles === undefined)) throw new MembershipUseCaseError('INVALID_REQUEST');
      await authorize(actor, input.organizationId, input.organizationType, input.companyId, true);
      const current = await deps.repository.findMembership(input);
      if (!current) throw new MembershipUseCaseError('NOT_FOUND');
      try { await deps.authorizeDelegation(actor, { organizationId: input.organizationId, organizationType: input.organizationType,
        companyId: input.companyId, subject: current.membership.subject, roles: input.roles ?? current.roles }); }
      catch { throw new MembershipUseCaseError('FORBIDDEN'); }
      const result = await deps.repository.changeMembership({ membershipId: input.membershipId, expectedRevision: input.expectedRevision, actorSubject: actor.subject,
        now: deps.now(), ...(input.status ? { status: input.status } : {}), ...(input.roles ? { roles: input.roles } : {}), companyId: input.companyId });
      return view({ membership: result.membership, roles: result.roles }, null);
    },
  };
}
