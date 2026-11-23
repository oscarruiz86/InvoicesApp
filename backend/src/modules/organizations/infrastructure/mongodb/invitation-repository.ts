import { randomUUID } from 'node:crypto';
import { Schema, Types, type ClientSession, type Connection } from 'mongoose';
import { InvitationDomainError, normalizeRecipientEmail, normalizeRoles, type Invitation, type Membership } from '../../domain/invitations';
import type { LocalRole, OrganizationType } from '../../domain/organization';
import type { DriverProvisioningPort } from '../../application/driver-provisioning';
import { organizationModels } from './organization-repository';
import { hashInvitationToken, matchesInvitationToken } from '../invitation-tokens';
import { createMongoAuditWriter, prepareMongoAudit } from '@/modules/audit/infrastructure/mongodb/audit-writer';

export class InvitationRepositoryError extends Error {
  constructor(readonly code: 'INVALID_RECORD' | 'DUPLICATE_PENDING_INVITATION' | 'DUPLICATE_MEMBERSHIP' | 'IDENTITY_MISMATCH' | 'INVITATION_EXPIRED' | 'INVALID_ROLES' | 'LAST_ROLE_REQUIRED' | 'LAST_ADMINISTRATOR_REQUIRED' | 'VERSION_CONFLICT' | 'RECORD_NOT_FOUND' | 'AUTHORITY_REVOKED' | 'STORAGE_UNAVAILABLE') { super(code); }
}

const invitationSchema = new Schema({
  id: { type: String, required: true, maxlength: 128 }, organizationId: { type: String, required: true, maxlength: 128 },
  organizationType: { type: String, required: true, enum: ['COMPANY', 'THIRD_PARTY'] }, companyId: { type: String, default: null, maxlength: 128 },
  recipientEmail: { type: String, required: true, maxlength: 254 }, roles: { type: [String], required: true, enum: ['COMPANY_ADMIN', 'THIRD_PARTY_ADMIN', 'DRIVER'] },
  invitedBy: { type: String, required: true, maxlength: 128 }, status: { type: String, required: true, enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED'] },
  expiresAt: { type: Date, required: true }, tokenHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ }, tokenVersion: { type: Number, required: true, min: 1 },
  version: { type: Number, required: true, min: 1 }, createdAt: { type: Date, required: true }, resolvedAt: { type: Date, default: null },
  acceptedSubject: { type: String, default: null, maxlength: 128 }, deliveryStatus: { type: String, required: true, enum: ['UNKNOWN', 'LOGGED', 'FAILED'] },
  attemptId: { type: String, default: null, maxlength: 128 },
}, { strict: 'throw', versionKey: false, collection: 'organization_invitations' });
invitationSchema.index({ id: 1 }, { unique: true });
invitationSchema.index({ organizationId: 1, status: 1, createdAt: -1, id: 1 });
invitationSchema.index({ companyId: 1, createdAt: -1, id: 1 });
invitationSchema.index({ status: 1, expiresAt: 1 });
invitationSchema.index({ tokenHash: 1 }, { unique: true });
invitationSchema.index({ recipientEmail: 1, organizationId: 1 }, { unique: true, partialFilterExpression: { status: 'PENDING' } });
invitationSchema.index({ recipientEmail: 1, createdAt: -1, id: -1 });

const membershipSchema = new Schema({
  id: { type: String, required: true, maxlength: 128 }, subject: { type: String, required: true, maxlength: 128 },
  organizationId: { type: String, required: true, maxlength: 128 }, status: { type: String, required: true, enum: ['ACTIVE', 'INACTIVE'] },
  origin: { type: String, required: true, enum: ['INVITATION', 'LEGACY'] }, acceptedInvitationId: { type: String, default: null, maxlength: 128 },
  acceptedAt: { type: Date, default: null }, revision: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
}, { strict: 'throw', versionKey: false, collection: 'organization_memberships' });
membershipSchema.index({ id: 1 }, { unique: true });
membershipSchema.index({ subject: 1, organizationId: 1 }, { unique: true });
membershipSchema.index({ organizationId: 1, status: 1, subject: 1 });

const invitationModel = (connection: Connection) => connection.models.OrganizationInvitation ?? connection.model('OrganizationInvitation', invitationSchema);
const membershipModel = (connection: Connection) => connection.models.OrganizationMembership ?? connection.model('OrganizationMembership', membershipSchema);

function mapError(error: unknown, duplicateCode: 'DUPLICATE_PENDING_INVITATION' | 'DUPLICATE_MEMBERSHIP' = 'DUPLICATE_PENDING_INVITATION'): never {
  if (error && typeof error === 'object' && 'code' in error && error.code === 11000) throw new InvitationRepositoryError(duplicateCode);
  if (error instanceof InvitationRepositoryError) throw error;
  if (error instanceof InvitationDomainError) throw new InvitationRepositoryError(error.code === 'INVALID_ROLES' ? 'INVALID_ROLES' : error.code === 'LAST_ROLE_REQUIRED' ? 'LAST_ROLE_REQUIRED' : 'INVALID_RECORD');
  throw new InvitationRepositoryError('STORAGE_UNAVAILABLE');
}

const regexLiteral = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function validatedRoles(type: OrganizationType, roles: readonly string[]): LocalRole[] {
  if (!roles.length) throw new InvitationRepositoryError('LAST_ROLE_REQUIRED');
  try { return normalizeRoles(type, roles); }
  catch { throw new InvitationRepositoryError('INVALID_ROLES'); }
}

export function createInvitationRepository(connect: () => Promise<Connection>, guards?: {
  revalidateAndCoordinate(invitation: Invitation, session: ClientSession): Promise<boolean>;
  prepareInvitationNotification?(): Promise<void>;
  enqueueInvitationNotification?(input: { id: string; type: 'INVITATION_CREATED' | 'INVITATION_RESENT'; channel: 'email'; recipient: string; language: string; functionalReference: string; idempotencyKey: string; expiresAt: Date; payload: { token: string; organizationName: string; roles: readonly string[] }; projectionData: { invitationId: string; tokenVersion: number; attemptId: string }; createdAt: Date }, session: ClientSession): Promise<void>;
  authorizeMembershipChange?(actorSubject: string, membership: Membership, organizationType: OrganizationType, companyId: string | null, roles: readonly string[], session: ClientSession): Promise<boolean>;
}) {
  let initialized: Promise<void> | undefined;
  async function initialize(connection: Connection) {
    if (!initialized) initialized = Promise.all([invitationModel(connection).init(), membershipModel(connection).init(), prepareMongoAudit(connection), ...Object.values(organizationModels(connection)).map(model => model.init()),
      connection.collection('organization_invitation_events').createIndex({ eventId: 1 }, { unique: true }),
      connection.collection('organization_invitation_events').createIndex({ invitationId: 1, at: 1, eventId: 1 }),
      connection.collection('organization_membership_events').createIndex({ eventId: 1 }, { unique: true }),
      connection.collection('organization_membership_events').createIndex({ organizationId: 1, at: 1, eventId: 1 }),
    ]).then(() => undefined).catch(error => {
      initialized = undefined;
      throw error;
    });
    await initialized;
  }
  return {
    async createPending(invitation: Invitation, now: Date, notification?: { type: 'INVITATION_CREATED' | 'INVITATION_RESENT'; invitationId: string; tokenVersion: number; attemptId: string; token: string; recipient: string; organizationName: string; roles: readonly string[]; expiresAt: Date; createdAt: Date }): Promise<Invitation> {
      try {
        if (invitation.status !== 'PENDING' || invitation.deliveryStatus !== 'UNKNOWN' || !invitation.attemptId || invitation.version !== 1 || invitation.tokenVersion !== 1 || !/^[a-f0-9]{64}$/.test(invitation.tokenHash)
          || invitation.recipientEmail !== normalizeRecipientEmail(invitation.recipientEmail)
          || JSON.stringify(invitation.roles) !== JSON.stringify(normalizeRoles(invitation.organizationType, invitation.roles))) {
          throw new InvitationRepositoryError('INVALID_RECORD');
        }
        const connection = await connect();
        await initialize(connection);
        const invitations = invitationModel(connection);
        await guards?.prepareInvitationNotification?.();
        await connection.transaction(async session => {
          const expired = await invitations.find({ recipientEmail: invitation.recipientEmail, organizationId: invitation.organizationId,
            status: 'PENDING', expiresAt: { $lte: now } }).session(session).lean().exec();
          if (expired.length) {
            await invitations.updateMany({ _id: { $in: expired.map(value => value._id) }, status: 'PENDING', expiresAt: { $lte: now } }, {
              $set: { status: 'EXPIRED', resolvedAt: now }, $inc: { version: 1 },
            }, { session });
            for (const prior of expired) await connection.collection('organization_invitation_events').insertOne({ eventId: randomUUID(),
              invitationId: prior.id, organizationId: prior.organizationId, actorSubject: null, action: 'INVITATION_EXPIRED', at: now, version: Number(prior.version) + 1 }, { session });
          }
          if (guards?.revalidateAndCoordinate && !await guards.revalidateAndCoordinate(invitation, session)) throw new InvitationRepositoryError('AUTHORITY_REVOKED');
          await invitations.create([invitation], { session });
          await connection.collection('organization_invitation_events').insertOne({ eventId: randomUUID(), invitationId: invitation.id,
            organizationId: invitation.organizationId, actorSubject: invitation.invitedBy, action: 'INVITATION_CREATED', at: now,
            roles: invitation.roles, version: invitation.version }, { session });          if (notification && guards?.enqueueInvitationNotification) await guards.enqueueInvitationNotification({
            id: notification.attemptId, type: notification.type, channel: 'email', recipient: notification.recipient, language: 'es', functionalReference: notification.invitationId,
            idempotencyKey: notification.attemptId, expiresAt: notification.expiresAt, payload: { token: notification.token, organizationName: notification.organizationName, roles: notification.roles },
            projectionData: { invitationId: notification.invitationId, tokenVersion: notification.tokenVersion, attemptId: notification.attemptId }, createdAt: notification.createdAt }, session);
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true }, maxCommitTimeMS: 5000 });
        return invitation;
      } catch (error) { return mapError(error); }
    },
    async findInvitation(id: string): Promise<Invitation | null> {
      try {
        const connection = await connect();
        await initialize(connection);
        const value = await invitationModel(connection).findOne({ id }).lean().exec();
        return value as Invitation | null;
      } catch (error) { return mapError(error); }
    },
    async listInvitations(input: { organizationId: string; organizationType?: Invitation['organizationType'] | 'ALL'; companyId?: string; companyWide?: boolean;
      status?: Invitation['status']; email?: string; role?: Invitation['roles'][number]; delivery?: Invitation['deliveryStatus']; page: number; pageSize: number; now: Date }): Promise<{ readonly items: readonly Invitation[]; readonly total: number }> {
      if (!input.organizationId || !Number.isSafeInteger(input.page) || input.page < 1 || !Number.isSafeInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) {
        throw new InvitationRepositoryError('INVALID_RECORD');
      }
      try {
        const connection = await connect();
        await initialize(connection);
        const model = invitationModel(connection);
        const organizationFilter: Record<string, unknown> = input.companyWide
          ? input.organizationType === 'ALL'
            ? input.companyId ? { $or: [{ organizationType: 'COMPANY', organizationId: input.companyId }, { organizationType: 'THIRD_PARTY', companyId: input.companyId }] }
              : { organizationType: { $in: ['COMPANY', 'THIRD_PARTY'] } }
            : { organizationType: 'THIRD_PARTY', companyId: input.companyId }
          : { organizationId: input.organizationId, ...(input.companyId ? { companyId: input.companyId } : {}), ...(input.organizationType ? { organizationType: input.organizationType } : {}) };
        const predicates: Record<string, unknown>[] = [organizationFilter];
        if (input.status === 'PENDING') predicates.push({ status: 'PENDING', expiresAt: { $gt: input.now } });
        else if (input.status === 'EXPIRED') predicates.push({ $or: [{ status: 'EXPIRED' }, { status: 'PENDING', expiresAt: { $lte: input.now } }] });
        else if (input.status) predicates.push({ status: input.status });
        if (input.email) predicates.push({ recipientEmail: { $regex: regexLiteral(input.email.trim()), $options: 'i' } });
        if (input.role) predicates.push({ roles: input.role });
        if (input.delivery) predicates.push({ deliveryStatus: input.delivery });
        const filter = predicates.length === 1 ? organizationFilter : { $and: predicates };
        const [values, total] = await Promise.all([
          model.find(filter).sort({ createdAt: -1, id: -1 }).skip((input.page - 1) * input.pageSize).limit(input.pageSize).lean().exec(),
          model.countDocuments(filter).exec(),
        ]);
        const items = values.map(value => {
          const invitation = value as Invitation;
          return invitation.status === 'PENDING' && invitation.expiresAt.getTime() <= input.now.getTime()
            ? { ...invitation, status: 'EXPIRED' as const, resolvedAt: invitation.expiresAt }
            : invitation;
        });
        return { items, total };
      } catch (error) { return mapError(error); }
    },
    async listReceivedInvitations(input: { recipientEmail: string; page: number; pageSize: number; now: Date }): Promise<{ readonly items: readonly Invitation[]; readonly total: number }> {
      if (input.recipientEmail !== normalizeRecipientEmail(input.recipientEmail) || !Number.isSafeInteger(input.page) || input.page < 1
        || !Number.isSafeInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) throw new InvitationRepositoryError('INVALID_RECORD');
      try {
        const connection = await connect();
        await initialize(connection);
        const model = invitationModel(connection);
        const filter = { recipientEmail: input.recipientEmail };
        const [values, total] = await Promise.all([
          model.find(filter).sort({ createdAt: -1, id: -1 }).skip((input.page - 1) * input.pageSize).limit(input.pageSize).lean().exec(),
          model.countDocuments(filter).exec(),
        ]);
        const items = values.map(value => {
          const invitation = value as Invitation;
          return invitation.status === 'PENDING' && invitation.expiresAt.getTime() <= input.now.getTime()
            ? { ...invitation, status: 'EXPIRED' as const, resolvedAt: invitation.expiresAt }
            : invitation;
        });
        return { items, total };
      } catch (error) { return mapError(error); }
    },
    async findInvitationByToken(token: string, now: Date): Promise<Invitation | null> {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
      try {
        const connection = await connect();
        await initialize(connection);
        const model = invitationModel(connection);
        const value = await model.findOne({ tokenHash: hashInvitationToken(token) }).lean().exec();
        if (!value) return null;
        const invitation = value as Invitation;
        if (!matchesInvitationToken(token, invitation.tokenHash)) return null;
        if (invitation.status !== 'PENDING' || invitation.expiresAt.getTime() > now.getTime()) return invitation;
        return await connection.transaction(async session => {
          const expired = await model.findOneAndUpdate({ id: invitation.id, status: 'PENDING', version: invitation.version, expiresAt: { $lte: now } }, {
            $set: { status: 'EXPIRED', resolvedAt: now }, $inc: { version: 1 },
          }, { session, returnDocument: 'after' }).lean().exec();
          if (expired) await connection.collection('organization_invitation_events').insertOne({ eventId: randomUUID(), invitationId: invitation.id,
            organizationId: invitation.organizationId, actorSubject: null, action: 'INVITATION_EXPIRED', at: now, version: invitation.version + 1 }, { session });
          return expired ? expired as Invitation : await model.findOne({ id: invitation.id }).session(session).lean().exec() as Invitation | null;
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true }, maxCommitTimeMS: 5000 });
      } catch (error) { return mapError(error); }
    },
    async updateDeliveryStatus(input: { id: string; tokenVersion: number; attemptId: string; status: 'LOGGED' | 'FAILED' | 'UNKNOWN'; now: Date }): Promise<Invitation> {
      if (!input.id || !input.attemptId || input.tokenVersion < 1) throw new InvitationRepositoryError('INVALID_RECORD');
      try {
        const connection = await connect();
        await initialize(connection);
        const model = invitationModel(connection);
        let result: Invitation | null = null;
        await connection.transaction(async session => {
          result = null;
          const currentValue = await model.findOne({ id: input.id, tokenVersion: input.tokenVersion, attemptId: input.attemptId }).session(session).lean().exec();
          if (!currentValue) throw new InvitationRepositoryError('VERSION_CONFLICT');
          const current = currentValue as Invitation;
          if (current.deliveryStatus === input.status) { result = current; return; }
          const updated = await model.findOneAndUpdate({ id: input.id, tokenVersion: input.tokenVersion, attemptId: input.attemptId }, {
            $set: { deliveryStatus: input.status }, $inc: { version: 1 },
          }, { session, returnDocument: 'after', runValidators: true }).lean().exec();
          if (!updated) throw new InvitationRepositoryError('VERSION_CONFLICT');
          result = updated as Invitation;
          await connection.collection('organization_invitation_events').insertOne({ eventId: randomUUID(), invitationId: input.id,
            organizationId: current.organizationId, actorSubject: null, action: `INVITATION_DELIVERY_${input.status}`, at: input.now,
            version: result.version, tokenVersion: input.tokenVersion }, { session });
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true }, maxCommitTimeMS: 5000 });
        if (!result) throw new InvitationRepositoryError('STORAGE_UNAVAILABLE');
        return result;
      } catch (error) { return mapError(error); }
    },
    async resendPending(input: { id: string; expectedVersion: number; tokenHash: string; attemptId: string; expiresAt: Date; now: Date; notification?: { recipient: string; token: string; organizationName: string; roles: readonly string[] } }): Promise<Invitation> {
      if (!/^[a-f0-9]{64}$/.test(input.tokenHash) || !input.attemptId || input.expiresAt.getTime() <= input.now.getTime()) throw new InvitationRepositoryError('INVALID_RECORD');
      try {
        const connection = await connect();
        await initialize(connection);
        const model = invitationModel(connection);
        await guards?.prepareInvitationNotification?.();
        let result: Invitation | null = null;
        let outcome: InvitationRepositoryError | null = null;
        await connection.transaction(async session => {
          result = null;
          outcome = null;
          const currentValue = await model.findOne({ id: input.id }).session(session).lean().exec();
          if (!currentValue) { outcome = new InvitationRepositoryError('RECORD_NOT_FOUND'); return; }
          const current = currentValue as Invitation;
          if (current.status !== 'PENDING' || current.version !== input.expectedVersion) { outcome = new InvitationRepositoryError('VERSION_CONFLICT'); return; }
          if (current.expiresAt.getTime() <= input.now.getTime()) {
            const expired = await model.updateOne({ id: current.id, status: 'PENDING', version: current.version, expiresAt: { $lte: input.now } }, {
              $set: { status: 'EXPIRED', resolvedAt: input.now }, $inc: { version: 1 },
            }, { session });
            if (expired.modifiedCount === 1) {

await connection.collection('organization_invitation_events').insertOne({ eventId: randomUUID(), invitationId: current.id,
                organizationId: current.organizationId, actorSubject: null, action: 'INVITATION_EXPIRED', at: input.now, version: current.version + 1 }, { session });
            }
            outcome = new InvitationRepositoryError('INVITATION_EXPIRED');
            return;
          }
          if (guards?.revalidateAndCoordinate && !await guards.revalidateAndCoordinate(current, session)) { outcome = new InvitationRepositoryError('AUTHORITY_REVOKED'); return; }
          const updated = await model.findOneAndUpdate({ id: current.id, status: 'PENDING', version: input.expectedVersion, expiresAt: { $gt: input.now } }, {
            $set: { tokenHash: input.tokenHash, expiresAt: input.expiresAt, attemptId: input.attemptId, deliveryStatus: 'UNKNOWN' },
            $inc: { version: 1, tokenVersion: 1 },
          }, { session, returnDocument: 'after', runValidators: true }).lean().exec();
          if (!updated) { outcome = new InvitationRepositoryError('VERSION_CONFLICT'); return; }
          result = updated as Invitation;

await connection.collection('organization_invitation_events').insertOne({ eventId: randomUUID(), invitationId: current.id,
            organizationId: current.organizationId, actorSubject: null, action: 'INVITATION_RESENT', at: input.now,
            roles: current.roles, version: result.version, tokenVersion: result.tokenVersion }, { session });          const notification = input.notification;
          if (notification && guards?.enqueueInvitationNotification) await guards.enqueueInvitationNotification({
            id: input.attemptId, type: 'INVITATION_RESENT', channel: 'email', recipient: notification.recipient, language: 'es', functionalReference: input.id,
            idempotencyKey: input.attemptId, expiresAt: input.expiresAt, payload: { token: notification.token, organizationName: notification.organizationName, roles: notification.roles },
            projectionData: { invitationId: input.id, tokenVersion: result.tokenVersion, attemptId: input.attemptId }, createdAt: input.now }, session);
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true }, maxCommitTimeMS: 5000 });
        if (outcome) throw outcome;
        if (!result) throw new InvitationRepositoryError('STORAGE_UNAVAILABLE');
        return result;
      } catch (error) { return mapError(error); }
    },
    async resolveInvitation(id: string, expectedVersion: number, status: 'ACCEPTED' | 'REJECTED' | 'CANCELLED', now: Date, acceptedSubject: string | null = null): Promise<Invitation> {
      try {
        if ((status === 'ACCEPTED') !== Boolean(acceptedSubject)) throw new InvitationRepositoryError('INVALID_RECORD');
        const connection = await connect();
        await initialize(connection);
        const model = invitationModel(connection);
        let resolved: Invitation | null = null;
        let outcome: InvitationRepositoryError | null = null;
        await connection.transaction(async session => {
          resolved = null;
          outcome = null;
          const updated = await model.findOneAndUpdate({ id, status: 'PENDING', version: expectedVersion, expiresAt: { $gt: now } }, {
            $set: { status, resolvedAt: now, acceptedSubject }, $inc: { version: 1 },
          }, { session, returnDocument: 'after', runValidators: true }).lean().exec();
          if (updated) {
            resolved = updated as Invitation;
            await connection.collection('organization_invitation_events').insertOne({ eventId: randomUUID(), invitationId: id,
              organizationId: resolved.organizationId, actorSubject: acceptedSubject, action: `INVITATION_${status}`, at: now,
              roles: resolved.roles, version: resolved.version }, { session });
            return;
          }
          const expired = await model.findOneAndUpdate({ id, status: 'PENDING', version: expectedVersion, expiresAt: { $lte: now } }, {
            $set: { status: 'EXPIRED', resolvedAt: now }, $inc: { version: 1 },
          }, { session, returnDocument: 'after' }).lean().exec();
          if (expired) {
            resolved = expired as Invitation;
            outcome = new InvitationRepositoryError('INVITATION_EXPIRED');
            await connection.collection('organization_invitation_events').insertOne({ eventId: randomUUID(), invitationId: id,
              organizationId: resolved.organizationId, actorSubject: null, action: 'INVITATION_EXPIRED', at: now, version: resolved.version }, { session });
            return;
          }
          const exists = await model.exists({ id }).session(session);
          outcome = new InvitationRepositoryError(exists ? 'VERSION_CONFLICT' : 'RECORD_NOT_FOUND');
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true }, maxCommitTimeMS: 5000 });
        if (outcome) throw outcome;
        if (!resolved) throw new InvitationRepositoryError('STORAGE_UNAVAILABLE');
        return resolved;
      } catch (error) { return mapError(error); }
    },
    async accept(input: {
      invitationId: string; token: string | null; expectedVersion: number; subject: string; email: string | null; emailVerified: boolean;
      profileComplete: boolean; now: Date; membershipId: string; driverProvisioning?: DriverProvisioningPort;
    }): Promise<{ invitation: Invitation; membership: Membership }> {
      if (!guards) throw new InvitationRepositoryError('STORAGE_UNAVAILABLE');
      if (!input.subject || !input.email || !input.emailVerified || !input.profileComplete) throw new InvitationRepositoryError('IDENTITY_MISMATCH');
      if (!input.membershipId) throw new InvitationRepositoryError('INVALID_RECORD');
      const connection = await connect();
      await initialize(connection);
      let result: { invitation: Invitation; membership: Membership } | null = null;
      let outcome: InvitationRepositoryError | null = null;
      try {
        await connection.transaction(async session => {
          outcome = null;
          result = null;
          const model = invitationModel(connection);
          const currentValue = await model.findOne({ id: input.invitationId }).session(session).lean().exec();
          if (!currentValue) { outcome = new InvitationRepositoryError('RECORD_NOT_FOUND'); return; }
          const current = currentValue as Invitation;
          if (current.status !== 'PENDING' || current.version !== input.expectedVersion) { outcome = new InvitationRepositoryError('VERSION_CONFLICT'); return; }
          if (input.token !== null && !matchesInvitationToken(input.token, current.tokenHash)) { outcome = new InvitationRepositoryError('RECORD_NOT_FOUND'); return; }
          if (current.expiresAt.getTime() <= input.now.getTime()) {
            const expired = await model.updateOne({ id: current.id, status: 'PENDING', version: current.version, expiresAt: { $lte: input.now } }, {
              $set: { status: 'EXPIRED', resolvedAt: input.now }, $inc: { version: 1 },
            }, { session });
            if (expired.modifiedCount === 1) await connection.collection('organization_invitation_events').insertOne({ eventId: randomUUID(),
              invitationId: current.id, organizationId: current.organizationId, actorSubject: null, action: 'INVITATION_EXPIRED', at: input.now,
              version: current.version + 1 }, { session });
            outcome = new InvitationRepositoryError('INVITATION_EXPIRED');
            return;
          }
          let normalizedEmail: string;
          try { normalizedEmail = normalizeRecipientEmail(input.email!); } catch { outcome = new InvitationRepositoryError('IDENTITY_MISMATCH'); return; }
          if (normalizedEmail !== current.recipientEmail) { outcome = new InvitationRepositoryError('IDENTITY_MISMATCH'); return; }
          if (current.invitedBy === input.subject) { outcome = new InvitationRepositoryError('IDENTITY_MISMATCH'); return; }
          if (!await guards.revalidateAndCoordinate(current, session)) { outcome = new InvitationRepositoryError('AUTHORITY_REVOKED'); return; }
          const updatedValue = await model.findOneAndUpdate({ id: current.id, status: 'PENDING', version: current.version, expiresAt: { $gt: input.now } }, {
            $set: { status: 'ACCEPTED', resolvedAt: input.now, acceptedSubject: input.subject }, $inc: { version: 1 },
          }, { session, returnDocument: 'after', runValidators: true }).lean().exec();
          if (!updatedValue) { outcome = new InvitationRepositoryError('VERSION_CONFLICT'); return; }
          const updated = updatedValue as Invitation;
          const membership: Membership = { id: input.membershipId, subject: input.subject, organizationId: current.organizationId, status: 'ACTIVE',
            origin: 'INVITATION', acceptedInvitationId: current.id, acceptedAt: input.now, revision: 1 };
          await membershipModel(connection).create([membership], { session });
          const roleCollection = connection.collection('organization_associations');
          await roleCollection.insertMany(current.roles.map(capability => ({ id: new Types.ObjectId().toString(), subject: input.subject,
            organizationId: current.organizationId, capability, assigned: true, active: true, revision: 1, updatedAt: input.now, membershipId: membership.id })), { session });
          if (current.organizationType === 'THIRD_PARTY' && current.roles.includes('DRIVER')) {
            if (!input.driverProvisioning) throw new InvitationRepositoryError('STORAGE_UNAVAILABLE');
            await input.driverProvisioning.provision({ membership, roles: current.roles, actorSubject: input.subject, now: input.now, source: 'INVITATION' }, session);
          }
          await connection.collection('organization_invitation_events').insertOne({ eventId: randomUUID(), invitationId: current.id,
            organizationId: current.organizationId, subject: input.subject, action: 'INVITATION_ACCEPTED', at: input.now, version: updated.version }, { session });
          result = { invitation: updated, membership };
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true }, maxCommitTimeMS: 5000 });
        if (outcome) throw outcome;
        if (!result) throw new InvitationRepositoryError('STORAGE_UNAVAILABLE');
        return result;
      } catch (error) { return mapError(error, 'DUPLICATE_MEMBERSHIP'); }
    },
    async insertMembership(membership: Membership): Promise<Membership> {
      try {
        if (membership.revision !== 1 || (membership.origin === 'LEGACY' && (membership.acceptedAt !== null || membership.acceptedInvitationId !== null))) {
          throw new InvitationRepositoryError('INVALID_RECORD');
        }
        const connection = await connect();
        await initialize(connection);
        await membershipModel(connection).create(membership);
        return membership;
      } catch (error) { return mapError(error, 'DUPLICATE_MEMBERSHIP'); }
    },
    async updateMembership(membership: Membership, expectedRevision: number): Promise<Membership> {
      try {
        if (membership.revision !== expectedRevision + 1 || (membership.origin === 'LEGACY' && (membership.acceptedAt !== null || membership.acceptedInvitationId !== null))) {
          throw new InvitationRepositoryError('INVALID_RECORD');
        }
        const connection = await connect();
        await initialize(connection);
        const updated = await membershipModel(connection).findOneAndUpdate({ id: membership.id, revision: expectedRevision }, { $set: membership }, { returnDocument: 'after', runValidators: true }).lean().exec();
        if (!updated) throw new InvitationRepositoryError('VERSION_CONFLICT');
        return updated as Membership;
      } catch (error) { return mapError(error); }
    },
    async listMemberships(input: { organizationId: string; organizationType: OrganizationType; status?: 'ACTIVE' | 'INACTIVE'; role?: LocalRole; subjects?: readonly string[]; page: number; pageSize: number }): Promise<{ readonly items: readonly { readonly membership: Membership; readonly roles: readonly LocalRole[] }[]; readonly total: number }> {
      if (!input.organizationId || !Number.isSafeInteger(input.page) || input.page < 1 || !Number.isSafeInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) {
        throw new InvitationRepositoryError('INVALID_RECORD');
      }
      try {
        const connection = await connect();
        await initialize(connection);
        const memberships = membershipModel(connection);
        if (input.subjects && !input.subjects.length) return { items: [], total: 0 };
        const filter: Record<string, unknown> = { organizationId: input.organizationId, ...(input.status ? { status: input.status } : {}), ...(input.subjects ? { subject: { $in: input.subjects } } : {}) };
        if (input.role) {
          const assignments = await connection.collection('organization_associations').find({ organizationId: input.organizationId, capability: input.role, assigned: { $ne: false } }, { projection: { membershipId: 1, _id: 0 } }).toArray();
          const membershipIds = assignments.map(value => value.membershipId).filter((value): value is string => typeof value === 'string');
          if (!membershipIds.length) return { items: [], total: 0 };
          filter.id = { $in: membershipIds };
        }
        const [values, total] = await Promise.all([
          memberships.find(filter).sort({ subject: 1, id: 1 }).skip((input.page - 1) * input.pageSize).limit(input.pageSize).lean().exec(),
          memberships.countDocuments(filter).exec(),
        ]);
        if (!values.length) return { items: [], total };
        const organization = await connection.collection('organizations').findOne({ id: input.organizationId, type: input.organizationType });
        if (!organization) throw new InvitationRepositoryError('RECORD_NOT_FOUND');
        const ids = values.map(value => String(value.id));
        const assignments = await connection.collection('organization_associations').find({ organizationId: input.organizationId, membershipId: { $in: ids } }).sort({ capability: 1 }).toArray();
        const items = values.map(value => {
          const membership = value as Membership;
          const roles = [...new Set(assignments.filter(assignment => assignment.membershipId === membership.id && assignment.subject === membership.subject && assignment.assigned !== false)
            .map(assignment => String(assignment.capability)))];
          return { membership, roles: validatedRoles(input.organizationType, roles) };
        });
        return { items, total };
      } catch (error) { return mapError(error); }
    },
    async listMembershipsByCompany(input: { companyId?: string; status?: 'ACTIVE' | 'INACTIVE'; role?: LocalRole; subjects?: readonly string[]; page: number; pageSize: number }): Promise<{ readonly items: readonly { readonly membership: Membership; readonly roles: readonly LocalRole[]; readonly organization: { readonly id: string; readonly organizationType: OrganizationType; readonly name: string } }[]; readonly total: number }> {
      if (!Number.isSafeInteger(input.page) || input.page < 1 || !Number.isSafeInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) {
        throw new InvitationRepositoryError('INVALID_RECORD');
      }
      try {
        const connection = await connect();
        await initialize(connection);
        const companies = connection.collection('organizations');
        let organizations;
        if (input.companyId) {
          const company = await companies.findOne({ id: input.companyId, type: 'COMPANY', active: true }, { projection: { _id: 0, id: 1, type: 1, name: 1 } });
          if (!company) throw new InvitationRepositoryError('RECORD_NOT_FOUND');
          const relations = await connection.collection('company_third_party_relations').find({ companyId: input.companyId, active: true }, { projection: { thirdPartyId: 1, _id: 0 } }).toArray();
          const thirdPartyIds = relations.map(value => value.thirdPartyId).filter((value): value is string => typeof value === 'string');
          organizations = await companies.find({ $or: [{ id: input.companyId, type: 'COMPANY', active: true },
            { id: { $in: thirdPartyIds }, type: 'THIRD_PARTY', active: true }] }, { projection: { _id: 0, id: 1, type: 1, name: 1 } }).toArray();
        } else {
          organizations = await companies.find({ type: { $in: ['COMPANY', 'THIRD_PARTY'] }, active: true }, { projection: { _id: 0, id: 1, type: 1, name: 1 } }).toArray();
        }
        const organizationById = new Map(organizations.map(value => [String(value.id), {
          id: String(value.id), organizationType: value.type as OrganizationType, name: String(value.name),
        }]));
        const organizationIds = [...organizationById.keys()];
        if (!organizationIds.length || input.subjects?.length === 0) return { items: [], total: 0 };
        const memberships = membershipModel(connection);
        const filter: Record<string, unknown> = { organizationId: { $in: organizationIds }, ...(input.status ? { status: input.status } : {}),
          ...(input.subjects ? { subject: { $in: input.subjects } } : {}) };
        if (input.role) {
          const matchingAssignments = await connection.collection('organization_associations').find({ organizationId: { $in: organizationIds }, capability: input.role,
            assigned: { $ne: false } }, { projection: { membershipId: 1, _id: 0 } }).toArray();
          const membershipIds = matchingAssignments.map(value => value.membershipId).filter((value): value is string => typeof value === 'string');
          if (!membershipIds.length) return { items: [], total: 0 };
          filter.id = { $in: membershipIds };
        }
        const [values, total] = await Promise.all([
          memberships.find(filter).sort({ organizationId: 1, subject: 1, id: 1 }).skip((input.page - 1) * input.pageSize).limit(input.pageSize).lean().exec(),
          memberships.countDocuments(filter).exec(),
        ]);
        if (!values.length) return { items: [], total };
        const ids = values.map(value => String(value.id));
        const assignments = await connection.collection('organization_associations').find({ organizationId: { $in: organizationIds }, membershipId: { $in: ids } }).sort({ capability: 1 }).toArray();
        const items = values.flatMap(value => {
          const membership = value as Membership;
          const organization = organizationById.get(membership.organizationId);
          if (!organization) return [];
          const roles = [...new Set(assignments.filter(assignment => assignment.organizationId === membership.organizationId && assignment.membershipId === membership.id
            && assignment.subject === membership.subject && assignment.assigned !== false).map(assignment => String(assignment.capability)))];
          return [{ membership, roles: validatedRoles(organization.organizationType, roles), organization }];
        });
        return { items, total };
      } catch (error) { return mapError(error); }
    },
    async findMembership(input: { membershipId: string; organizationId: string; organizationType: OrganizationType }): Promise<{ readonly membership: Membership; readonly roles: readonly LocalRole[] } | null> {
      try {
        const connection = await connect();
        await initialize(connection);
        const value = await membershipModel(connection).findOne({ id: input.membershipId, organizationId: input.organizationId }).lean().exec();
        if (!value) return null;
        const membership = value as Membership;
        const organization = await connection.collection('organizations').findOne({ id: input.organizationId, type: input.organizationType, active: true });
        if (!organization) return null;
        const assignments = await connection.collection('organization_associations').find({ subject: membership.subject, organizationId: input.organizationId,
          membershipId: membership.id }).sort({ capability: 1 }).toArray();
        const roles = validatedRoles(input.organizationType, [...new Set(assignments.filter(assignment => assignment.assigned !== false).map(assignment => String(assignment.capability)))]);
        return { membership, roles };
      } catch (error) { return mapError(error); }
    },
    async changeMembership(input: {
      membershipId: string; expectedRevision: number; actorSubject: string; now: Date; status?: 'ACTIVE' | 'INACTIVE'; roles?: readonly string[];
      companyId?: string | null;
      replacement?: { membershipId: string; expectedRevision: number; roles: readonly string[]; status?: 'ACTIVE' | 'INACTIVE' }; driverProvisioning?: DriverProvisioningPort;
    }): Promise<{ membership: Membership; roles: LocalRole[]; replacement?: { membership: Membership; roles: LocalRole[] } }> {
      const authorizeMembershipChange = guards?.authorizeMembershipChange;
      if (!authorizeMembershipChange || !input.actorSubject) throw new InvitationRepositoryError('AUTHORITY_REVOKED');
      const connection = await connect();
      await initialize(connection);
      try {
        return await connection.transaction(async session => {
          const memberships = membershipModel(connection);
          const roleCollection = connection.collection('organization_associations');
          const targetValue = await memberships.findOne({ id: input.membershipId, revision: input.expectedRevision }).session(session).lean().exec();
          if (!targetValue) throw new InvitationRepositoryError('VERSION_CONFLICT');
          const target = targetValue as Membership;
          const organization = await connection.collection('organizations').findOne({ id: target.organizationId }, { session });
          if (!organization || (organization.type !== 'COMPANY' && organization.type !== 'THIRD_PARTY')) throw new InvitationRepositoryError('RECORD_NOT_FOUND');
          const organizationType = organization.type as OrganizationType;
          const targetAssignments = await roleCollection.find({ subject: target.subject, organizationId: target.organizationId }, { session }).sort({ capability: 1 }).toArray();
          const targetCurrentRoles = [...new Set(targetAssignments.filter(value => value.assigned !== false).map(value => String(value.capability)))];
          const targetRoles = input.roles === undefined ? validatedRoles(organizationType, targetCurrentRoles) : validatedRoles(organizationType, input.roles);
          if (!targetRoles.length) throw new InvitationRepositoryError('LAST_ROLE_REQUIRED');
          if (!await authorizeMembershipChange(input.actorSubject, target, organizationType, input.companyId ?? null, [...new Set([...targetCurrentRoles, ...targetRoles])], session)) throw new InvitationRepositoryError('AUTHORITY_REVOKED');
          const targetStatus = input.status ?? target.status;
          if (targetStatus === 'ACTIVE' && !organization.active) throw new InvitationRepositoryError('AUTHORITY_REVOKED');
          let replacement: Membership | null = null;
          let replacementRoles: LocalRole[] | undefined;
          let replacementStatus: 'ACTIVE' | 'INACTIVE' | undefined;
          let replacementAssignments: Record<string, unknown>[] = [];
          if (input.replacement) {
            const replacementValue = await memberships.findOne({ id: input.replacement.membershipId, organizationId: target.organizationId, revision: input.replacement.expectedRevision }).session(session).lean().exec();
            if (!replacementValue || input.replacement.membershipId === input.membershipId) throw new InvitationRepositoryError('VERSION_CONFLICT');
            replacement = replacementValue as Membership;
            replacementAssignments = await roleCollection.find({ subject: replacement.subject, organizationId: target.organizationId }, { session }).sort({ capability: 1 }).toArray();
            replacementRoles = validatedRoles(organizationType, input.replacement.roles);
            const replacementCurrentRoles = [...new Set(replacementAssignments.filter(value => value.assigned !== false).map(value => String(value.capability)))];
            if (!await authorizeMembershipChange(input.actorSubject, replacement, organizationType, input.companyId ?? null, [...new Set([...replacementCurrentRoles, ...replacementRoles])], session)) throw new InvitationRepositoryError('AUTHORITY_REVOKED');
            replacementStatus = input.replacement.status ?? replacement.status;
            if (replacementStatus === 'ACTIVE' && !organization.active) throw new InvitationRepositoryError('AUTHORITY_REVOKED');
          }
          const activeAssignments = await roleCollection.find({ organizationId: target.organizationId, capability: 'COMPANY_ADMIN', active: true }, { session }).toArray();
          const activeMemberships = await memberships.find({ organizationId: target.organizationId, status: 'ACTIVE' }).session(session).select({ subject: 1 }).lean().exec();
          const activeSubjects = new Set(activeMemberships.map(value => String(value.subject)));
          const beforeAdmins = new Set(activeAssignments.map(value => String(value.subject)).filter(subject => activeSubjects.has(subject)));
          const afterAdmins = new Set(beforeAdmins);
          const applyAdminOutcome = (membership: Membership, roles: readonly LocalRole[], status: 'ACTIVE' | 'INACTIVE') => {
            afterAdmins.delete(membership.subject);
            if (status === 'ACTIVE' && roles.includes('COMPANY_ADMIN')) afterAdmins.add(membership.subject);
          };
          applyAdminOutcome(target, targetRoles, targetStatus);
          if (replacement && replacementRoles && replacementStatus) applyAdminOutcome(replacement, replacementRoles, replacementStatus);
          const sameRoles = (left: readonly string[], right: readonly string[]) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
          const targetChanged = target.status !== targetStatus || !sameRoles(targetCurrentRoles, targetRoles);
          const replacementChanged = Boolean(replacement && replacementRoles && replacementStatus
            && (replacement.status !== replacementStatus || !sameRoles(replacementAssignments.filter(value => value.assigned !== false).map(value => String(value.capability)), replacementRoles)));
          if (!targetChanged && !replacementChanged) return { membership: target, roles: targetRoles,
            ...(replacement && replacementRoles ? { replacement: { membership: replacement, roles: replacementRoles } } : {}) };
          if (organizationType === 'COMPANY' && beforeAdmins.size > 0 && afterAdmins.size === 0) throw new InvitationRepositoryError('LAST_ADMINISTRATOR_REQUIRED');
          const fence = await connection.collection('organizations').updateOne({ id: target.organizationId, revision: organization.revision }, { $inc: { mutationFence: 1 } }, { session });
          if (fence.modifiedCount !== 1) throw new InvitationRepositoryError('VERSION_CONFLICT');
          const now = input.now;
          const saveAssignments = async (membership: Membership, assignments: Record<string, unknown>[], roles: readonly LocalRole[], status: 'ACTIVE' | 'INACTIVE') => {
            const byCapability = new Map(assignments.filter(value => value.assigned !== false).map(value => [String(value.capability), value]));
            for (const capability of roles) {
              const prior = byCapability.get(capability);
              const active = status === 'ACTIVE';
              if (prior) {
                if (Boolean(prior.active) !== active || prior.membershipId !== membership.id || prior.assigned === false) {
                  const result = await roleCollection.updateOne({ id: prior.id, revision: prior.revision }, { $set: { assigned: true, active, membershipId: membership.id, updatedAt: now }, $inc: { revision: 1 } }, { session });
                  if (result.modifiedCount !== 1) throw new InvitationRepositoryError('VERSION_CONFLICT');
                }
              } else {
                await roleCollection.insertOne({ id: new Types.ObjectId().toString(), subject: membership.subject, organizationId: membership.organizationId,
                  capability, assigned: true, active, revision: 1, updatedAt: now, membershipId: membership.id }, { session });
              }
            }
            for (const prior of assignments) {
              if (roles.includes(String(prior.capability) as LocalRole)) continue;
              if (prior.active || prior.assigned !== false) {
                const result = await roleCollection.updateOne({ id: prior.id, revision: prior.revision }, { $set: { active: false, assigned: false, updatedAt: now }, $inc: { revision: 1 } }, { session });
                if (result.modifiedCount !== 1) throw new InvitationRepositoryError('VERSION_CONFLICT');
              }
            }
          };
          const saveMembership = async (membership: Membership, expectedRevision: number, roles: readonly LocalRole[], status: 'ACTIVE' | 'INACTIVE', assignments: Record<string, unknown>[]) => {
            const priorRoles = [...new Set(assignments.filter(value => value.assigned !== false).map(value => String(value.capability)))].sort();
            const nextRoles = [...roles].sort();
            if (membership.status === status && JSON.stringify(priorRoles) === JSON.stringify(nextRoles)) return { membership, roles: [...roles] as LocalRole[] };
            const updated = { ...membership, status, revision: expectedRevision + 1 };
            const result = await memberships.updateOne({ id: membership.id, revision: expectedRevision }, { $set: updated }, { session, runValidators: true });
            if (result.modifiedCount !== 1) throw new InvitationRepositoryError('VERSION_CONFLICT');
            await saveAssignments(membership, assignments, roles, status);
            return { membership: updated, roles: [...roles] as LocalRole[] };
          };
          const changedTarget = await saveMembership(target, input.expectedRevision, targetRoles, targetStatus, targetAssignments);
          const changedReplacement = replacement && replacementRoles && replacementStatus
            ? await saveMembership(replacement, input.replacement!.expectedRevision, replacementRoles, replacementStatus, replacementAssignments) : undefined;
          if (changedTarget.membership === target && (!changedReplacement || changedReplacement.membership === replacement)) return { membership: target, roles: targetRoles, ...(changedReplacement ? { replacement: changedReplacement } : {}) };
          const synchronizeDriverRole = async (membership: Membership, beforeRoles: readonly LocalRole[], afterRoles: readonly LocalRole[]) => {
            if (beforeRoles.includes('DRIVER') === afterRoles.includes('DRIVER')) return;
            if (!input.driverProvisioning) throw new InvitationRepositoryError('STORAGE_UNAVAILABLE');
            await input.driverProvisioning.synchronizeRoles({ membership, beforeRoles, afterRoles, actorSubject: input.actorSubject, now }, session);
          };
          await synchronizeDriverRole(changedTarget.membership, targetCurrentRoles as LocalRole[], targetRoles);
          if (changedReplacement && replacement && replacementRoles) {
            await synchronizeDriverRole(changedReplacement.membership,
              replacementAssignments.filter(value => value.assigned !== false).map(value => String(value.capability) as LocalRole), replacementRoles);
          }
          const eventId = randomUUID();
          const audit = createMongoAuditWriter(connection, session);
          const recordMembershipAudit = async (before: Membership, after: Membership, actionId: string) => {
            await audit.record({ eventId: actionId, occurredAt: now.toISOString(), source: 'organizations', actor: { kind: 'user', subject: input.actorSubject },
              action: 'MEMBERSHIP_UPDATED', result: 'allowed', reason: 'ASSOCIATION', correlationId: actionId,
              scope: { companyId: organizationType === 'COMPANY' ? target.organizationId : null,
                thirdPartyId: organizationType === 'THIRD_PARTY' ? target.organizationId : null },
              resource: { type: 'organization-membership', id: before.id }, beforeVersion: String(before.revision), afterVersion: String(after.revision) });
          };
          await recordMembershipAudit(target, changedTarget.membership, eventId);
          if (changedReplacement && replacement) await recordMembershipAudit(replacement, changedReplacement.membership, randomUUID());
          await connection.collection('organization_membership_events').insertOne({ eventId, organizationId: target.organizationId, actorSubject: input.actorSubject,
            membershipId: target.id, action: 'MEMBERSHIP_UPDATED', at: now, beforeRevision: target.revision, revision: changedTarget.membership.revision,
            beforeRoles: targetCurrentRoles, afterRoles: targetRoles, beforeStatus: target.status, afterStatus: targetStatus,
            ...(changedReplacement ? { replacementMembershipId: changedReplacement.membership.id, replacementBeforeRevision: replacement!.revision,
              replacementRevision: changedReplacement.membership.revision } : {}) }, { session });
          return { ...changedTarget, ...(changedReplacement ? { replacement: changedReplacement } : {}) };
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true }, maxCommitTimeMS: 5000 });
      } catch (error) { return mapError(error, 'DUPLICATE_MEMBERSHIP'); }
    },
  };
}
