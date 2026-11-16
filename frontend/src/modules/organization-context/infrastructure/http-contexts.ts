import { z } from 'zod';
import { applicationRoles } from '@/modules/authentication/domain/user';
import { sameScope } from '@/modules/authentication/domain/permissions';
import { snapshotSchema } from '@/shared/infrastructure/http/permissions-schema';
import { ApplicationError } from '@/shared/application/application-error';
import { scopeOf } from '../domain/context';
import type { ContextApi } from '../application/context-ports';
const id = z.string().min(1).max(128).refine(value => value.trim().length > 0);
const roles = z.array(z.enum(applicationRoles)).min(1).refine(values => new Set(values).size === values.length);
const destination = z.object({ organizationId: id, organizationType: z.enum(['COMPANY', 'THIRD_PARTY']), organizationName: z.string().min(1).max(256), roles }).strict();
const available = z.object({ organizations: z.array(destination).refine(values => new Set(values.map(value => value.organizationId)).size === values.length), globalAvailable: z.boolean() }).strict();
const resolved = z.discriminatedUnion('kind', [z.object({ kind: z.literal('GLOBAL'), roles, authorization: snapshotSchema }).strict(), destination.extend({ kind: z.literal('ORGANIZATION'), authorization: snapshotSchema }).strict()]);
export function createHttpContexts(http: { get(path: 'organization-contexts', query?: string, signal?: AbortSignal): Promise<unknown>; post(path: 'organization-contexts/resolve', body: unknown, signal?: AbortSignal): Promise<unknown> }): ContextApi {
  return {
    async available(signal) {
      const parsed = available.safeParse(await http.get('organization-contexts', '', signal));
      if (!parsed.success) throw new ApplicationError('INVALID_RESPONSE');
      return parsed.data;
    },
    async resolve(selection, reason, signal) {
      const parsed = resolved.safeParse(await http.post('organization-contexts/resolve', { selection, reason }, signal));
      if (!parsed.success || !sameScope(scopeOf(selection), parsed.data.authorization.scope) || !sameScope(scopeOf(parsed.data), scopeOf(selection)) || !parsed.data.authorization.permissions.length) throw new ApplicationError('INVALID_RESPONSE');
      return parsed.data;
    },
  };
}
