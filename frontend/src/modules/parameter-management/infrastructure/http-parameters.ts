import { z } from 'zod';
import type { ParameterApi } from '../application/parameter-api';
import { RequestError } from '@/shared/application/request-error';

const parameter = z.object({ key: z.string(), name: z.string(), description: z.string(), type: z.literal('integer'), unit: z.literal('seconds'), minimum: z.number().int(), maximum: z.number().int(), scope: z.literal('global'), value: z.number().int(), version: z.number().int(), effectiveFrom: z.string(), createdAt: z.string(), createdBy: z.string(), updatedAt: z.string(), updatedBy: z.string() }).strict();
const event = z.object({ eventId: z.string(), correlationId: z.string(), key: z.string(), actor: z.string(), at: z.string(), previousValue: z.number().int(), value: z.number().int(), previousVersion: z.number().int(), version: z.number().int() }).strict();
async function read<T>(body: unknown, schema: z.ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(body); if (!parsed.success) throw new RequestError('INVALID_RESPONSE'); return parsed.data;
}
export function createHttpParameters(http: { parameter(method: 'GET'|'PATCH', path: string, query?: string, body?: unknown, signal?: AbortSignal): Promise<unknown> }): ParameterApi {
  return {
    async list(signal) { const result = await read(await http.parameter('GET', 'parameters', 'scope=global&page=1&pageSize=100', undefined, signal), z.object({ items: z.array(parameter), total: z.number().int(), page: z.number().int(), pageSize: z.number().int() }).strict()); return result.items; },
    async history(key, signal) { const result = await read(await http.parameter('GET', `parameters/${key}/history`, 'scope=global&page=1&pageSize=100', undefined, signal), z.object({ items: z.array(event), total: z.number().int(), page: z.number().int(), pageSize: z.number().int() }).strict()); return result.items; },
    async update(key, expectedVersion, value, signal) { return read(await http.parameter('PATCH', `parameters/${key}`, 'scope=global', { expectedVersion, value }, signal), parameter); },
  };
}
