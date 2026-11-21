import { effectivePolicy, isParameterKey, parameterCatalog, validateParameterValue, type EffectiveParameterPolicy, type ParameterKey } from '../domain/parameters';

export interface ParameterRow { readonly key: ParameterKey; readonly value: number; readonly version: number; readonly effectiveFrom: Date; readonly createdAt: Date; readonly createdBy: string; readonly updatedAt: Date; readonly updatedBy: string }
export interface ParameterEvent { readonly eventId: string; readonly correlationId: string; readonly key: ParameterKey; readonly actor: string; readonly at: Date; readonly previousValue: number; readonly value: number; readonly previousVersion: number; readonly version: number }
export interface ParameterRepository {
  list(input: { page: number; pageSize: number; q?: string }): Promise<{ items: readonly ParameterRow[]; total: number }>;
  find(key: ParameterKey): Promise<ParameterRow | null>;
  history(key: ParameterKey, page: number, pageSize: number): Promise<{ items: readonly ParameterEvent[]; total: number }>;
  update(input: { key: ParameterKey; expectedVersion: number; value: number; actor: string; correlationId: string }): Promise<ParameterRow>;
  readEffective(key: ParameterKey): Promise<ParameterRow | null>;
  confirm(input: { key: ParameterKey; revision: string; session: unknown }): Promise<void>;
  initialize(actor: string, correlationId: string): Promise<boolean>;
}
export class ParameterError extends Error { constructor(readonly code: 'INVALID_REQUEST'|'RESOURCE_NOT_FOUND'|'PARAMETER_VERSION_CONFLICT'|'PARAMETER_NOT_INITIALIZED'|'EDIT_POLICY_UNAVAILABLE'|'FORBIDDEN'|'STORAGE_UNAVAILABLE') { super(code); } }

export function createParameterUseCases(repository: ParameterRepository, clock: { now(): Date }, ids: { next(): string }) {
  return {
    async list(input: { page: number; pageSize: number; q?: string }) {
      if (!Number.isSafeInteger(input.page) || input.page < 1 || !Number.isSafeInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100 || (input.q !== undefined && input.q.length > 100)) throw new ParameterError('INVALID_REQUEST');
      const result = await repository.list(input);
      return { ...result, page: input.page, pageSize: input.pageSize, items: result.items.map(row => ({ ...parameterCatalog[row.key], ...row })) };
    },
    async detail(key: string) {
      if (!isParameterKey(key)) throw new ParameterError('RESOURCE_NOT_FOUND');
      const row = await repository.find(key);
      if (!row) throw new ParameterError('PARAMETER_NOT_INITIALIZED');
      return { ...parameterCatalog[key], ...row };
    },
    async history(key: string, page: number, pageSize: number) {
      if (!isParameterKey(key)) throw new ParameterError('RESOURCE_NOT_FOUND');
      if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new ParameterError('INVALID_REQUEST');
      if (!await repository.find(key)) throw new ParameterError('PARAMETER_NOT_INITIALIZED');
      return { ...(await repository.history(key, page, pageSize)), page, pageSize };
    },
    async update(input: { key: string; expectedVersion: number; value: unknown; actor: string }) {
      if (!isParameterKey(input.key) || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1 || !validateParameterValue(input.key, input.value)) throw new ParameterError('INVALID_REQUEST');
      const current = await repository.find(input.key);
      if (!current) throw new ParameterError('PARAMETER_NOT_INITIALIZED');
      if (current.version !== input.expectedVersion) throw new ParameterError('PARAMETER_VERSION_CONFLICT');
      if (current.value === input.value) return { ...parameterCatalog[input.key], ...current };
      return { ...parameterCatalog[input.key], ...await repository.update({ key: input.key, expectedVersion: input.expectedVersion, value: input.value, actor: input.actor, correlationId: ids.next() }) };
    },
    async readEffective(thirdPartyId: string): Promise<{ state: 'AVAILABLE'; policy: EffectiveParameterPolicy } | { state: 'UNAVAILABLE' }> {
      if (!thirdPartyId) return { state: 'UNAVAILABLE' };
      try {
        const row = await repository.readEffective('invoice.manual-edit-window-seconds');
        if (!row) return { state: 'UNAVAILABLE' };
        const policy = effectivePolicy({ key: row.key, value: row.value, version: row.version, effectiveFrom: row.effectiveFrom, now: clock.now() });
        return policy ? { state: 'AVAILABLE', policy } : { state: 'UNAVAILABLE' };
      } catch { return { state: 'UNAVAILABLE' }; }
    },
    async confirm(input: { thirdPartyId: string; revision: string; scope: string; transactionContext: unknown }) {
      if (!input.thirdPartyId || input.scope !== 'global' || !input.revision || !input.transactionContext) throw new ParameterError('EDIT_POLICY_UNAVAILABLE');
      await repository.confirm({ key: 'invoice.manual-edit-window-seconds', revision: input.revision, session: input.transactionContext });
    },
    initialize: (actor: string) => repository.initialize(actor, ids.next()),
  };
}
