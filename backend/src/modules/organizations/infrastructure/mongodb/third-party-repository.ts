import { Schema, Types, type Connection, type ClientSession } from 'mongoose';
import type { PolicyConfirmation } from '@/modules/identity/application/policy-confirmation';
import { AuthorizationUnavailable } from '@/modules/identity/application/authorization-errors';
import { AuthorizationError } from '@/modules/identity/application/authentication-error';
import type { ThirdPartyRepository, ThirdPartyTransaction } from '../../application/third-party-ports';
import { ThirdPartyError, thirdPartyProfile, type ThirdParty, type ThirdPartyRecord, type ThirdPartyRelationship } from '../../domain/third-party';
import { organizationEvidence, type Organization, type OrganizationAssociation, type OrganizationRelationship } from '../../domain/organization';
import { organizationModels } from './organization-repository';
import { prepareThirdPartyRelationships, requireThirdPartyStorage } from './third-party-readiness';

const optional = (maxlength: number) => ({ type: String, default: null, maxlength });
const schema = new Schema({
  documentType: { type: String, required: true, enum: ['NIT'] }, documentNumber: { type: String, required: true, match: /^\d{1,20}$/ },
  verificationDigit: optional(1), businessName: { type: String, required: true, maxlength: 256 }, tradeName: optional(256),
  email: { type: String, required: true, maxlength: 254 }, phone: optional(32), address: optional(256), country: optional(128), department: optional(128), city: optional(128),
  status: { type: String, required: true, enum: ['ACTIVE', 'INACTIVE'] }, createdAt: { type: Date, required: true }, updatedAt: { type: Date, required: true },
  createdBy: { type: String, required: true, maxlength: 128 }, updatedBy: { type: String, default: null, maxlength: 128 }, revision: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  businessNameSearch: { type: String, required: true }, tradeNameSearch: { type: String, default: null },
}, { strict: 'throw', versionKey: false, collection: 'third_parties' });
schema.index({ documentType: 1, documentNumber: 1 }, { unique: true });
schema.index({ status: 1, businessNameSearch: 1, _id: 1 });
schema.index({ documentNumber: 1, _id: 1 });
schema.index({ businessNameSearch: 1, _id: 1 });
schema.index({ tradeNameSearch: 1, _id: 1 });
schema.index({ createdAt: -1, _id: 1 });
export const thirdPartyModel = (connection: Connection) => connection.models.ThirdParty ?? connection.model('ThirdParty', schema);

function decodeRelationship(raw: Record<string, unknown>): ThirdPartyRelationship & { version: string } {
  if (typeof raw.companyId !== 'string' || typeof raw.thirdPartyId !== 'string' || typeof raw.active !== 'boolean'
    || !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 1 || !raw.updatedAt) throw new ThirdPartyError('THIRD_PARTY_STORAGE_UNAVAILABLE');
  return { companyId: raw.companyId, thirdPartyId: raw.thirdPartyId, status: raw.active ? 'ACTIVE' : 'INACTIVE', version: String(raw.revision),
    createdAt: raw.createdAt ? new Date(raw.createdAt as string).toISOString() : null, updatedAt: new Date(raw.updatedAt as string).toISOString(),
    createdBy: typeof raw.createdBy === 'string' ? raw.createdBy : null, updatedBy: typeof raw.updatedBy === 'string' ? raw.updatedBy : null };
}

function decode(raw: Record<string, unknown>, relationship: (ThirdPartyRelationship & { version: string }) | null = null): ThirdPartyRecord {
  const profileInput = Object.fromEntries(['documentType', 'documentNumber', 'verificationDigit', 'businessName', 'tradeName', 'email', 'phone', 'address', 'country', 'department', 'city'].map(key => [key, raw[key]]));
  if (!Number.isSafeInteger(raw.revision) || Number(raw.revision) < 1 || !['ACTIVE', 'INACTIVE'].includes(String(raw.status)) || typeof raw.createdBy !== 'string') throw new ThirdPartyError('THIRD_PARTY_STORAGE_UNAVAILABLE');
  const thirdParty: ThirdParty = { ...thirdPartyProfile(profileInput), id: String(raw._id), status: raw.status as 'ACTIVE' | 'INACTIVE',
    createdAt: new Date(raw.createdAt as string).toISOString(), updatedAt: new Date(raw.updatedAt as string).toISOString(),
    createdBy: raw.createdBy, updatedBy: typeof raw.updatedBy === 'string' ? raw.updatedBy : null };
  return { thirdParty, version: String(raw.revision), relationship };
}

export function createThirdPartyRepository(connect: () => Promise<Connection>, policyFactory: (connection: Connection, session: ClientSession) => PolicyConfirmation): ThirdPartyRepository {
  let initialized: Promise<void> | undefined;
  return {
    nextId: () => new Types.ObjectId().toString(),
    async run(write, action) {
      const connection = await connect();
      try {
        await requireThirdPartyStorage(connection);
        const thirdParties = thirdPartyModel(connection); const models = organizationModels(connection);
        const events = connection.collection('third_party_management_events');
        if (!initialized) initialized = (async () => {
          await prepareThirdPartyRelationships(connection);
          await thirdParties.init();
          await Promise.all(Object.values(models).map(model => model.init()));
          await events.createIndex({ eventId: 1 }, { unique: true });
          await events.createIndex({ thirdPartyId: 1, at: 1, eventId: 1 });
        })().catch(error => { initialized = undefined; throw error; });
        await initialized;
        let attempts = 0;
        return await connection.transaction(async session => {
          if (++attempts > 3) throw new ThirdPartyError('THIRD_PARTY_STORAGE_UNAVAILABLE');
          const policy = policyFactory(connection, session);
          const organizations = connection.collection('organizations'); const associations = connection.collection('organization_associations');
          const relationships = connection.collection('company_third_party_relations'); const memberships = connection.collection('organization_memberships');
          const tx: ThirdPartyTransaction = {
            policy: () => policy.read(),
            async evidence(subject, scope) {
              if (scope.kind !== 'organization') return undefined;
              const ids = [scope.companyId, scope.thirdPartyId].filter((value): value is string => Boolean(value));
              const orgs = await organizations.find({ id: { $in: ids } }, { session }).toArray();
              const rawAssociations = await associations.find({ subject, organizationId: { $in: ids } }, { session }).toArray();
              const membershipIds = rawAssociations.map(value => value.membershipId).filter((value): value is string => typeof value === 'string');
              const activeMemberships = membershipIds.length ? await memberships.find({ id: { $in: membershipIds }, subject, status: 'ACTIVE' }, { session }).toArray() : [];
              const safeAssociations = rawAssociations.filter(value => value.active === true && value.assigned !== false
                && activeMemberships.some(membership => membership.id === value.membershipId && membership.organizationId === value.organizationId)) as unknown as OrganizationAssociation[];
              const relationRaw = scope.companyId && scope.thirdPartyId ? await relationships.findOne({ companyId: scope.companyId, thirdPartyId: scope.thirdPartyId }, { session }) : null;
              const relation = relationRaw ? { companyId: String(relationRaw.companyId), thirdPartyId: String(relationRaw.thirdPartyId), active: relationRaw.active === true, revision: Number(relationRaw.revision) } as OrganizationRelationship : null;
              if (relationRaw && (!Number.isSafeInteger(relation!.revision) || relation!.revision < 1)) throw new AuthorizationUnavailable();
              return organizationEvidence(subject, scope, orgs as unknown as Organization[], safeAssociations, relation);
            },
            async coordinate(subject, scope, policyVersion, targetId, requireRelationship) {
              await policy.confirm(policyVersion);
              if (scope.kind === 'global') return;
              const organizationId = scope.companyId ?? scope.thirdPartyId;
              const organizationType = scope.companyId ? 'COMPANY' : 'THIRD_PARTY';
              const capability = scope.companyId ? 'COMPANY_ADMIN' : 'THIRD_PARTY_ADMIN';
              const organization = await organizations.findOne({ id: organizationId, type: organizationType, active: true }, { session });
              const association = await associations.findOne({ subject, organizationId, capability, active: true, assigned: { $ne: false } }, { session });
              if (!organization || !association || typeof association.membershipId !== 'string') throw new AuthorizationError();
              const membership = await memberships.findOne({ id: association.membershipId, subject, organizationId, status: 'ACTIVE' }, { session });
              if (!membership) throw new AuthorizationError();
              const organizationFence = await organizations.updateOne({ id: organizationId, type: organizationType, active: true, revision: organization.revision }, { $inc: { mutationFence: 1 } }, { session });
              const associationFence = await associations.updateOne({ id: association.id, active: true, revision: association.revision }, { $inc: { mutationFence: 1 } }, { session });
              const membershipFence = await memberships.updateOne({ id: membership.id, status: 'ACTIVE', revision: membership.revision }, { $inc: { mutationFence: 1 } }, { session });
              if (organizationFence.modifiedCount !== 1 || associationFence.modifiedCount !== 1 || membershipFence.modifiedCount !== 1) throw new AuthorizationError();
              if (requireRelationship && targetId) {
                const relationFence = await relationships.updateOne({ companyId: scope.companyId, thirdPartyId: targetId, active: true }, { $inc: { mutationFence: 1 } }, { session });
                if (relationFence.modifiedCount !== 1) throw new AuthorizationError();
              }
            },
            async find(id, scope) {
              let relation = null;
              if (scope.kind === 'organization' && scope.companyId) {
                const rawRelation = await relationships.findOne({ companyId: scope.companyId, thirdPartyId: id }, { session });
                if (!rawRelation) return null;
                relation = decodeRelationship(rawRelation as Record<string, unknown>);
              } else if (scope.kind === 'organization' && scope.thirdPartyId !== id) return null;
              const raw = await thirdParties.findById(id).session(session).lean().exec();
              return raw ? decode(raw as Record<string, unknown>, relation) : null;
            },
            async list(scope, query) {
              const filter: Record<string, unknown> = {};
              if (scope.kind === 'organization' && scope.companyId) {
                const linked = await relationships.find({ companyId: scope.companyId, ...(query.relationshipActiveOnly ? { active: true } : {}) }, { projection: { thirdPartyId: 1, _id: 0 }, session }).toArray();
                const ids = linked.map(value => value.thirdPartyId).filter((value): value is string => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value));
                if (!ids.length) return { items: [], total: 0 };
                filter._id = { $in: ids.map(value => new Types.ObjectId(value)) };
              } else if (scope.kind === 'organization' && scope.thirdPartyId) filter._id = new Types.ObjectId(scope.thirdPartyId);
              for (const key of ['status', 'documentType', 'country', 'department', 'city'] as const) if (query[key]) filter[key] = query[key];
              if (query.q) {
                const prefix = '^' + query.q.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                filter.$or = ['documentNumber', 'businessNameSearch', 'tradeNameSearch'].map(key => ({ [key]: { $regex: prefix } }));
              }
              const sort = query.sort === 'businessName' ? 'businessNameSearch' : query.sort;
              const rows = await thirdParties.find(filter).sort({ [sort]: query.direction === 'asc' ? 1 : -1, _id: 1 }).skip((query.page - 1) * query.pageSize).limit(query.pageSize).session(session).lean().exec();
              const total = await thirdParties.countDocuments(filter).session(session).exec();
              const relationRows = scope.kind === 'organization' && scope.companyId && rows.length ? await relationships.find({ companyId: scope.companyId, thirdPartyId: { $in: rows.map(value => String(value._id)) } }, { session }).toArray() : [];
              const relationById = new Map(relationRows.map(value => [String(value.thirdPartyId), decodeRelationship(value as Record<string, unknown>)]));
              return { items: rows.map(row => decode(row as Record<string, unknown>, relationById.get(String(row._id)) ?? null)), total };
            },
            async save(value, expectedVersion) {
              if (!write) throw new ThirdPartyError('THIRD_PARTY_STORAGE_UNAVAILABLE');
              const { id, ...profile } = value;
              const revision = Number(expectedVersion ?? '0') + 1;
              const data = { ...profile, createdAt: new Date(profile.createdAt), updatedAt: new Date(profile.updatedAt), revision,
                businessNameSearch: profile.businessName.toLowerCase(), tradeNameSearch: profile.tradeName?.toLowerCase() ?? null };
              if (expectedVersion === null) {
                await thirdParties.create([{ _id: new Types.ObjectId(id), ...data }], { session });
                await models.organizations.create([{ id, type: 'THIRD_PARTY', name: value.businessName, active: value.status === 'ACTIVE', revision: 1, updatedAt: new Date(value.updatedAt) }], { session });
              } else {
                const result = await thirdParties.updateOne({ _id: new Types.ObjectId(id), revision: Number(expectedVersion) }, { $set: data }, { session, runValidators: true });
                if (result.modifiedCount !== 1) throw new ThirdPartyError('THIRD_PARTY_VERSION_CONFLICT');
                const projection = await organizations.updateOne({ id, type: 'THIRD_PARTY' }, { $set: { name: value.businessName, active: value.status === 'ACTIVE', revision, updatedAt: new Date(value.updatedAt) } }, { session });
                if (projection.modifiedCount !== 1) throw new ThirdPartyError('THIRD_PARTY_STORAGE_UNAVAILABLE');
              }
              return { thirdParty: value, version: String(revision), relationship: null };
            },
            async relationship(companyId, thirdPartyId) {
              const raw = await relationships.findOne({ companyId, thirdPartyId }, { session });
              return raw ? decodeRelationship(raw as Record<string, unknown>) : null;
            },
            async saveRelationship(value, expectedVersion) {
              if (!write) throw new ThirdPartyError('THIRD_PARTY_STORAGE_UNAVAILABLE');
              const active = value.status === 'ACTIVE';
              if (expectedVersion === null) {
                await relationships.insertOne({ companyId: value.companyId, thirdPartyId: value.thirdPartyId, active, revision: 1,
                  createdAt: value.createdAt ? new Date(value.createdAt) : null, updatedAt: new Date(value.updatedAt), createdBy: value.createdBy, updatedBy: value.updatedBy, mutationFence: 0 }, { session });
                return { ...value, version: '1' };
              }
              const revision = Number(expectedVersion) + 1;
              const result = await relationships.updateOne({ companyId: value.companyId, thirdPartyId: value.thirdPartyId, revision: Number(expectedVersion) }, {
                $set: { active, updatedAt: new Date(value.updatedAt), updatedBy: value.updatedBy, revision }, $inc: { mutationFence: 1 },
              }, { session });
              if (result.modifiedCount !== 1) throw new ThirdPartyError('THIRD_PARTY_VERSION_CONFLICT');
              return { ...value, version: String(revision) };
            },
            async record(event) {
              if (!write) throw new ThirdPartyError('THIRD_PARTY_STORAGE_UNAVAILABLE');
              await events.insertOne({ ...event, delivered: false }, { session });
            },
          };
          return action(tx);
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true }, maxCommitTimeMS: 5000 });
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
          const keyPattern = 'keyPattern' in error && error.keyPattern && typeof error.keyPattern === 'object' ? error.keyPattern as Record<string, unknown> : {};
          throw new ThirdPartyError('documentType' in keyPattern || 'documentNumber' in keyPattern ? 'THIRD_PARTY_DOCUMENT_CONFLICT' : 'THIRD_PARTY_VERSION_CONFLICT');
        }
        if (error instanceof Error && ['ThirdPartyError', 'AuthorizationError', 'ResourceNotFound', 'AuthorizationUnavailable', 'ConfigurationError'].includes(error.constructor.name)) throw error;
        throw new ThirdPartyError('THIRD_PARTY_STORAGE_UNAVAILABLE');
      }
    },
  };
}
