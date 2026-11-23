import { checkPermission } from '@/modules/identity/domain/authorization-policy';
import { AuthorizationError } from '@/modules/identity/application/authentication-error';
import { ResourceNotFound } from '@/modules/identity/application/authorization-errors';
import type { SecurityAudit } from '@/modules/identity/application/authorization-ports';
import type { Permission } from '@/modules/identity/domain/permissions';
import { companyId, companyProfile, CompanyError, type Company, type CompanyRecord } from '../domain/company';
import type { CompanyAccess, CompanyEvent, CompanyQuery, CompanyRepository, CompanyTransaction } from './company-ports';

export function createCompanies(deps: { repository: CompanyRepository; audit: SecurityAudit; now(): Date; nextEventId(): string; validateLocation?(input: { country: string | null; department: string | null; city: string | null }): Promise<boolean> }) {
  async function validateLocation(profile: Pick<Company, 'country' | 'department' | 'city'>) {
    if (deps.validateLocation && !await deps.validateLocation(profile)) throw new CompanyError('INVALID_REQUEST', ['country', 'department', 'city']);
  }
  async function run<T>(access: CompanyAccess, permissions: Permission[], write: boolean, action: (tx: CompanyTransaction) => Promise<T>) {
    try {
      return await deps.repository.run(write, async tx => {
        const { actor, scope } = access;
        if (scope.kind === 'self' || scope.thirdPartyId || (scope.kind === 'organization' && !scope.companyId)) throw new CompanyError('INVALID_REQUEST');
        const policy = await tx.policy(); const evidence = await tx.evidence(actor.subject, scope);
        for (const permission of permissions) if (!checkPermission(actor, policy, permission, scope, evidence).allowed) throw new AuthorizationError();
        if (write) await tx.coordinate(actor.subject, scope, policy.version);
        return action(tx);
      });
    } catch (error) {
      if (error instanceof AuthorizationError || error instanceof ResourceNotFound) {
        try { await deps.audit.record({ eventId: deps.nextEventId(), correlationId: deps.nextEventId(), at: deps.now().toISOString(), subject: access.actor.subject, action: 'ACCESS_DENIED', result: 'denied', reason: error instanceof ResourceNotFound ? 'RESOURCE' : 'PERMISSION', suppressed: 0 }); } catch { /* Denial remains closed. */ }
      }
      throw error;
    }
  }
  async function find(tx: CompanyTransaction, access: CompanyAccess, id: string, expectedVersion?: string) {
    companyId(id);
    const current = await tx.find(id, access.scope);
    if (!current) throw new ResourceNotFound();
    if (expectedVersion !== undefined && current.version !== expectedVersion) throw new CompanyError('COMPANY_VERSION_CONFLICT');
    return current;
  }
  function event(access: CompanyAccess, companyId: string, action: CompanyEvent['action'], before: CompanyEvent['before'], after: CompanyEvent['after'], beforeVersion: string | null, afterVersion: string, eventId: string): CompanyEvent {
    return { eventId, correlationId: eventId, at: deps.now().toISOString(), subject: access.actor.subject, companyId, scope: access.scope, action, result: 'allowed', before, after, beforeVersion, afterVersion };
  }
  async function save(tx: CompanyTransaction, access: CompanyAccess, before: CompanyRecord, company: Company, action: CompanyEvent['action'], eventId: string) {
    if (JSON.stringify(before.company) === JSON.stringify(company)) return before;
    const next = await tx.save({ ...company, updatedAt: deps.now().toISOString(), updatedBy: access.actor.subject }, before.version);
    await tx.record(event(access, company.id, action, before.company, next.company, before.version, next.version, eventId));
    return next;
  }
  return {
    create(access: CompanyAccess, input: Record<string, unknown>) {
      const profile = companyProfile(input); const id = deps.repository.nextId(); const eventId = deps.nextEventId();
      return run(access, ['companies:create'], true, async tx => {
        if (access.scope.kind !== 'global' || !access.actor.roles.includes('APP_ADMIN')) throw new AuthorizationError();
        await validateLocation(profile);
        const at = deps.now().toISOString();
        const next = await tx.save({ ...profile, id, status: 'ACTIVE', createdAt: at, updatedAt: at, createdBy: access.actor.subject, updatedBy: null }, null);
        await tx.record(event(access, id, 'COMPANY_CREATED', null, next.company, null, next.version, eventId));
        return next;
      });
    },
    list: (access: CompanyAccess, query: CompanyQuery) => run(access, ['companies:read'], false, async tx => ({ ...await tx.list(access.scope, query), page: query.page, pageSize: query.pageSize })),
    get: (access: CompanyAccess, id: string) => run(access, ['companies:read'], false, tx => find(tx, access, id)),
    update(access: CompanyAccess, id: string, expectedVersion: string, input: Record<string, unknown>) {
      const eventId = deps.nextEventId();
      return run(access, ['companies:update'], true, async tx => {
        const before = await find(tx, access, id, expectedVersion);
        const updated = { ...before.company, ...companyProfile(input, before.company) };
        await validateLocation(updated);
        return save(tx, access, before, updated, 'COMPANY_UPDATED', eventId);
      });
    },
    setStatus(access: CompanyAccess, id: string, expectedVersion: string, status: 'ACTIVE' | 'INACTIVE') {
      const eventId = deps.nextEventId();
      return run(access, ['companies:deactivate'], true, async tx => {
        if (access.scope.kind !== 'global' || !access.actor.roles.includes('APP_ADMIN')) throw new AuthorizationError();
        const before = await find(tx, access, id, expectedVersion);
        return save(tx, access, before, { ...before.company, status }, status === 'ACTIVE' ? 'COMPANY_ACTIVATED' : 'COMPANY_DEACTIVATED', eventId);
      });
    },
    administrators: (access: CompanyAccess, id: string, page: number, pageSize: number, active?: boolean) => run(access, ['companies:read', 'associations:read'], false, async tx => {
      const company = await find(tx, access, id);
      return { ...await tx.administrators(id, page, pageSize, active), page, pageSize, companyVersion: company.version };
    }),
  };
}
export type Companies = ReturnType<typeof createCompanies>;
