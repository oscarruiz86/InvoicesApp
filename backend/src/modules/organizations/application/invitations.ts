import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import { AuthorizationError } from '@/modules/identity/application/authentication-error';
import { InvitationIdentityError, readInvitationIdentity, type IdentityProfileReader } from '@/modules/identity/application/identity-profile-reader';
import type { Authorization } from '@/modules/identity/application/authorization';
import type { OrganizationScope } from '@/modules/identity/domain/authorization-facts';
import { InvitationDelegationDenied, type InvitationDelegationRequest } from './invitation-delegation';
import type { Invitation, InvitationStatus } from '../domain/invitations';
import { normalizeRecipientEmail, normalizeRoles } from '../domain/invitations';
import type { OrganizationReader } from './context-ports';
import type { DriverProvisioningPort } from './driver-provisioning';

export class InvitationUseCaseError extends Error {
  constructor(readonly code: 'INVALID_REQUEST' | 'NOT_FOUND' | 'EXPIRED' | 'CONFLICT' | 'FORBIDDEN' | 'UNAVAILABLE' | 'IDENTITY_MISMATCH' | 'EMAIL_UNVERIFIED' | 'PROFILE_INCOMPLETE') { super(code); }
}

export interface InvitationRepositoryPort {
  createPending(invitation: Invitation, now: Date, notification: InvitationNotificationRequest): Promise<Invitation>;
  findInvitation(id: string): Promise<Invitation | null>;
  findInvitationByToken(token: string, now: Date): Promise<Invitation | null>;
  listInvitations(input: { organizationId: string; organizationType?: Invitation['organizationType'] | 'ALL'; companyId?: string; companyWide?: boolean;
    status?: InvitationStatus; email?: string; role?: Invitation['roles'][number]; delivery?: Invitation['deliveryStatus']; page: number; pageSize: number; now: Date }): Promise<{ readonly items: readonly Invitation[]; readonly total: number }>;
  listReceivedInvitations(input: { recipientEmail: string; page: number; pageSize: number; now: Date }): Promise<{ readonly items: readonly Invitation[]; readonly total: number }>;
  resendPending(input: { id: string; expectedVersion: number; tokenHash: string; attemptId: string; expiresAt: Date; now: Date; notification: InvitationNotificationRequest }): Promise<Invitation>;
  resolveInvitation(id: string, expectedVersion: number, status: 'ACCEPTED' | 'REJECTED' | 'CANCELLED', now: Date, acceptedSubject?: string | null): Promise<Invitation>;
  accept(input: { invitationId: string; token: string | null; expectedVersion: number; subject: string; email: string; emailVerified: true; profileComplete: true; now: Date; membershipId: string; driverProvisioning?: DriverProvisioningPort }): Promise<{ invitation: Invitation; membership: { readonly id: string; readonly revision: number } }>;
}

export interface InvitationNotificationRequest { readonly type: 'INVITATION_CREATED' | 'INVITATION_RESENT'; readonly invitationId: string; readonly tokenVersion: number; readonly attemptId: string; readonly token: string; readonly recipient: string; readonly organizationName: string; readonly roles: readonly string[]; readonly expiresAt: Date; readonly createdAt: Date }

export interface InvitationView {
  readonly id: string; readonly organizationId: string; readonly organizationType: Invitation['organizationType']; readonly companyId: string | null;
  readonly organizationName?: string; readonly companyName?: string;
  readonly recipientEmail: string; readonly roles: Invitation['roles']; readonly status: Invitation['status']; readonly expiresAt: string;
  readonly version: number; readonly deliveryStatus: Invitation['deliveryStatus']; readonly createdAt: string; readonly resolvedAt: string | null;
}
export interface ReceivedInvitationView {
  readonly id: string; readonly organizationId: string; readonly organizationType: Invitation['organizationType']; readonly organizationName: string;
  readonly roles: Invitation['roles']; readonly status: Invitation['status']; readonly expiresAt: string; readonly version: number; readonly createdAt: string; readonly resolvedAt: string | null;
}
export interface InvitationCredential { readonly token: string; readonly tokenHash: string; readonly expiresAt: Date }

export const invitationView = (value: Invitation): InvitationView => ({ id: value.id, organizationId: value.organizationId,
  organizationType: value.organizationType, companyId: value.companyId, recipientEmail: value.recipientEmail, roles: value.roles,
  status: value.status, expiresAt: value.expiresAt.toISOString(), version: value.version, deliveryStatus: value.deliveryStatus,
  createdAt: value.createdAt.toISOString(), resolvedAt: value.resolvedAt?.toISOString() ?? null });

const globalScope: OrganizationScope = { kind: 'global', companyId: null, thirdPartyId: null };
const invitationScope = (invitation: Pick<Invitation, 'organizationType' | 'organizationId' | 'companyId'>): OrganizationScope => invitation.organizationType === 'COMPANY'
  ? globalScope
  : invitation.companyId ? { kind: 'organization', companyId: invitation.companyId, thirdPartyId: invitation.organizationId }
    : { kind: 'organization', companyId: null, thirdPartyId: invitation.organizationId };
const manageInvitationScope = (invitation: Invitation): OrganizationScope => invitation.organizationType === 'THIRD_PARTY' && invitation.roles.includes('DRIVER')
  ? { kind: 'organization', companyId: null, thirdPartyId: invitation.organizationId } : invitationScope(invitation);

export function createInvitations(deps: {
  repository: InvitationRepositoryPort; organizations: OrganizationReader; authorization: Authorization; driverProvisioning?: DriverProvisioningPort;
  identity: IdentityProfileReader; now(): Date; nextId(): string; ttlHours: number;
  issueCredential(now: Date, ttlHours: number): InvitationCredential;
  authorizeDelegation(actor: AuthenticatedActor, request: InvitationDelegationRequest): Promise<void>;
}) {
  async function invitationById(id: string) {
    const invitation = await deps.repository.findInvitation(id);
    if (!invitation) throw new InvitationUseCaseError('NOT_FOUND');
    return invitation;
  }
  async function authorizeManager(actor: AuthenticatedActor, invitation: Invitation) {
    const organization = await deps.organizations.find(invitation.organizationId);
    if (!organization || organization.type !== invitation.organizationType) throw new InvitationUseCaseError('NOT_FOUND');
    try {
      const permission = actor.roles.includes('APP_ADMIN') ? 'users:read' : invitation.organizationType === 'COMPANY' ? 'users:read'
        : invitation.roles.includes('DRIVER') ? 'drivers:read' : 'users:read';
      await deps.authorization.requirePermission(actor, permission, actor.roles.includes('APP_ADMIN') ? globalScope : manageInvitationScope(invitation));
    } catch { throw new InvitationUseCaseError('FORBIDDEN'); }
  }
  async function activeInvitation(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new InvitationUseCaseError('NOT_FOUND');
    const invitation = await deps.repository.findInvitationByToken(token, deps.now());
    if (!invitation) throw new InvitationUseCaseError('NOT_FOUND');
    if (invitation.status !== 'PENDING') throw new InvitationUseCaseError(invitation.status === 'EXPIRED' ? 'EXPIRED' : 'CONFLICT');
    if (invitation.expiresAt.getTime() <= deps.now().getTime()) throw new InvitationUseCaseError('EXPIRED');
    return invitation;
  }
  async function activeReceivedInvitation(actor: AuthenticatedActor, id: string) {
    const invitation = await invitationById(id);
    if (invitation.status !== 'PENDING') throw new InvitationUseCaseError(invitation.status === 'EXPIRED' ? 'EXPIRED' : 'CONFLICT');
    if (invitation.expiresAt.getTime() <= deps.now().getTime()) throw new InvitationUseCaseError('EXPIRED');
    let identity;
    try { identity = await readInvitationIdentity(deps.identity, { subject: actor.subject, recipientEmail: invitation.recipientEmail }); }
    catch (error) { throw new InvitationUseCaseError(error instanceof InvitationIdentityError ? (error.code === 'IDENTITY_UNAVAILABLE' ? 'UNAVAILABLE' : error.code) : 'FORBIDDEN'); }
    return { invitation, identity };
  }
  return {
    async list(actor: AuthenticatedActor, input: { organizationId: string; organizationType: Invitation['organizationType'] | 'ALL'; companyId: string | null;
      status?: InvitationStatus; email?: string; role?: Invitation['roles'][number]; delivery?: Invitation['deliveryStatus']; page: number; pageSize: number }) {
      if (!Number.isSafeInteger(input.page) || input.page < 1 || !Number.isSafeInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) throw new InvitationUseCaseError('INVALID_REQUEST');
      if (input.organizationType === 'ALL') {
        const companyId = input.companyId;
        const appAdmin = actor.roles.includes('APP_ADMIN');
        if (companyId && input.organizationId !== companyId || !companyId && (!appAdmin || input.organizationId !== 'all')) throw new InvitationUseCaseError('NOT_FOUND');
        if (companyId) {
          const company = await deps.organizations.find(companyId);
          if (!company || company.type !== 'COMPANY') throw new InvitationUseCaseError('NOT_FOUND');
        }
        const scope: OrganizationScope = appAdmin ? globalScope : { kind: 'organization', companyId: companyId!, thirdPartyId: null };
        try { await deps.authorization.requirePermission(actor, 'users:read', scope); } catch { throw new InvitationUseCaseError('FORBIDDEN'); }
        const result = await deps.repository.listInvitations({ organizationId: companyId ?? 'all', organizationType: 'ALL',
          ...(companyId ? { companyId } : {}), companyWide: true, ...(input.status ? { status: input.status } : {}), ...(input.email ? { email: input.email } : {}),
          ...(input.role ? { role: input.role } : {}), ...(input.delivery ? { delivery: input.delivery } : {}), page: input.page, pageSize: input.pageSize, now: deps.now() });
        const organizationIds = [...new Set(result.items.map(invitation => invitation.organizationId))];
        const organizations = await Promise.all(organizationIds.map(async organizationId => [organizationId, await deps.organizations.find(organizationId)] as const));
        const names = new Map(organizations.map(([organizationId, organization]) => [organizationId, organization?.name ?? 'Organización no disponible']));
        const companyNames = await Promise.all(result.items.map(async invitation => {
          if (invitation.organizationType === 'COMPANY') return [invitation.id, names.get(invitation.organizationId) ?? 'Organización no disponible'] as const;
          const company = invitation.companyId ? await deps.organizations.find(invitation.companyId) : null;
          return [invitation.id, company?.type === 'COMPANY' ? company.name : '—'] as const;
        }));
        const companyNameByInvitation = new Map(companyNames);
        return { items: result.items.map(invitation => ({ ...invitationView(invitation), organizationName: names.get(invitation.organizationId) ?? 'Organización no disponible', companyName: companyNameByInvitation.get(invitation.id) })),
          page: input.page, pageSize: input.pageSize, total: result.total };
      }
      const organization = await deps.organizations.find(input.organizationId);
      if (!organization || organization.type !== input.organizationType || (input.companyId && input.organizationType !== 'THIRD_PARTY')) throw new InvitationUseCaseError('NOT_FOUND');
      const probe: Pick<Invitation, 'organizationType' | 'organizationId' | 'companyId'> = {
        organizationId: input.organizationId, organizationType: input.organizationType as Invitation['organizationType'], companyId: input.companyId,
      };
      const permission = actor.roles.includes('APP_ADMIN') ? 'users:read' : input.organizationType === 'COMPANY' ? 'users:read' : input.companyId ? 'users:read' : 'drivers:read';
      try { await deps.authorization.requirePermission(actor, permission, actor.roles.includes('APP_ADMIN') ? globalScope : invitationScope(probe)); } catch { throw new InvitationUseCaseError('FORBIDDEN'); }
      const result = await deps.repository.listInvitations({ organizationId: input.organizationId,
        ...(input.organizationType === 'THIRD_PARTY' && input.companyId ? { companyId: input.companyId } : {}),
        organizationType: input.organizationType, ...(input.status ? { status: input.status } : {}), ...(input.email ? { email: input.email } : {}),
        ...(input.role ? { role: input.role } : {}), ...(input.delivery ? { delivery: input.delivery } : {}), page: input.page, pageSize: input.pageSize, now: deps.now() });
      const items = await Promise.all(result.items.map(async invitation => {
        const company = invitation.organizationType === 'COMPANY' ? organization : invitation.companyId ? await deps.organizations.find(invitation.companyId) : null;
        return { ...invitationView(invitation), companyName: company?.type === 'COMPANY' ? company.name : '—' };
      }));
      return { items, page: input.page, pageSize: input.pageSize, total: result.total };
    },
    async received(actor: AuthenticatedActor, input: { page: number; pageSize: number }) {
      if (!Number.isSafeInteger(input.page) || input.page < 1 || !Number.isSafeInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) throw new InvitationUseCaseError('INVALID_REQUEST');
      let profile;
      try { profile = await deps.identity.read(actor.subject); }
      catch { throw new InvitationUseCaseError('UNAVAILABLE'); }
      if (!profile || !profile.enabled || profile.subject !== actor.subject || !profile.email) throw new InvitationUseCaseError('IDENTITY_MISMATCH');
      if (!profile.emailVerified) throw new InvitationUseCaseError('EMAIL_UNVERIFIED');
      const result = await deps.repository.listReceivedInvitations({ recipientEmail: normalizeRecipientEmail(profile.email), page: input.page, pageSize: input.pageSize, now: deps.now() });
      const items = await Promise.all(result.items.map(async invitation => {
        const organization = await deps.organizations.find(invitation.organizationId);
        const expired = invitation.status === 'PENDING' && invitation.expiresAt.getTime() <= deps.now().getTime();
        return { id: invitation.id, organizationId: invitation.organizationId, organizationType: invitation.organizationType,
          organizationName: organization?.type === invitation.organizationType ? organization.name : 'Organización no disponible', roles: invitation.roles,
          status: expired ? 'EXPIRED' as const : invitation.status, expiresAt: invitation.expiresAt.toISOString(), version: invitation.version,
          createdAt: invitation.createdAt.toISOString(), resolvedAt: expired ? invitation.expiresAt.toISOString() : invitation.resolvedAt?.toISOString() ?? null };
      }));
      return { items, page: input.page, pageSize: input.pageSize, total: result.total };
    },
    async get(actor: AuthenticatedActor, id: string) {
      const invitation = await invitationById(id);
      await authorizeManager(actor, invitation);
      return invitationView(invitation);
    },
    async create(actor: AuthenticatedActor, input: InvitationDelegationRequest) {
      try { await deps.authorizeDelegation(actor, input); } catch { throw new InvitationUseCaseError('FORBIDDEN'); }
      const now = deps.now();
      let recipientEmail: string; let roles: Invitation['roles'];
      try { recipientEmail = normalizeRecipientEmail(input.recipientEmail); roles = normalizeRoles(input.organizationType, input.roles); }
      catch { throw new InvitationUseCaseError('INVALID_REQUEST'); }
      const organization = await deps.organizations.find(input.organizationId);
      if (!organization?.active || organization.type !== input.organizationType
        || (input.organizationType === 'COMPANY' && input.companyId !== input.organizationId)) throw new InvitationUseCaseError('NOT_FOUND');
      const credential = deps.issueCredential(now, deps.ttlHours);
      const invitation: Invitation = { id: deps.nextId(), organizationId: input.organizationId, organizationType: input.organizationType,
        companyId: input.companyId, recipientEmail, roles, invitedBy: actor.subject, status: 'PENDING', expiresAt: credential.expiresAt,
        tokenHash: credential.tokenHash, tokenVersion: 1, version: 1, createdAt: now, resolvedAt: null, acceptedSubject: null,
        deliveryStatus: 'UNKNOWN', attemptId: deps.nextId() };
      await deps.repository.createPending(invitation, now, { type: 'INVITATION_CREATED', invitationId: invitation.id, tokenVersion: invitation.tokenVersion,
        attemptId: invitation.attemptId!, token: credential.token, recipient: invitation.recipientEmail, organizationName: organization.name, roles: invitation.roles,
        expiresAt: invitation.expiresAt, createdAt: now });
      return invitationView(invitation);
    },
    async preview(token: string) {
      const invitation = await activeInvitation(token);
      const organization = await deps.organizations.find(invitation.organizationId);
      if (!organization || organization.type !== invitation.organizationType || !organization.active) throw new InvitationUseCaseError('NOT_FOUND');
      return { organizationId: organization.id, organizationType: organization.type, organizationName: organization.name,
        recipientEmail: invitation.recipientEmail, roles: invitation.roles, expiresAt: invitation.expiresAt.toISOString(), version: invitation.version };
    },
    async accept(actor: AuthenticatedActor, token: string, expectedVersion: number) {
      const invitation = await activeInvitation(token);
      let identity;
      try { identity = await readInvitationIdentity(deps.identity, { subject: actor.subject, recipientEmail: invitation.recipientEmail }); }
      catch (error) { throw new InvitationUseCaseError(error instanceof InvitationIdentityError ? (error.code === 'IDENTITY_UNAVAILABLE' ? 'UNAVAILABLE' : error.code) : 'FORBIDDEN'); }
      const result = await deps.repository.accept({ invitationId: invitation.id, token, expectedVersion, ...identity, now: deps.now(), membershipId: deps.nextId(), ...(deps.driverProvisioning ? { driverProvisioning: deps.driverProvisioning } : {}) });
      return { invitation: invitationView(result.invitation), membershipId: result.membership.id, membershipRevision: result.membership.revision };
    },
    async acceptReceived(actor: AuthenticatedActor, id: string, expectedVersion: number) {
      const { invitation, identity } = await activeReceivedInvitation(actor, id);
      const result = await deps.repository.accept({ invitationId: invitation.id, token: null, expectedVersion, ...identity, now: deps.now(), membershipId: deps.nextId(), ...(deps.driverProvisioning ? { driverProvisioning: deps.driverProvisioning } : {}) });
      return { invitation: invitationView(result.invitation), membershipId: result.membership.id, membershipRevision: result.membership.revision };
    },
    async reject(actor: AuthenticatedActor, token: string, expectedVersion: number) {
      const invitation = await activeInvitation(token);
      try { await readInvitationIdentity(deps.identity, { subject: actor.subject, recipientEmail: invitation.recipientEmail }); }
      catch (error) { throw new InvitationUseCaseError(error instanceof InvitationIdentityError ? (error.code === 'IDENTITY_UNAVAILABLE' ? 'UNAVAILABLE' : error.code) : 'FORBIDDEN'); }
      return invitationView(await deps.repository.resolveInvitation(invitation.id, expectedVersion, 'REJECTED', deps.now()));
    },
    async rejectReceived(actor: AuthenticatedActor, id: string, expectedVersion: number) {
      const { invitation } = await activeReceivedInvitation(actor, id);
      return invitationView(await deps.repository.resolveInvitation(invitation.id, expectedVersion, 'REJECTED', deps.now()));
    },
    async cancel(actor: AuthenticatedActor, id: string, expectedVersion: number) {
      const invitation = await invitationById(id);
      await authorizeManager(actor, invitation);
      return invitationView(await deps.repository.resolveInvitation(id, expectedVersion, 'CANCELLED', deps.now()));
    },
    async resend(actor: AuthenticatedActor, id: string, expectedVersion: number) {
      const invitation = await invitationById(id);
      await authorizeManager(actor, invitation);
      const organization = await deps.organizations.find(invitation.organizationId);
      if (!organization || organization.type !== invitation.organizationType) throw new InvitationUseCaseError('NOT_FOUND');
      const now = deps.now(); const credential = deps.issueCredential(now, deps.ttlHours); const attemptId = deps.nextId();
      const updated = await deps.repository.resendPending({ id, expectedVersion, tokenHash: credential.tokenHash, attemptId, expiresAt: credential.expiresAt, now,
        notification: { type: 'INVITATION_RESENT', invitationId: id, tokenVersion: invitation.tokenVersion + 1, attemptId, token: credential.token,
          recipient: invitation.recipientEmail, organizationName: organization.name, roles: invitation.roles, expiresAt: credential.expiresAt, createdAt: now } });
      return invitationView(updated);
    },
  };
}

export function isInvitationAuthorizationError(error: unknown): boolean { return error instanceof AuthorizationError || error instanceof InvitationDelegationDenied; }
