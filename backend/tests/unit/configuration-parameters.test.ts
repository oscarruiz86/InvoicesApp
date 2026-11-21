import { describe, expect, it } from 'vitest';
import { effectivePolicy, isParameterKey, parameterCatalog, validateParameterValue } from '@/modules/configuration/domain/parameters';
import { createParameterUseCases, ParameterError, type ParameterRepository, type ParameterRow } from '@/modules/configuration/application/parameters';

const key = 'invoice.manual-edit-window-seconds';
const row: ParameterRow = { key, value: 43200, version: 1, effectiveFrom: new Date('2026-11-21T00:00:00Z'), createdAt: new Date('2026-11-21T00:00:00Z'), createdBy: 'technical:init', updatedAt: new Date('2026-11-21T00:00:00Z'), updatedBy: 'technical:init' };
function repository(overrides: Partial<ParameterRepository> = {}): ParameterRepository {
  return { list: async () => ({ items: [row], total: 1 }), find: async () => row, history: async () => ({ items: [], total: 0 }),
    update: async input => ({ ...row, value: input.value, version: row.version + 1 }), readEffective: async () => row,
    confirm: async () => {}, initialize: async () => true, ...overrides };
}

describe('functional parameter catalog and contracts', () => {
  it('keeps only the approved initial key and metadata in code', () => {
    expect(Object.keys(parameterCatalog)).toEqual([key]);
    expect(parameterCatalog[key]).toMatchObject({ initialValue: 43200, minimum: 1, maximum: 31536000, scope: 'global', unit: 'seconds' });
    expect(isParameterKey('arbitrary')).toBe(false);
  });
  it.each([0, -1, 1.5, 31536001, Number.MAX_SAFE_INTEGER])('rejects non-catalog or out-of-range value %s', value => {
    expect(validateParameterValue(key, value)).toBe(false);
  });
  it('accepts integer boundaries and returns the current global revision only while effective', () => {
    expect(validateParameterValue(key, 1)).toBe(true); expect(validateParameterValue(key, 31536000)).toBe(true);
    expect(effectivePolicy({ key, value: 43200, version: 3, effectiveFrom: row.effectiveFrom, now: new Date('2026-11-22T00:00:00Z') })).toMatchObject({ revision: '3', scope: 'global', durationSeconds: 43200, validUntil: null });
    expect(effectivePolicy({ key, value: 43200, version: 3, effectiveFrom: row.effectiveFrom, now: new Date('2026-11-20T00:00:00Z') })).toBeNull();
    expect(effectivePolicy({ key, value: 0, version: 3, effectiveFrom: row.effectiveFrom, now: new Date('2026-11-22T00:00:00Z') })).toBeNull();
  });
  it('reports unavailable for missing configuration and does not require an administrative permission in the consumer contract', async () => {
    const useCases = createParameterUseCases(repository({ readEffective: async () => null }), { now: () => new Date('2026-11-22T00:00:00Z') }, { next: () => 'event-1' });
    expect(await useCases.readEffective('0123456789abcdef01234567')).toEqual({ state: 'UNAVAILABLE' });
    const invalid = createParameterUseCases(repository({ readEffective: async () => ({ ...row, value: 0 }) }), { now: () => new Date('2026-11-22T00:00:00Z') }, { next: () => 'event-1' });
    expect(await invalid.readEffective('0123456789abcdef01234567')).toEqual({ state: 'UNAVAILABLE' });
    expect(await useCases.readEffective('0123456789abcdef01234567')).toEqual({ state: 'UNAVAILABLE' });
  });
  it('enforces versioned updates and preserves no-op behavior', async () => {
    const useCases = createParameterUseCases(repository(), { now: () => new Date() }, { next: () => 'event-1' });
    await expect(useCases.update({ key, expectedVersion: 2, value: 50000, actor: 'u' })).rejects.toMatchObject({ code: 'PARAMETER_VERSION_CONFLICT' });
    await expect(useCases.update({ key, expectedVersion: 1, value: 0, actor: 'u' })).rejects.toBeInstanceOf(ParameterError);
    expect((await useCases.update({ key, expectedVersion: 1, value: 43200, actor: 'u' })).version).toBe(1);
  });
});
