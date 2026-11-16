import { z } from 'zod';
import { ApplicationError } from '@/shared/application/application-error';
import { applicationRoles } from '../domain/user';
import type { AccessTokenPort, CurrentUserPort, SessionPort } from '../application/session-ports';
import { createProtectedHttp, type ProtectedHttp } from './protected-http';

const profile = z.object({ user: z.object({ id: z.string().min(1), username: z.string().nullable(), name: z.string().nullable(), email: z.string().nullable(), roles: z.array(z.enum(applicationRoles)).refine(roles => new Set(roles).size === roles.length) }).strict() }).strict();

export function createHttpCurrentUser(baseUrl: string, credentials: AccessTokenPort, session: SessionPort, fetcher: typeof fetch = globalThis.fetch.bind(globalThis), timeoutMs = 5000, shared?: ProtectedHttp): CurrentUserPort {
  const http = shared ?? createProtectedHttp(baseUrl, credentials, session, fetcher, timeoutMs);
  return {
    async read(signal) {
      const parsed = profile.safeParse(await http.get('auth/me', '', signal));
      if (!parsed.success) throw new ApplicationError('INVALID_RESPONSE');
      return parsed.data.user;
    },
  };
}
