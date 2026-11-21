import { describe, expect, it, vi } from 'vitest';
import { createHttpParameters } from '@/modules/parameter-management/infrastructure/http-parameters';

const record = { key: 'invoice.manual-edit-window-seconds', name: 'Ventana manual', description: 'Duración', type: 'integer', unit: 'seconds', minimum: 1, maximum: 31536000, scope: 'global', value: 43200, version: 1, effectiveFrom: '2026-11-21T00:00:00.000Z', createdAt: '2026-11-21T00:00:00.000Z', createdBy: 'tech', updatedAt: '2026-11-21T00:00:00.000Z', updatedBy: 'tech' } as const;
describe('parameter HTTP adapter', () => {
  it('uses global scope and validates paginated versioned contracts', async () => {
    const parameter = vi.fn(async (_method: string, _path: string, _query: string, _body?: unknown, _signal?: AbortSignal): Promise<unknown> => ({ items: [record], total: 1, page: 1, pageSize: 100 }));
    const api = createHttpParameters({ parameter });
    expect(await api.list()).toEqual([record]);
    expect(parameter).toHaveBeenCalledWith('GET', 'parameters', 'scope=global&page=1&pageSize=100', undefined, undefined);
    parameter.mockResolvedValueOnce(record);
    expect(await api.update(record.key, 1, 21600)).toEqual(record);
    expect(parameter).toHaveBeenLastCalledWith('PATCH', `parameters/${record.key}`, 'scope=global', { expectedVersion: 1, value: 21600 }, undefined);
  });
  it('rejects unexpected response fields and keeps cancellation attached to transport', async () => {
    const controller = new AbortController();
    const parameter = vi.fn(async (_method: string, _path: string, _query: string, _body?: unknown, signal?: AbortSignal): Promise<unknown> => { expect(signal).toBe(controller.signal); return { items: [{ ...record, secret: 'unexpected' }], total: 1, page: 1, pageSize: 100 }; });
    const api = createHttpParameters({ parameter });
    await expect(api.list(controller.signal)).rejects.toMatchObject({ businessCode: 'INVALID_RESPONSE' });
  });
  it('validates parameter history payloads', async () => {
    const parameter = vi.fn(async (): Promise<unknown> => ({ items: [{ eventId: 'e1', correlationId: 'c1', key: record.key, actor: 'admin', at: '2026-11-21T00:00:00.000Z', previousValue: 43200, value: 21600, previousVersion: 1, version: 2 }], total: 1, page: 1, pageSize: 100 }));
    const api = createHttpParameters({ parameter });
    expect(await api.history(record.key)).toHaveLength(1);
  });
});
