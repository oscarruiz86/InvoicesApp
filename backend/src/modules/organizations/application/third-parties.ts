import { checkPermission } from '@/modules/identity/domain/authorization-policy';
import { AuthorizationError } from '@/modules/identity/application/authentication-error';
import { ResourceNotFound } from '@/modules/identity/application/authorization-errors';
import type { ThirdPartyAccess, ThirdPartyEvent, ThirdPartyQuery, ThirdPartyRepository, ThirdPartyTransaction } from './third-party-ports';
import { ThirdPartyError, thirdPartyId, thirdPartyProfile, type ThirdParty, type ThirdPartyRecord } from '../domain/third-party';

export function createThirdParties(deps: { repository: ThirdPartyRepository; now(): Date; nextEventId(): string }) {
  async function run<T>(access: ThirdPartyAccess, permissions: string[], write: boolean, action: (tx: ThirdPartyTransaction) => Promise<T>, options: { resourceId?: string; requireRelationship?: boolean } = {}) {
    return deps.repository.run(write, async tx => {
      const { actor, scope } = access;
      if (scope.kind === 'self' || (scope.kind === 'organization' && (!scope.companyId && !scope.thirdPartyId || scope.companyId && scope.thirdPartyId))) throw new ThirdPartyError('INVALID_REQUEST');
      const policy = await tx.policy(); const evidence = await tx.evidence(actor.subject, scope);
      for (const permission of permissions) if (!checkPermission(actor, policy, permission, scope, evidence).allowed) throw new AuthorizationError();
      if (write) await tx.coordinate(actor.subject, scope, policy.version, options.resourceId, options.requireRelationship ?? false);
      return action(tx);
    });
  }

  async function find(tx: ThirdPartyTransaction, access: ThirdPartyAccess, id: string, expectedVersion?: string) {
    thirdPartyId(id);
    const current = await tx.find(id, access.scope);
    if (!current) throw new ResourceNotFound();
    if (expectedVersion !== undefined && current.version !== expectedVersion) throw new ThirdPartyError('THIRD_PARTY_VERSION_CONFLICT');
    return current;
  }

  function event(access: ThirdPartyAccess, id: string, action: ThirdPartyEvent['action'], beforeVersion: string | null, afterVersion: string, changedFields: readonly string[], relatedCompanyId?: string) {
    const eventId = deps.nextEventId();
    return { eventId, correlationId: eventId, at: deps.now().toISOString(), subject: access.actor.subject,
      companyId: relatedCompanyId ?? (access.scope.kind === 'organization' ? access.scope.companyId : null), thirdPartyId: id, scope: access.scope,
      action, result: 'allowed', beforeVersion, afterVersion, changedFields } satisfies ThirdPartyEvent;
  }

  async function save(tx: ThirdPartyTransaction, access: ThirdPartyAccess, before: ThirdPartyRecord, value: ThirdParty, action: ThirdPartyEvent['action']) {
    const changedFields = Object.keys(value).filter(key => JSON.stringify((before.thirdParty as unknown as Record<string, unknown>)[key]) !== JSON.stringify((value as unknown as Record<string, unknown>)[key]));
    if (!changedFields.length) return before;
    const next = await tx.save({ ...value, updatedAt: deps.now().toISOString(), updatedBy: access.actor.subject }, before.version);
    await tx.record(event(access, value.id, action, before.version, next.version, changedFields));
    return { ...next, relationship: before.relationship };
  }

  function relationshipFor(access: ThirdPartyAccess, companyId?: string) {
    if (access.scope.kind === 'organization' && access.scope.companyId) {
      if (companyId && companyId !== access.scope.companyId) throw new AuthorizationError();
      return access.scope.companyId;
    }
    if (access.scope.kind === 'global' && access.actor.roles.includes('APP_ADMIN') && companyId) return companyId;
    throw new AuthorizationError();
  }

  async function setRelationship(access: ThirdPartyAccess, thirdPartyIdValue: string, companyIdValue: string, expectedVersion: string | null, status: 'ACTIVE' | 'INACTIVE') {
    const id = thirdPartyId(thirdPartyIdValue); const companyId = relationshipFor(access, companyIdValue);
    if (expectedVersion !== null && !/^[1-9]\d*$/.test(expectedVersion)) throw new ThirdPartyError('INVALID_REQUEST', ['expectedVersion']);
    const permission = status === 'ACTIVE' ? 'third-parties:create' : 'third-parties:deactivate';
    return run(access, [permission], true, async tx => {
      const thirdParty = await tx.find(id, { kind: 'global', companyId: null, thirdPartyId: null });
      if (!thirdParty) throw new ResourceNotFound();
      if (thirdParty.thirdParty.status !== 'ACTIVE') throw new ThirdPartyError('THIRD_PARTY_INACTIVE');
      const before = await tx.relationship(companyId, id);
      if (!before) {
        if (status !== 'ACTIVE' || expectedVersion !== null) throw new ResourceNotFound();
        const at = deps.now().toISOString();
        const created = await tx.saveRelationship({ companyId, thirdPartyId: id, status: 'ACTIVE', createdAt: at, updatedAt: at,
          createdBy: access.actor.subject, updatedBy: null }, null);
        await tx.record(event(access, id, 'RELATIONSHIP_ACTIVATED', null, created.version, ['relationship.status'], companyId));
        return { ...thirdParty, relationship: created };
      }
      if (expectedVersion !== null && before.version !== expectedVersion) throw new ThirdPartyError('THIRD_PARTY_VERSION_CONFLICT');
      if (before.status === status) return { ...thirdParty, relationship: before };
      if (expectedVersion === null) throw new ThirdPartyError('THIRD_PARTY_VERSION_CONFLICT');
      const at = deps.now().toISOString();
      const updated = await tx.saveRelationship({ ...before, status, updatedAt: at, updatedBy: access.actor.subject }, before.version);
      await tx.record(event(access, id, status === 'ACTIVE' ? 'RELATIONSHIP_ACTIVATED' : 'RELATIONSHIP_DEACTIVATED', before.version, updated.version, ['relationship.status'], companyId));
      return { ...thirdParty, relationship: updated };
    });
  }

  return {
    create(access: ThirdPartyAccess, input: Record<string, unknown>) {
      const profile = thirdPartyProfile(input); const id = deps.repository.nextId();
      return run(access, ['third-parties:create'], true, async tx => {
        const actor = access.actor;
        const globalCreate = access.scope.kind === 'global' && actor.roles.includes('APP_ADMIN');
        const companyCreate = access.scope.kind === 'organization' && Boolean(access.scope.companyId);
        if (!globalCreate && !companyCreate) throw new AuthorizationError();
        const at = deps.now().toISOString();
        const next = await tx.save({ ...profile, id, status: 'ACTIVE', createdAt: at, updatedAt: at, createdBy: actor.subject, updatedBy: null }, null);
        await tx.record(event(access, id, 'THIRD_PARTY_CREATED', null, next.version, Object.keys(profile)));
        if (companyCreate) {
          const companyId = access.scope.companyId!;
          const relation = await tx.saveRelationship({ companyId, thirdPartyId: id, status: 'ACTIVE', createdAt: at, updatedAt: at,
            createdBy: actor.subject, updatedBy: null }, null);
          await tx.record(event(access, id, 'RELATIONSHIP_ACTIVATED', null, relation.version, ['relationship.status']));
          return { ...next, relationship: relation };
        }
        return next;
      });
    },
    list: (access: ThirdPartyAccess, query: ThirdPartyQuery) => run(access, ['third-parties:read'], false, async tx => ({
      ...await tx.list(access.scope, query), page: query.page, pageSize: query.pageSize,
    })),
    get: (access: ThirdPartyAccess, id: string) => run(access, ['third-parties:read'], false, tx => find(tx, access, id)),
    update(access: ThirdPartyAccess, id: string, expectedVersion: string, input: Record<string, unknown>) {
      if (!/^[1-9]\d*$/.test(expectedVersion)) throw new ThirdPartyError('INVALID_REQUEST', ['expectedVersion']);
      const key = thirdPartyId(id);
      return run(access, ['third-parties:update'], true, async tx => {
        const before = await find(tx, access, key, expectedVersion);
        const changes = thirdPartyProfile(input, before.thirdParty);
        return save(tx, access, before, { ...before.thirdParty, ...changes }, 'THIRD_PARTY_UPDATED');
      }, { resourceId: key, requireRelationship: access.scope.kind === 'organization' && Boolean(access.scope.companyId) });
    },
    setStatus(access: ThirdPartyAccess, id: string, expectedVersion: string, status: 'ACTIVE' | 'INACTIVE') {
      if (access.scope.kind !== 'global' || !access.actor.roles.includes('APP_ADMIN')) throw new AuthorizationError();
      if (!/^[1-9]\d*$/.test(expectedVersion)) throw new ThirdPartyError('INVALID_REQUEST', ['expectedVersion']);
      const key = thirdPartyId(id);
      return run(access, ['third-parties:deactivate'], true, async tx => {
        const before = await find(tx, access, key, expectedVersion);
        return save(tx, access, before, { ...before.thirdParty, status }, status === 'ACTIVE' ? 'THIRD_PARTY_ACTIVATED' : 'THIRD_PARTY_DEACTIVATED');
      }, { resourceId: key });
    },
    setRelationship,
    getRelationship(access: ThirdPartyAccess, thirdPartyIdValue: string, companyIdValue: string) {
      const id = thirdPartyId(thirdPartyIdValue); const companyId = relationshipFor(access, companyIdValue);
      return run(access, ['third-parties:read'], false, async tx => {
        if (!await tx.find(id, access.scope)) throw new ResourceNotFound();
        return { relationship: await tx.relationship(companyId, id) };
      });
    },
    lookupForCompany(access: ThirdPartyAccess, companyId: string, query: Omit<ThirdPartyQuery, 'page' | 'pageSize' | 'sort' | 'direction'>) {
      const expectedCompany = relationshipFor(access, companyId);
      return run(access, ['third-parties:read'], false, async tx => tx.list({ kind: 'organization', companyId: expectedCompany, thirdPartyId: null }, {
        ...query, status: 'ACTIVE', relationshipActiveOnly: true, page: 1, pageSize: 50, sort: 'businessName', direction: 'asc',
      }));
    },
  };
}
export type ThirdParties = ReturnType<typeof createThirdParties>;
