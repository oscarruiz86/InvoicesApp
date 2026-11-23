import { Schema, Types, type Connection, type ClientSession } from 'mongoose';
import type { PolicyConfirmation } from '@/modules/identity/application/policy-confirmation';
import { AuthorizationUnavailable } from '@/modules/identity/application/authorization-errors';
import { AuthorizationError } from '@/modules/identity/application/authentication-error';
import type { CompanyRepository, CompanyTransaction, Administrator } from '../../application/company-ports';
import { CompanyError, companyProfile, type CompanyRecord } from '../../domain/company';
import { organizationEvidence, type Organization, type OrganizationAssociation } from '../../domain/organization';
import { organizationModels } from './organization-repository';
import { requireCompanyStorage } from './company-readiness';

const optional = (maxlength: number) => ({ type: String, default: null, maxlength });
const schema = new Schema({
  documentType: { type: String, required: true, enum: ['NIT', 'CC'] }, documentNumber: { type: String, required: true, match: /^\d{1,20}$/ },
  verificationDigit: optional(1), businessName: { type: String, required: true, maxlength: 256 }, tradeName: optional(256),
  email: { type: String, required: true, maxlength: 254 }, phone: optional(32), address: optional(256), country: optional(2), department: optional(2), city: optional(5),
  status: { type: String, required: true, enum: ['ACTIVE', 'INACTIVE'] }, createdAt: { type: Date, required: true }, updatedAt: { type: Date, required: true },
  createdBy: { type: String, required: true }, updatedBy: { type: String, default: null }, revision: { type: Number, required: true, min: 1 },
  businessNameSearch: { type: String, required: true }, tradeNameSearch: { type: String, default: null },
}, { strict: 'throw', versionKey: false, collection: 'companies' });
schema.index({ documentType: 1, documentNumber: 1 }, { unique: true });
schema.index({ status: 1, businessNameSearch: 1, _id: 1 });
schema.index({ documentNumber: 1, _id: 1 });
schema.index({ businessNameSearch: 1, _id: 1 });
schema.index({ tradeNameSearch: 1, _id: 1 });
schema.index({ createdAt: -1, _id: 1 });
export const companyModel = (connection: Connection) => connection.models.Company ?? connection.model('Company', schema);

function decode(raw: Record<string, unknown>): CompanyRecord {
  const profileInput = Object.fromEntries(['documentType', 'documentNumber', 'verificationDigit', 'businessName', 'tradeName', 'email', 'phone', 'address', 'country', 'department', 'city'].map(key => [key, raw[key]]));
  if (!Number.isSafeInteger(raw.revision) || Number(raw.revision) < 1 || !['ACTIVE', 'INACTIVE'].includes(String(raw.status)) || typeof raw.createdBy !== 'string') throw new CompanyError('COMPANY_STORAGE_UNAVAILABLE');
  return { company: { ...companyProfile(profileInput, undefined, true), id: String(raw._id), status: raw.status as 'ACTIVE' | 'INACTIVE', createdAt: new Date(raw.createdAt as string).toISOString(), updatedAt: new Date(raw.updatedAt as string).toISOString(), createdBy: raw.createdBy, updatedBy: raw.updatedBy as string | null }, version: String(raw.revision) };
}
function administrator(raw: Record<string, unknown>): Administrator {
  if (raw.capability !== 'COMPANY_ADMIN' || typeof raw.subject !== 'string' || typeof raw.active !== 'boolean' || !Number.isSafeInteger(raw.revision)) throw new CompanyError('COMPANY_STORAGE_UNAVAILABLE');
  return { associationId: String(raw.id), subject: raw.subject, active: raw.active, capability: 'COMPANY_ADMIN', version: String(raw.revision) };
}

export function createCompanyRepository(connect: () => Promise<Connection>, policyFactory: (connection: Connection, session: ClientSession) => PolicyConfirmation): CompanyRepository {
  let initialized: Promise<void> | undefined;
  return {
    nextId: () => new Types.ObjectId().toString(),
    async run(write, action) {
      const connection = await connect();
      try {
        await requireCompanyStorage(connection);
        const companies = companyModel(connection); const models = organizationModels(connection);
        const events = connection.collection('company_management_events');
        if (!initialized) initialized = (async () => {
          await companies.init();
          await Promise.all(Object.values(models).map(model => model.init()));
          await events.createIndex({ eventId: 1 }, { unique: true });
          await events.createIndex({ companyId: 1, at: 1, eventId: 1 });
        })().catch(error => { initialized = undefined; throw error; });
        await initialized;
        let attempts = 0;
        return await connection.transaction(async session => {
          if (++attempts > 3) throw new CompanyError('COMPANY_STORAGE_UNAVAILABLE');
          const policy = policyFactory(connection, session);
          const organizations = connection.collection('organizations'); const associations = connection.collection('organization_associations');
          const tx: CompanyTransaction = {
            policy: () => policy.read(),
            async evidence(subject, scope) {
              if (scope.kind !== 'organization') return undefined;
              const organization = await organizations.findOne({ id: scope.companyId, type: 'COMPANY' }, { session });
              const values = await associations.find({ subject, organizationId: scope.companyId }, { session }).toArray();
              if (values.some(value => value.capability !== 'COMPANY_ADMIN')) throw new AuthorizationUnavailable();
              return organizationEvidence(subject, scope, organization ? [organization as unknown as Organization] : [], values as unknown as OrganizationAssociation[], null);
            },
            async coordinate(subject, scope, version) {
              await policy.confirm(version);
              if (scope.kind === 'organization') {
                const organization = await organizations.updateOne({ id: scope.companyId, type: 'COMPANY', active: true }, { $inc: { mutationFence: 1 } }, { session });
                const association = await associations.updateOne({ subject, organizationId: scope.companyId, capability: 'COMPANY_ADMIN', active: true }, { $inc: { mutationFence: 1 } }, { session });
                if (organization.modifiedCount !== 1 || association.modifiedCount !== 1) throw new AuthorizationError();
              }
            },
            async find(id, scope) {
              if (scope.kind === 'organization' && scope.companyId !== id) return null;
              const raw = await companies.findById(id).session(session).lean().exec();
              return raw ? decode(raw as Record<string, unknown>) : null;
            },
            async list(scope, query) {
              const filter: Record<string, unknown> = scope.kind === 'organization' ? { _id: new Types.ObjectId(scope.companyId!) } : {};
              for (const key of ['status', 'documentType', 'country', 'department', 'city'] as const) if (query[key]) filter[key] = query[key];
              if (query.q) {
                const prefix = '^' + query.q.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                filter.$or = ['documentNumber', 'businessNameSearch', 'tradeNameSearch'].map(key => ({ [key]: { $regex: prefix } }));
              }
              const sort = query.sort === 'businessName' ? 'businessNameSearch' : query.sort;
              const rows = await companies.find(filter).sort({ [sort]: query.direction === 'asc' ? 1 : -1, _id: 1 }).skip((query.page - 1) * query.pageSize).limit(query.pageSize).session(session).lean().exec();
              const total = await companies.countDocuments(filter).session(session).exec();
              return { items: rows.map(row => decode(row as Record<string, unknown>)), total };
            },
            async save(company, expectedVersion) {
              if (!write) throw new CompanyError('COMPANY_STORAGE_UNAVAILABLE');
              const { id, ...profile } = company; const revision = Number(expectedVersion ?? '0') + 1;
              const data = { ...profile, createdAt: new Date(profile.createdAt), updatedAt: new Date(profile.updatedAt), revision, businessNameSearch: profile.businessName.toLowerCase(), tradeNameSearch: profile.tradeName?.toLowerCase() ?? null };
              if (expectedVersion === null) await companies.create([{ _id: new Types.ObjectId(id), ...data }], { session });
              else {
                const result = await companies.updateOne({ _id: id, revision: Number(expectedVersion) }, { $set: data }, { session, runValidators: true });
                if (result.modifiedCount !== 1) throw new CompanyError('COMPANY_VERSION_CONFLICT');
              }
              const projection = { name: company.businessName, active: company.status === 'ACTIVE', updatedAt: new Date(company.updatedAt) };
              if (expectedVersion === null) await models.organizations.create([{ id, type: 'COMPANY', ...projection, revision: 1 }], { session });
              else {
                const result = await organizations.updateOne({ id, type: 'COMPANY' }, { $set: projection, $inc: { revision: 1 } }, { session });
                if (result.modifiedCount !== 1) throw new CompanyError('COMPANY_STORAGE_UNAVAILABLE');
              }
              return { company, version: String(revision) };
            },
            async administrators(id, page, pageSize, active) {
              const filter = { organizationId: id, capability: 'COMPANY_ADMIN', ...(active === undefined ? {} : { active }) };
              const rows = await associations.find(filter, { session }).sort({ subject: 1, id: 1 }).skip((page - 1) * pageSize).limit(pageSize).toArray();
              return { items: rows.map(administrator), total: await associations.countDocuments(filter, { session }) };
            },
            async record(event) {
              if (!write) throw new CompanyError('COMPANY_STORAGE_UNAVAILABLE');
              const before = event.before as unknown as Record<string, unknown> | null; const after = event.after as unknown as Record<string, unknown>;
              const changedFields = Object.keys(after).filter(key => JSON.stringify(before?.[key]) !== JSON.stringify(after[key]));
              await events.insertOne({ ...event, changedFields, delivered: false }, { session });
            },
          };
          return action(tx);
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true }, maxCommitTimeMS: 5000 });
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 11000) throw new CompanyError('COMPANY_DOCUMENT_CONFLICT');
        if (error instanceof Error && ['CompanyError', 'AuthorizationError', 'ResourceNotFound', 'AuthorizationUnavailable', 'AdministratorDirectoryUnavailable', 'ConfigurationError'].includes(error.constructor.name)) throw error;
        throw new CompanyError('COMPANY_STORAGE_UNAVAILABLE');
      }
    },
  };
}
