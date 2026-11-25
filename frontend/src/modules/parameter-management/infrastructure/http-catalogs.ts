import { z } from 'zod';
import type { CatalogApi, CatalogOption } from '../application/catalog-api';
import { RequestError } from '@/shared/application/request-error';

const catalogName = z.enum(['document-types', 'countries', 'departments', 'municipalities', 'statuses']);
const option = z.object({ catalog: catalogName, code: z.string(), label: z.string(), parentCode: z.string().nullable(),
  territoryType: z.enum(['Municipio', 'Isla', 'Área no municipalizada']).nullable(), active: z.boolean(), version: z.number().int().positive(),
  source: z.string(), updatedAt: z.string(), updatedBy: z.string() }).strict();
async function parse<T>(value: unknown, schema: z.ZodType<T>): Promise<T> { const result = schema.safeParse(value); if (!result.success) throw new RequestError('INVALID_RESPONSE'); return result.data; }

export function createHttpCatalogApi(http: { catalog(method: 'GET' | 'POST' | 'PATCH', path: string, query?: string, body?: unknown, signal?: AbortSignal): Promise<unknown> }): CatalogApi {
  return {
    async list(catalog, parentCode, signal) {
      const query = new URLSearchParams({ scope: 'global' }); if (parentCode) query.set('parentCode', parentCode);
      const response = await parse(await http.catalog('GET', `catalogs/${catalog}`, query.toString(), undefined, signal), z.object({ items: z.array(option) }).strict());
      return response.items;
    },
    async updateLabel(entry: CatalogOption, label: string, signal) {
      return parse(await http.catalog('PATCH', `catalogs/${entry.catalog}/${entry.code}`, 'scope=global',
        { expectedVersion: entry.version, label, parentCode: entry.parentCode }, signal), option);
    },
    async createEntry(catalog, code, label, parentCode, signal) {
      return parse(await http.catalog('POST', `catalogs/${catalog}`, 'scope=global', { code, label, parentCode }, signal), option);
    },
    async deactivateEntry(entry, signal) {
      return parse(await http.catalog('POST', `catalogs/${entry.catalog}/${entry.code}/deactivate`, 'scope=global', { expectedVersion: entry.version, parentCode: entry.parentCode }, signal), option);
    },
  };
}
