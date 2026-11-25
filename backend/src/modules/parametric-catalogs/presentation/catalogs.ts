import { z } from 'zod';
import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import type { Authorization } from '@/modules/identity/application/authorization';
import { errorResponse } from '@/shared/presentation/http/errors';
import { CatalogError, isCatalogName, validateCatalogCode, type CatalogName } from '../domain/catalogs';

const updateSchema = z.object({ expectedVersion: z.number().int().positive(), label: z.string().trim().min(1).max(128), parentCode: z.string().max(32).nullable() }).strict();
const createEntrySchema = z.object({ code: z.string().min(2).max(12), label: z.string().trim().min(1).max(128), parentCode: z.string().max(32).nullable() }).strict();
const deactivateSchema = z.object({ expectedVersion: z.number().int().positive(), parentCode: z.string().max(32).nullable() }).strict();
function fail(error: unknown) {
  if (!(error instanceof CatalogError)) return errorResponse(error);
  const status = error.code === 'INVALID_REQUEST' ? 400 : error.code === 'RESOURCE_NOT_FOUND' ? 404
    : error.code === 'CATALOG_VERSION_CONFLICT' ? 409 : error.code === 'FORBIDDEN' ? 403 : 503;
  return Response.json({ error: { code: error.code, message: 'No fue posible completar la operación.' } }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function catalogHandlers(repository: ReturnType<typeof import('../infrastructure/mongodb/catalog-repository').createCatalogRepository>, auth: Authorization) {
  const authorize = (actor: AuthenticatedActor, permission: 'parameters:read' | 'parameters:update') => auth.requirePermission(actor, permission, { kind: 'global', companyId: null, thirdPartyId: null });
  return {
    async list(actor: AuthenticatedActor, request: Request, catalogName: string) {
      try {
        if (!isCatalogName(catalogName)) throw new CatalogError('RESOURCE_NOT_FOUND');
        const query = new URL(request.url).searchParams;
        if ([...query.keys()].some(key => key !== 'scope' && key !== 'parentCode' || query.getAll(key).length !== 1) || query.get('scope') !== 'global') throw new CatalogError('INVALID_REQUEST');
        const parentCode = query.get('parentCode') ?? undefined;
        if (catalogName === 'departments' && (!parentCode || !/^[A-Z]{2}$/.test(parentCode)) || catalogName === 'municipalities' && (!parentCode || !/^\d{2}$/.test(parentCode))
          || catalogName === 'statuses' && (!parentCode || !/^[a-z][a-z-]{1,31}$/.test(parentCode))
          || parentCode && !['departments', 'municipalities', 'statuses'].includes(catalogName)) throw new CatalogError('INVALID_REQUEST');
        await authorize(actor, 'parameters:read');
        return Response.json({ items: await repository.list(catalogName as CatalogName, parentCode) }, { headers: { 'Cache-Control': 'no-store' } });
      } catch (error) { return fail(error); }
    },
    async updateLabel(actor: AuthenticatedActor, request: Request, catalogName: string, code: string) {
      try {
        if (!isCatalogName(catalogName) || !validateCatalogCode(catalogName, code)) throw new CatalogError('RESOURCE_NOT_FOUND');
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) throw new CatalogError('INVALID_REQUEST');
        let body: unknown; try { body = await request.json(); } catch { throw new CatalogError('INVALID_REQUEST'); }
        const parsed = updateSchema.safeParse(body); if (!parsed.success) throw new CatalogError('INVALID_REQUEST');
        const receipt = await authorize(actor, 'parameters:update');
        const result = await repository.updateLabel({ catalog: catalogName, code, ...parsed.data, actor: actor.subject, policyVersion: receipt.policyVersion });
        return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
      } catch (error) { return fail(error); }
    },
    async createEntry(actor: AuthenticatedActor, request: Request, catalogName: string) {
      try {
        if (!isCatalogName(catalogName) || !['countries', 'departments', 'municipalities', 'document-types'].includes(catalogName)) throw new CatalogError('FORBIDDEN');
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) throw new CatalogError('INVALID_REQUEST');
        let body: unknown; try { body = await request.json(); } catch { throw new CatalogError('INVALID_REQUEST'); }
        const parsed = createEntrySchema.safeParse(body); if (!parsed.success) throw new CatalogError('INVALID_REQUEST');
        const receipt = await authorize(actor, 'parameters:update');
        return Response.json(await repository.createEntry({ ...parsed.data, catalog: catalogName, actor: actor.subject, policyVersion: receipt.policyVersion }), { status: 201, headers: { 'Cache-Control': 'no-store' } });
      } catch (error) { return fail(error); }
    },
    async deactivateEntry(actor: AuthenticatedActor, request: Request, catalogName: string, code: string) {
      try {
        if (!isCatalogName(catalogName)) throw new CatalogError('RESOURCE_NOT_FOUND');
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) throw new CatalogError('INVALID_REQUEST');
        let body: unknown; try { body = await request.json(); } catch { throw new CatalogError('INVALID_REQUEST'); }
        const parsed = deactivateSchema.safeParse(body); if (!parsed.success) throw new CatalogError('INVALID_REQUEST');
        const receipt = await authorize(actor, 'parameters:update');
        return Response.json(await repository.deactivateEntry({ catalog: catalogName, code, ...parsed.data, actor: actor.subject, policyVersion: receipt.policyVersion }), { headers: { 'Cache-Control': 'no-store' } });
      } catch (error) { return fail(error); }
    },
  };
}
