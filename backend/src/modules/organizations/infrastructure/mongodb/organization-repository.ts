import { createHash } from 'node:crypto';
import { Schema, type Connection } from 'mongoose';
import { z } from 'zod';
import { AuthorizationUnavailable } from '@/modules/identity/application/authorization-errors';
import { validScope, type OrganizationScope } from '@/modules/identity/domain/authorization-facts';
import { compatibleCapability, organizationEvidence } from '../../domain/organization';
import type { OrganizationReader } from '../../application/context-ports';

const id = z.string().min(1).max(128).refine(value => value.trim().length > 0);
const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const organizationDto = z.object({ id, type: z.enum(['COMPANY', 'THIRD_PARTY']), name: z.string().trim().min(1).max(256), active: z.boolean(), revision });
const associationDto = z.object({ id, subject: z.string().min(1), organizationId: id, capability: z.enum(['COMPANY_ADMIN', 'THIRD_PARTY_ADMIN', 'DRIVER']), membershipId: id.nullable(), assigned: z.boolean().default(true), active: z.boolean(), revision });
const membershipDto = z.object({ id, subject: z.string().min(1), organizationId: id, status: z.enum(['ACTIVE', 'INACTIVE']), revision });
const relationshipDto = z.object({ companyId: id, thirdPartyId: id, active: z.boolean(), revision });
const identityField = { type: String, required: true, maxlength: 128, validate: (value: string) => value.trim().length > 0 };
const stateFields = { active: { type: Boolean, required: true }, revision: { type: Number, required: true, min: 1, validate: Number.isSafeInteger }, updatedAt: { type: Date, required: true } };
const organizationSchema = new Schema({ id: identityField, type: { type: String, enum: ['COMPANY', 'THIRD_PARTY'], required: true }, name: { type: String, trim: true, required: true, maxlength: 256 }, ...stateFields }, { strict: 'throw', versionKey: false, collection: 'organizations' });
organizationSchema.index({ id: 1 }, { unique: true });
const associationSchema = new Schema({ id: identityField, subject: { type: String, required: true }, organizationId: identityField,
  capability: { type: String, enum: ['COMPANY_ADMIN', 'THIRD_PARTY_ADMIN', 'DRIVER'], required: true }, membershipId: { type: String, default: null, maxlength: 128 }, assigned: { type: Boolean, default: true }, ...stateFields }, { strict: 'throw', versionKey: false, collection: 'organization_associations' });
associationSchema.index({ id: 1 }, { unique: true });
associationSchema.index({ subject: 1, organizationId: 1, capability: 1 }, { unique: true });
associationSchema.index({ subject: 1, active: 1, organizationId: 1 });
associationSchema.index({ membershipId: 1, active: 1 }, { sparse: true });
const relationshipSchema = new Schema({ companyId: identityField, thirdPartyId: identityField, ...stateFields }, { strict: 'throw', versionKey: false, collection: 'company_third_party_relations' });
relationshipSchema.index({ companyId: 1, thirdPartyId: 1 }, { unique: true });

/** Infrastructure-only model factory, also used by isolated fixtures. Runtime exposes reads only. */
export function organizationModels(connection: Connection) {
  return {
    organizations: connection.models.Organization ?? connection.model('Organization', organizationSchema),
    associations: connection.models.OrganizationAssociation ?? connection.model('OrganizationAssociation', associationSchema),
    relationships: connection.models.OrganizationRelationship ?? connection.model('OrganizationRelationship', relationshipSchema),
  };
}
export function createOrganizationRepository(connect: () => Promise<Connection>): OrganizationReader {
  async function safe<T>(work: () => Promise<T>): Promise<T> { try { return await work(); } catch { throw new AuthorizationUnavailable(); } }
  async function collect(subject: string, scope: OrganizationScope) {
    const connection = await connect();
    const models = organizationModels(connection);
    const selectedIds = [scope.companyId, scope.thirdPartyId].filter((value): value is string => value !== null);
    const associationQuery = scope.kind === 'self' ? { subject } : { subject, organizationId: { $in: selectedIds } };
    const rawAssociations = (await models.associations.find(associationQuery).sort({ id: 1 }).lean().exec()).map(value => associationDto.parse(value));
    const ids = scope.kind === 'self' ? [...new Set(rawAssociations.map(value => value.organizationId))] : selectedIds;
    const organizations = (await models.organizations.find({ id: { $in: ids } }).sort({ id: 1 }).lean().exec()).map(value => organizationDto.parse(value));
    const memberships = (await connection.collection('organization_memberships').find({ id: { $in: rawAssociations.map(value => value.membershipId).filter((value): value is string => value !== null) } }).sort({ id: 1 }).toArray()).map(value => membershipDto.parse(value));
    // Corrupt capability/type references fail closed instead of becoming grants.
    if (rawAssociations.some(association => !organizations.some(org => org.id === association.organizationId && compatibleCapability(org.type, association.capability)))) throw new AuthorizationUnavailable();
    if (rawAssociations.some(association => association.membershipId !== null && !memberships.some(membership => membership.id === association.membershipId
      && membership.subject === association.subject && membership.organizationId === association.organizationId))) throw new AuthorizationUnavailable();
    const associations = rawAssociations.map(association => ({ ...association, active: association.assigned && association.active && memberships.some(membership => membership.id === association.membershipId
      && membership.status === 'ACTIVE' && organizations.some(organization => organization.id === membership.organizationId && organization.active)) }));
    const rawRelation = scope.companyId && scope.thirdPartyId ? await models.relationships.findOne({ companyId: scope.companyId, thirdPartyId: scope.thirdPartyId }).lean().exec() : null;
    const relationship = rawRelation ? relationshipDto.parse(rawRelation) : null;
    return { organizations, memberships, associations, relationship };
  }
  return {
    candidates: subject => safe(async () => {
      const connection = await connect();
      const models = organizationModels(connection);
      const associations = (await models.associations.find({ subject, active: true, assigned: { $ne: false }, membershipId: { $ne: null } }).lean().exec()).map(value => associationDto.parse(value));
      const memberships = (await connection.collection('organization_memberships').find({ id: { $in: associations.map(value => value.membershipId) }, subject, status: 'ACTIVE' }).toArray()).map(value => membershipDto.parse(value));
      const active = associations.filter(association => memberships.some(membership => membership.id === association.membershipId && membership.organizationId === association.organizationId));
      const organizations = (await models.organizations.find({ id: { $in: active.map(a => a.organizationId) }, active: true }).sort({ id: 1 }).lean().exec()).map(value => organizationDto.parse(value));
      return organizations.filter(org => active.some(a => a.organizationId === org.id && compatibleCapability(org.type, a.capability)));
    }),
    find: organizationId => safe(async () => {
      const value = await organizationModels(await connect()).organizations.findOne({ id: organizationId }).lean().exec();
      return value ? organizationDto.parse(value) : null;
    }),
    read: (subject, scope) => safe(async () => {
      if (scope.kind === 'global' || !validScope(scope)) return null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const first = await collect(subject, scope);
        const second = await collect(subject, scope);
        // Ordered full facts also detect unsupported edits that forgot to bump revision.
        if (JSON.stringify(first) !== JSON.stringify(second)) continue;
        const evidence = organizationEvidence(subject, scope, second.organizations, second.associations, second.relationship);
        return { ...evidence, revision: createHash('sha256').update(JSON.stringify(second)).digest('hex') };
      }
      throw new AuthorizationUnavailable();
    }),
  };
}
