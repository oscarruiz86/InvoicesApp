import { ApplicationError } from '@/shared/application/application-error';
import { RequestError } from '@/shared/application/request-error';
import type { AccessTokenPort, SessionPort } from '../application/session-ports';

export function createProtectedHttp(baseUrl: string, credentials: AccessTokenPort, session: SessionPort, fetcher: typeof fetch = globalThis.fetch.bind(globalThis), timeoutMs = 5000) {
  const base = new URL(baseUrl.replace(/\/$/, '') + '/', window.location.origin);
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new ApplicationError('CONFIGURATION');
  const active = new Set<AbortController>();
  const denied = new Set<() => void>();
  const unsubscribe = session.subscribe(value => { if (!['authenticated', 'refreshing'].includes(value.status)) { active.forEach(controller => controller.abort('UNAUTHENTICATED')); active.clear(); } });
  return {
    subscribeForbidden(listener: () => void) { denied.add(listener); return () => { denied.delete(listener); }; },
    dispose() { unsubscribe(); active.forEach(controller => controller.abort('CANCELLED')); active.clear(); denied.clear(); },
    get(path: 'auth/me' | 'auth/permissions' | 'organization-contexts', query = '', signal?: AbortSignal): Promise<unknown> {
      return request(path, query, signal);
    },
    post(path: 'organization-contexts/resolve', body: unknown, signal?: AbortSignal): Promise<unknown> {
      return request(path, '', signal, body);
    },
    company(method: 'GET' | 'POST' | 'PATCH', path: string, query: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
      const base = /^companies(?:\/[a-f0-9]{24})?$/;
      const action = /^companies\/[a-f0-9]{24}\/status$/;
      const valid = method === 'GET' ? base.test(path)
        : method === 'PATCH' ? /^companies\/[a-f0-9]{24}$/.test(path) : path === 'companies' || action.test(path);
      if (!valid) throw new ApplicationError('CONFIGURATION');
      return request(path, query, signal, body, method);
    },
    organization(method: 'GET' | 'POST' | 'PATCH', path: string, query = '', body?: unknown, signal?: AbortSignal): Promise<unknown> {
      const valid = /^(invitations(?:\/[A-Za-z0-9_~-]{1,128}(?:\/(?:cancel|resend))?)?|invitations\/(?:preview|accept|reject)|invitations\/received(?:\/[A-Za-z0-9_~-]{1,128}\/(?:accept|reject))?|organization-memberships(?:\/[A-Za-z0-9_~-]{1,128}(?:\/(?:profile|roles|status))?)?)$/.test(path);
      if (!valid) throw new ApplicationError('CONFIGURATION');
      return request(path, query, signal, body, method);
    },
    previewInvitation(token: string, signal?: AbortSignal): Promise<unknown> {
      return request('invitations/preview', '', signal, { token }, 'POST', false);
    },
  };
  async function request(path: string, query: string, signal?: AbortSignal, payload?: unknown, companyMethod?: 'GET' | 'POST' | 'PATCH', authenticated = true): Promise<unknown> {
      if (!companyMethod && !(payload === undefined ? ['auth/me', 'auth/permissions', 'organization-contexts'] : ['organization-contexts/resolve']).includes(path)
        && !/^(invitations|organization-memberships)\//.test(path)) throw new ApplicationError('CONFIGURATION');
      const endpoint = new URL(path, base); endpoint.search = query;
      if (signal?.aborted) throw new ApplicationError('CANCELLED');
      const controller = new AbortController();
      const cancel = () => controller.abort('CANCELLED');
      signal?.addEventListener('abort', cancel, { once: true }); active.add(controller);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const token = authenticated ? await credentials.getAccessToken() : null;
        if (controller.signal.aborted) throw new ApplicationError(controller.signal.reason);
        timer = setTimeout(() => controller.abort('TIMEOUT'), timeoutMs);
        const response = await fetcher(endpoint.href, { signal: controller.signal, redirect: 'error', cache: 'no-store', credentials: 'omit',
          ...(payload === undefined ? {} : { body: JSON.stringify(payload) }), method: companyMethod ?? (payload === undefined ? 'GET' : 'POST'),
          headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }) } });
        if (response.status === 401) { session.invalidate(); throw new ApplicationError('UNAUTHENTICATED'); }
        if (response.status === 403) {
          if (path === 'invitations/accept' || path === 'invitations/reject' || path === 'invitations/received' || path.startsWith('invitations/received/')) {
            const failure = await response.json().catch(() => null);
            if (['IDENTITY_MISMATCH', 'EMAIL_UNVERIFIED', 'PROFILE_INCOMPLETE'].includes(failure?.error?.code)) throw new RequestError(failure.error.code);
          }
          if (path === 'auth/me' || companyMethod) denied.forEach(listener => listener());
          throw new ApplicationError('FORBIDDEN');
        }
        if (response.status === 404) throw new ApplicationError('NOT_FOUND');
        if (response.status === 503) throw new ApplicationError('UNAVAILABLE');
        if (response.status === 410) throw new RequestError('INVITATION_EXPIRED');
        if (companyMethod && [400, 409].includes(response.status)) {
          const failure = await response.json().catch(() => null);
          const codes = ['INVALID_REQUEST', 'INVALID_ADMINISTRATOR', 'COMPANY_DOCUMENT_CONFLICT', 'COMPANY_VERSION_CONFLICT', 'COMPANY_INACTIVE', 'INVALID_ROLES', 'LAST_ROLE_REQUIRED', 'INVITATION_EXISTS', 'MEMBERSHIP_EXISTS', 'VERSION_CONFLICT', 'LAST_ADMINISTRATOR_REQUIRED'];
          throw new RequestError(codes.includes(failure?.error?.code) ? failure.error.code : 'INVALID_REQUEST', Array.isArray(failure?.error?.fields) ? failure.error.fields.filter((field: unknown) => typeof field === 'string') : []);
        }
        if (!response.ok) throw new ApplicationError('HTTP');
        let body: unknown;
        try { body = await response.json(); } catch { throw new ApplicationError('INVALID_RESPONSE'); }
        if (controller.signal.aborted) throw new ApplicationError(controller.signal.reason);
        return body;
      } catch (error) {
        if (controller.signal.aborted) throw new ApplicationError(controller.signal.reason);
        if (error instanceof ApplicationError) throw error;
        throw new ApplicationError('NETWORK');
      } finally { clearTimeout(timer); active.delete(controller); signal?.removeEventListener('abort', cancel); }
    }
}
export type ProtectedHttp = ReturnType<typeof createProtectedHttp>;
