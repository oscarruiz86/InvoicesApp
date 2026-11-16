import { randomUUID } from 'node:crypto';
import { createInvitations } from '@/modules/organizations/application/invitations';
import { createMemberships } from '@/modules/organizations/application/memberships';
import { createInvitationDelegation } from '@/modules/organizations/application/invitation-delegation';
import { createInvitationRepository, InvitationRepositoryError } from '@/modules/organizations/infrastructure/mongodb/invitation-repository';
import { createNotificationRepository } from '@/modules/notifications/infrastructure/mongodb/notification-repository';
import { createAesPayloadCipher } from '@/modules/notifications/infrastructure/payload-cipher';
import { fileSecretReader } from '@/modules/notifications/infrastructure/file-secret-reader';
import { issueInvitationCredential } from '@/modules/organizations/infrastructure/invitation-tokens';
import { createIdentityProfileReader } from '@/modules/identity/infrastructure/keycloak/identity-profile-reader';
import { createIdentityRoleReader } from '@/modules/identity/infrastructure/keycloak/identity-role-reader';
import { authorization, organizationReader } from './authorization-endpoint';
import { connectMongo } from '@/shared/infrastructure/mongodb/connection';
import { readServerEnvironment } from '@/shared/infrastructure/config/server-environment';
import { authenticatedEndpoint } from './authenticated-endpoint';
import { invitationResponse, type InvitationOperation } from '@/modules/organizations/presentation/invitations';
import { membershipResponse, type MembershipOperation } from '@/modules/organizations/presentation/memberships';
import { errorResponse } from '@/shared/presentation/http/errors';

const connect = () => connectMongo(readServerEnvironment().MONGODB_URI);
const identityConfiguration = () => {
  const environment = readServerEnvironment();
  return { issuer: String(environment.KEYCLOAK_ISSUER_URL ?? ''), directoryIssuer: String(environment.KEYCLOAK_DIRECTORY_ISSUER_URL ?? environment.KEYCLOAK_ISSUER_URL ?? ''),
    clientId: process.env.KEYCLOAK_DIRECTORY_CLIENT_ID ?? '', clientSecret: process.env.KEYCLOAK_DIRECTORY_CLIENT_SECRET ?? '' };
};
const identity = createIdentityProfileReader(identityConfiguration);
const identityRoles = createIdentityRoleReader(identityConfiguration);

function createRepository(notificationQueue?: ReturnType<typeof createNotificationRepository>) {
  return createInvitationRepository(connect, {
    async revalidateAndCoordinate(invitation, session) {
      try {
        const connection = await connect();
        const organization = await connection.collection('organizations').findOne({ id: invitation.organizationId, type: invitation.organizationType, active: true }, { session });
        if (!organization) return false;
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
      if (roles.includes('THIRD_PARTY_ADMIN')) {
        if (!companyId) return false;
        const relation = await connection.collection('company_third_party_relations').findOne({ companyId, thirdPartyId: membership.organizationId, active: true }, { session });
        if (!relation || !await fenceAuthority(companyId, 'COMPANY_ADMIN')) return false;
        const relationFence = await connection.collection('company_third_party_relations').updateOne({ companyId, thirdPartyId: membership.organizationId, active: true }, { $inc: { mutationFence: 1 } }, { session });
        if (relationFence.modifiedCount !== 1) return false;
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
  return createInvitations({ repository, organizations: organizationReader, authorization, identity,
    now: () => new Date(), nextId: randomUUID, ttlHours: environment.INVITATION_TTL_HOURS,
    issueCredential: issueInvitationCredential, authorizeDelegation: delegation.invitation });
}

export function membershipUseCases() {
  const delegation = createInvitationDelegation({ organizations: organizationReader, authorization });
  return createMemberships({ repository: createRepository(), organizations: organizationReader, authorization, identity, now: () => new Date(),
    authorizeDelegation: delegation.membershipRoles });
}

export const invitationEndpoint = (operation: InvitationOperation, id?: string) => authenticatedEndpoint((actor, request) => invitationResponse(invitationUseCases(), operation, actor, request, id));
export const membershipEndpoint = (operation: MembershipOperation, id?: string) => authenticatedEndpoint((actor, request) => membershipResponse(membershipUseCases(), operation, actor, request, id));
export const publicInvitationEndpoint = (operation: 'preview') => async (request: Request) => {
  try { return await invitationResponse(invitationUseCases(), operation, null, request); }
  catch (error) { return errorResponse(error); }
};
