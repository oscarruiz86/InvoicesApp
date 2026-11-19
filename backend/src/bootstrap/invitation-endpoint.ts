import { randomUUID } from 'node:crypto';
import { Types, type ClientSession } from 'mongoose';
import { z } from 'zod';
import { createInvitations } from '@/modules/organizations/application/invitations';
import type { DriverProvisioningPort } from '@/modules/organizations/application/driver-provisioning';
import { createMemberships, MembershipUseCaseError } from '@/modules/organizations/application/memberships';
import { createInvitationDelegation } from '@/modules/organizations/application/invitation-delegation';
import { createInvitationRepository, InvitationRepositoryError } from '@/modules/organizations/infrastructure/mongodb/invitation-repository';
import { createNotificationRepository } from '@/modules/notifications/infrastructure/mongodb/notification-repository';
import { createAesPayloadCipher } from '@/modules/notifications/infrastructure/payload-cipher';
import { fileSecretReader } from '@/shared/infrastructure/file-secrets/file-secret-reader';
import { issueInvitationCredential } from '@/modules/organizations/infrastructure/invitation-tokens';
import { createIdentityProfileReader } from '@/modules/identity/infrastructure/keycloak/identity-profile-reader';
import { createIdentityRoleReader } from '@/modules/identity/infrastructure/keycloak/identity-role-reader';
import { provisionDriverInSession, synchronizeDriverMembershipInSession } from '@/modules/fleet/infrastructure/mongodb/driver-repository';
import { authorization, organizationReader } from './authorization-endpoint';
import { connectMongo } from '@/shared/infrastructure/mongodb/connection';
import { readServerEnvironment } from '@/shared/infrastructure/config/server-environment';
import { authenticatedEndpoint } from './authenticated-endpoint';
import { thirdPartyUseCases } from './third-party-endpoint';
import { invitationResponse, type InvitationOperation } from '@/modules/organizations/presentation/invitations';
import { membershipResponse, membershipUserSearchQuery, type MembershipOperation } from '@/modules/organizations/presentation/memberships';
import { errorResponse } from '@/shared/presentation/http/errors';

const connect = () => { const env = readServerEnvironment(); return connectMongo({ uri: env.MONGODB_URI, file: env.MONGODB_URI_FILE }); };
const identityConfiguration = async () => {
  const environment = readServerEnvironment();
  const clientSecret = environment.KEYCLOAK_DIRECTORY_CLIENT_SECRET_FILE
    ? await fileSecretReader.read(environment.KEYCLOAK_DIRECTORY_CLIENT_SECRET_FILE)
    : environment.NODE_ENV !== 'production' ? environment.KEYCLOAK_DIRECTORY_CLIENT_SECRET ?? '' : '';
  return { issuer: String(environment.KEYCLOAK_ISSUER_URL ?? ''), directoryIssuer: String(environment.KEYCLOAK_DIRECTORY_ISSUER_URL ?? environment.KEYCLOAK_ISSUER_URL ?? ''),
    clientId: environment.KEYCLOAK_DIRECTORY_CLIENT_ID ?? '', clientSecret };
};
const identity = createIdentityProfileReader(identityConfiguration);
const identityRoles = createIdentityRoleReader(identityConfiguration);
const driverProvisioning: DriverProvisioningPort = {
  async provision(input, transaction) {
    if (!input.roles.includes('DRIVER')) return;
    const session = transaction as ClientSession;
    if (typeof session?.inTransaction !== 'function' || !session.inTransaction()) throw new Error('DRIVER_PROVISIONING_TRANSACTION_REQUIRED');
    await provisionDriverInSession(await connect(), session, {
      id: new Types.ObjectId().toString(), subject: input.membership.subject, membershipId: input.membership.id,
      thirdPartyId: input.membership.organizationId, actor: input.actorSubject, now: input.now, source: input.source,
    });
  },
  async synchronizeRoles(input, transaction) {
    const session = transaction as ClientSession;
    if (typeof session?.inTransaction !== 'function' || !session.inTransaction()) throw new Error('DRIVER_PROVISIONING_TRANSACTION_REQUIRED');
    await synchronizeDriverMembershipInSession(await connect(), session, {
      membershipId: input.membership.id, subject: input.membership.subject, thirdPartyId: input.membership.organizationId,
      beforeRoles: input.beforeRoles, afterRoles: input.afterRoles, membershipStatus: input.membership.status,
      actor: input.actorSubject, now: input.now,
    });
  },
};


function createRepository(notificationQueue?: ReturnType<typeof createNotificationRepository>) {
  return createInvitationRepository(connect, {
    async revalidateAndCoordinate(invitation, session) {
      try {
        const connection = await connect();
        const organization = await connection.collection('organizations').findOne({ id: invitation.organizationId, type: invitation.organizationType, active: true }, { session });
        if (!organization) return false;
        if (invitation.organizationType === 'THIRD_PARTY') {
          if (!/^[a-f0-9]{24}$/.test(invitation.organizationId)) return false;
          const profile = await connection.collection('third_parties').findOne({ _id: new Types.ObjectId(invitation.organizationId), status: 'ACTIVE' }, { session, projection: { _id: 1 } });
          if (!profile) return false;
        }
        const invitationRole = invitation.roles.length === 1 ? invitation.roles[0] : null;
        if (invitation.organizationType === 'COMPANY') {
          if (invitationRole !== 'COMPANY_ADMIN' || !(await identityRoles.read(invitation.invitedBy))?.includes('APP_ADMIN')) return false;
        } else {
          const expectedRole = invitationRole === 'THIRD_PARTY_ADMIN' ? 'COMPANY_ADMIN' : invitationRole === 'DRIVER' ? 'THIRD_PARTY_ADMIN' : null;
          if (!expectedRole) return false;
          const authorityOrganizationId = expectedRole === 'COMPANY_ADMIN' ? invitation.companyId : invitation.organizationId;
          if (!authorityOrganizationId) return false;
          if (expectedRole === 'COMPANY_ADMIN') {
            const relation = await connection.collection('company_third_party_relations').findOne({ companyId: authorityOrganizationId, thirdPartyId: invitation.organizationId, active: true }, { session });
            if (!relation) return false;
          }
          const association = await connection.collection('organization_associations').findOne({ subject: invitation.invitedBy,
            organizationId: authorityOrganizationId, capability: expectedRole, active: true }, { session });
          if (!association || typeof association.membershipId !== 'string') return false;
          const membership = await connection.collection('organization_memberships').findOne({ id: association.membershipId,
            subject: invitation.invitedBy, organizationId: authorityOrganizationId, status: 'ACTIVE' }, { session });
          if (!membership) return false;
          const associationFence = await connection.collection('organization_associations').updateOne({ id: association.id, active: true, revision: association.revision }, { $inc: { mutationFence: 1 } }, { session });
          const membershipFence = await connection.collection('organization_memberships').updateOne({ id: membership.id, status: 'ACTIVE', revision: membership.revision }, { $inc: { mutationFence: 1 } }, { session });
          if (associationFence.modifiedCount !== 1 || membershipFence.modifiedCount !== 1) return false;
        }
        const organizationFence = await connection.collection('organizations').updateOne({ id: invitation.organizationId, active: true, revision: organization.revision }, { $inc: { mutationFence: 1 } }, { session });
        if (organizationFence.modifiedCount !== 1) return false;
        if (invitation.organizationType === 'THIRD_PARTY' && invitation.companyId) {
          const relationFence = await connection.collection('company_third_party_relations').updateOne({ companyId: invitation.companyId, thirdPartyId: invitation.organizationId, active: true }, { $inc: { mutationFence: 1 } }, { session });
          if (relationFence.modifiedCount !== 1) return false;
        }
        return true;
      } catch { throw new InvitationRepositoryError('STORAGE_UNAVAILABLE'); }
    },
    async authorizeMembershipChange(actorSubject, membership, organizationType, companyId, roles, session) {
      const connection = await connect();
      const fenceAuthority = async (organizationId: string, capability: 'COMPANY_ADMIN' | 'THIRD_PARTY_ADMIN') => {
        const association = await connection.collection('organization_associations').findOne({ subject: actorSubject, organizationId, capability, active: true }, { session });
        if (!association || typeof association.membershipId !== 'string') return false;
        const authorityMembership = await connection.collection('organization_memberships').findOne({ id: association.membershipId, subject: actorSubject,
          organizationId, status: 'ACTIVE' }, { session });
        if (!authorityMembership) return false;
        const associationFence = await connection.collection('organization_associations').updateOne({ id: association.id, active: true, revision: association.revision }, { $inc: { mutationFence: 1 } }, { session });
        const membershipFence = await connection.collection('organization_memberships').updateOne({ id: authorityMembership.id, status: 'ACTIVE', revision: authorityMembership.revision }, { $inc: { mutationFence: 1 } }, { session });
        return associationFence.modifiedCount === 1 && membershipFence.modifiedCount === 1;
      };
      if (organizationType === 'COMPANY') {
        if (roles.some(role => role !== 'COMPANY_ADMIN')) return false;
        if (!(await identityRoles.read(actorSubject))?.includes('APP_ADMIN')) return false;
        return true;
      }
      if (roles.some(role => role !== 'THIRD_PARTY_ADMIN' && role !== 'DRIVER')) return false;
      if (!/^[a-f0-9]{24}$/.test(membership.organizationId)) return false;
      const thirdParty = await connection.collection('third_parties').findOne({ _id: new Types.ObjectId(membership.organizationId), status: 'ACTIVE' }, { session, projection: { _id: 1 } });
      if (!thirdParty) return false;
      if (companyId) {
        const relation = await connection.collection('company_third_party_relations').findOne({ companyId, thirdPartyId: membership.organizationId, active: true }, { session });
        if (!relation) return false;
        const relationFence = await connection.collection('company_third_party_relations').updateOne({ companyId, thirdPartyId: membership.organizationId, active: true, revision: relation.revision }, { $inc: { mutationFence: 1 } }, { session });
        if (relationFence.modifiedCount !== 1) return false;
      }
      if (roles.includes('THIRD_PARTY_ADMIN')) {
        if (!companyId) return false;
        if (!await fenceAuthority(companyId, 'COMPANY_ADMIN')) return false;
      }
      if (roles.includes('DRIVER') && !await fenceAuthority(membership.organizationId, 'THIRD_PARTY_ADMIN')) return false;
      return roles.length > 0;
    },
    async prepareInvitationNotification() { if (notificationQueue) await notificationQueue.prepare(); },
    async enqueueInvitationNotification(input, session) { if (notificationQueue) await notificationQueue.enqueueInvitation(input, session); },
  });
}

export function invitationUseCases() {
  const environment = readServerEnvironment();
  const cipher = createAesPayloadCipher(fileSecretReader, environment.NOTIFICATION_PAYLOAD_KEYRING);
  const notificationQueue = createNotificationRepository(connect, cipher);
  const repository = createRepository(notificationQueue);
  const delegation = createInvitationDelegation({ organizations: organizationReader, authorization });
  return createInvitations({ repository, organizations: organizationReader, authorization, identity, driverProvisioning,
    now: () => new Date(), nextId: randomUUID, ttlHours: environment.INVITATION_TTL_HOURS,
    issueCredential: issueInvitationCredential, authorizeDelegation: delegation.invitation });
}

export function membershipUseCases() {
  const delegation = createInvitationDelegation({ organizations: organizationReader, authorization });
  return createMemberships({ repository: createRepository(), organizations: organizationReader, authorization, identity, driverProvisioning, now: () => new Date(),
    authorizeDelegation: delegation.membershipRoles });
}

export const invitationEndpoint = (operation: InvitationOperation, id?: string) => authenticatedEndpoint((actor, request) => invitationResponse(invitationUseCases(), operation, actor, request, id));
async function thirdPartyOptionsResponse(actor: import('@/modules/identity/domain/actor').AuthenticatedActor, request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const companyId = params.get('companyId')?.trim() ?? '';
    const search = params.get('q')?.trim() ?? '';
    if (params.get('lookup') !== 'third-parties' || !/^[a-f0-9]{24}$/.test(companyId) || search.length > 120
      || [...params.keys()].some(key => !['lookup', 'companyId', 'q'].includes(key) || params.getAll(key).length !== 1)) {
      return Response.json({ error: { code: 'INVALID_REQUEST', message: 'La solicitud no es válida.' } }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
    const scope = actor.roles.includes('APP_ADMIN') ? { kind: 'global', companyId: null, thirdPartyId: null } as const
      : { kind: 'organization', companyId, thirdPartyId: null } as const;
    const result = await thirdPartyUseCases().lookupForCompany({ actor, scope }, companyId, { q: search });
    return Response.json({ items: result.items.map(value => ({ id: value.thirdParty.id, name: value.thirdParty.businessName })) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}
async function identityOptionsResponse(actor: import('@/modules/identity/domain/actor').AuthenticatedActor, request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const raw: Record<string, string> = {};
    for (const [key, value] of params) { if (key in raw) return Response.json({ error: { code: 'INVALID_REQUEST', message: 'La solicitud no es válida.' } }, { status: 400 }); raw[key] = value; }
    if (raw.lookup !== 'users') return Response.json({ error: { code: 'INVALID_REQUEST', message: 'La solicitud no es válida.' } }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    delete raw.lookup;
    const result = await membershipUseCases().searchUsers(actor, membershipUserSearchQuery(raw));
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: { code: 'INVALID_REQUEST', message: 'La solicitud no es válida.' } }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    if (error instanceof MembershipUseCaseError) {
      const values = { INVALID_REQUEST: [400, 'INVALID_REQUEST', 'La solicitud no es válida.'], NOT_FOUND: [404, 'NOT_FOUND', 'La organización no está disponible.'],
        FORBIDDEN: [403, 'FORBIDDEN', 'No tiene permisos para esta operación.'], CONFLICT: [409, 'CONFLICT', 'El registro cambió; vuelve a consultar.'], UNAVAILABLE: [503, 'UNAVAILABLE', 'El servicio no está disponible.'] } as const;
      const [status, code, message] = values[error.code];
      return Response.json({ error: { code, message } }, { status, headers: { 'Cache-Control': 'no-store' } });
    }
    return errorResponse(error);
  }
}
export const membershipEndpoint = (operation: MembershipOperation, id?: string) => authenticatedEndpoint((actor, request) =>
  operation === 'list' && new URL(request.url).searchParams.get('lookup') === 'third-parties' ? thirdPartyOptionsResponse(actor, request)
    : operation === 'list' && new URL(request.url).searchParams.get('lookup') === 'users' ? identityOptionsResponse(actor, request)
      : membershipResponse(membershipUseCases(), operation, actor, request, id));
export const publicInvitationEndpoint = (operation: 'preview') => async (request: Request) => {
  try { return await invitationResponse(invitationUseCases(), operation, null, request); }
  catch (error) { return errorResponse(error); }
};
