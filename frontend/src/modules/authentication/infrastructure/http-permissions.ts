import { ApplicationError } from '@/shared/application/application-error';
import { sameScope } from '../domain/permissions';
import { scopeSchema, snapshotSchema } from '@/shared/infrastructure/http/permissions-schema';
import type { PermissionsPort } from '../application/read-permissions';
import type { ProtectedHttp } from './protected-http';

export function createHttpPermissions(http: Pick<ProtectedHttp, 'get'>): PermissionsPort {
  return { async read(scope, signal) {
    if (!scopeSchema.safeParse(scope).success) throw new ApplicationError('CONFIGURATION');
    const query = new URLSearchParams({ scope: scope.kind });
    if (scope.companyId !== null) query.set('companyId', scope.companyId);
    if (scope.thirdPartyId !== null) query.set('thirdPartyId', scope.thirdPartyId);
    const parsed = snapshotSchema.safeParse(await http.get('auth/permissions', query.toString(), signal));
    if (!parsed.success || !sameScope(scope, parsed.data.scope)) throw new ApplicationError('INVALID_RESPONSE');
    return parsed.data;
  } };
}
