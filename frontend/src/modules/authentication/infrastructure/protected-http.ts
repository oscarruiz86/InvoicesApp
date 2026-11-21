import { ApplicationError } from '@/shared/application/application-error';
import { RequestError } from '@/shared/application/request-error';
import type { AccessTokenPort, SessionPort } from '../application/session-ports';

function validDriverQuery(query: string, list: boolean): boolean {
  const parameters = new URLSearchParams(query);
  const allowed = list ? ['scope', 'thirdPartyId', 'page', 'pageSize', 'sort', 'direction', 'status', 'q'] : ['scope', 'thirdPartyId'];
  for (const [key] of parameters) if (!allowed.includes(key) || parameters.getAll(key).length !== 1) return false;
  if (parameters.get('scope') !== 'organization' || !/^[a-f0-9]{24}$/.test(parameters.get('thirdPartyId') ?? '')) return false;
  if (!list) return parameters.size === 2;
  const page = parameters.get('page'); const pageSize = parameters.get('pageSize');
  const sort = parameters.get('sort'); const direction = parameters.get('direction');
  const status = parameters.get('status'); const q = parameters.get('q');
  return (page === null || /^[1-9]\d{0,6}$/.test(page)) && (pageSize === null || /^(?:[1-9]|[1-9]\d|100)$/.test(pageSize))
    && (sort === null || ['createdAt', 'status'].includes(sort)) && (direction === null || ['asc', 'desc'].includes(direction))
    && (status === null || ['ACTIVE', 'INACTIVE'].includes(status))
    && (q === null || (q.trim() === q && q.length >= 2 && q.length <= 100));
}
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
    roles(method: 'GET' | 'PUT', query = 'scope=global', body?: unknown, signal?: AbortSignal): Promise<unknown> {
      if ((method === 'GET' && body !== undefined) || (method === 'PUT' && body === undefined)) throw new ApplicationError('CONFIGURATION');
      return request('roles', query, signal, body, method);
    },
    parameter(method: 'GET' | 'PATCH', path: string, query = 'scope=global', body?: unknown, signal?: AbortSignal): Promise<unknown> {
      const valid = /^(?:parameters|parameters\/[A-Za-z0-9._-]{1,128}|parameters\/[A-Za-z0-9._-]{1,128}\/history)$/.test(path);
      if (!valid || (method === 'GET' && body !== undefined) || (method === 'PATCH' && body === undefined)) throw new ApplicationError('CONFIGURATION');
      return request(path, query, signal, body, method);
    },
    company(method: 'GET' | 'POST' | 'PATCH', path: string, query: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
      const base = /^companies(?:\/[a-f0-9]{24})?$/;
      const action = /^companies\/[a-f0-9]{24}\/status$/;
      const valid = method === 'GET' ? base.test(path)
        : method === 'PATCH' ? /^companies\/[a-f0-9]{24}$/.test(path) : path === 'companies' || action.test(path);
      if (!valid) throw new ApplicationError('CONFIGURATION');
      return request(path, query, signal, body, method);
    },
    thirdParty(method: 'GET' | 'POST' | 'PATCH' | 'PUT', path: string, query: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
      const base = /^third-parties(?:\/[a-f0-9]{24})?$/;
      const status = /^third-parties\/[a-f0-9]{24}\/status$/;
      const relationship = /^third-parties\/[a-f0-9]{24}\/relationships\/[a-f0-9]{24}$/;
      const valid = method === 'GET' ? base.test(path) || relationship.test(path)
        : method === 'PATCH' ? /^third-parties\/[a-f0-9]{24}$/.test(path)
          : method === 'POST' ? path === 'third-parties' || status.test(path) : relationship.test(path);
      if (!valid) throw new ApplicationError('CONFIGURATION');
      return request(path, query, signal, body, method);
    },
    organization(method: 'GET' | 'POST' | 'PATCH', path: string, query = '', body?: unknown, signal?: AbortSignal): Promise<unknown> {
      const valid = /^(invitations(?:\/[A-Za-z0-9_~-]{1,128}(?:\/(?:cancel|resend))?)?|invitations\/(?:preview|accept|reject)|invitations\/received(?:\/[A-Za-z0-9_~-]{1,128}\/(?:accept|reject))?|organization-memberships(?:\/[A-Za-z0-9_~-]{1,128}(?:\/(?:profile|roles|status))?)?)$/.test(path);
      if (!valid) throw new ApplicationError('CONFIGURATION');
      return request(path, query, signal, body, method);
    },
    driver(method: 'GET' | 'PATCH', path: string, query = '', body?: unknown, signal?: AbortSignal): Promise<unknown> {
      const list = path === 'drivers';
      const detail = /^drivers\/[a-f0-9]{24}$/.test(path);
      const status = /^drivers\/[a-f0-9]{24}\/status$/.test(path);
      const validMethod = method === 'GET' ? body === undefined && (list || detail) : method === 'PATCH' && status && body !== undefined;
      if (!validMethod || !validDriverQuery(query, method === 'GET' && list)) throw new ApplicationError('CONFIGURATION');
      return request(path, query, signal, body, method);
    },
    vehicle(method: 'GET' | 'POST' | 'PATCH', path: string, query = '', body?: unknown, signal?: AbortSignal): Promise<unknown> {
      const list = path === 'vehicles';
      const detail = /^vehicles\/[a-f0-9]{24}$/.test(path);
      const status = /^vehicles\/[a-f0-9]{24}\/status$/.test(path);
      const valid = method === 'GET' ? body === undefined && (list || detail)
        : method === 'POST' ? list && body !== undefined : (detail || status) && body !== undefined;
      const params = new URLSearchParams(query);
      const allowed = method === 'GET' && list ? ['scope', 'thirdPartyId', 'page', 'pageSize', 'sort', 'direction', 'status', 'q'] : ['scope', 'thirdPartyId'];
      for (const [key] of params) if (!allowed.includes(key) || params.getAll(key).length !== 1) throw new ApplicationError('CONFIGURATION');
      if (!valid || params.get('scope') !== 'organization' || !/^[a-f0-9]{24}$/.test(params.get('thirdPartyId') ?? '')) throw new ApplicationError('CONFIGURATION');
      if (params.has('page') && !/^[1-9]\d{0,6}$/.test(params.get('page')!)) throw new ApplicationError('CONFIGURATION');
      if (params.has('pageSize') && !/^(?:[1-9]|[1-9]\d|100)$/.test(params.get('pageSize')!)) throw new ApplicationError('CONFIGURATION');
      if (params.has('sort') && !['plate', 'internalNumber', 'propertyCardNumber', 'status', 'createdAt'].includes(params.get('sort')!)) throw new ApplicationError('CONFIGURATION');
      if (params.has('direction') && !['asc', 'desc'].includes(params.get('direction')!)) throw new ApplicationError('CONFIGURATION');
      if (params.has('status') && !['ACTIVE', 'INACTIVE'].includes(params.get('status')!)) throw new ApplicationError('CONFIGURATION');
      if (params.has('q') && (!params.get('q')!.trim() || params.get('q')!.length > 100)) throw new ApplicationError('CONFIGURATION');
      return request(path, query, signal, body, method);
    },
    assignment(method: 'GET' | 'POST', path: string, query = '', body?: unknown, signal?: AbortSignal): Promise<unknown> {
      const list = path === 'assignments';
      const detail = /^assignments\/[a-f0-9]{24}$/.test(path);
      const close = /^assignments\/[a-f0-9]{24}\/close$/.test(path);
      const valid = method === 'GET' ? body === undefined && (list || detail)
        : method === 'POST' ? (list || close) && body !== undefined : false;
      const params = new URLSearchParams(query);
      const allowed = method === 'GET' && list
        ? ['scope', 'thirdPartyId', 'page', 'pageSize', 'sort', 'direction', 'status', 'driverId', 'vehicleId', 'q']
        : ['scope', 'thirdPartyId'];
      for (const [key] of params) if (!allowed.includes(key) || params.getAll(key).length !== 1) throw new ApplicationError('CONFIGURATION');
      if (!valid || params.get('scope') !== 'organization' || !/^[a-f0-9]{24}$/.test(params.get('thirdPartyId') ?? '')) throw new ApplicationError('CONFIGURATION');
      if (params.has('page') && !/^[1-9]\d{0,6}$/.test(params.get('page')!)) throw new ApplicationError('CONFIGURATION');
      if (params.has('pageSize') && !/^(?:[1-9]|[1-9]\d|100)$/.test(params.get('pageSize')!)) throw new ApplicationError('CONFIGURATION');
      if (params.has('sort') && !['startedAt', 'status', 'driverName', 'vehicleId'].includes(params.get('sort')!)) throw new ApplicationError('CONFIGURATION');
      if (params.has('direction') && !['asc', 'desc'].includes(params.get('direction')!)) throw new ApplicationError('CONFIGURATION');
      if (params.has('status') && !['ACTIVE', 'CLOSED'].includes(params.get('status')!)) throw new ApplicationError('CONFIGURATION');
      for (const key of ['driverId', 'vehicleId']) if (params.has(key) && !/^[a-f0-9]{24}$/.test(params.get(key)!)) throw new ApplicationError('CONFIGURATION');
      if (params.has('q') && (!params.get('q')!.trim() || params.get('q')!.length > 100)) throw new ApplicationError('CONFIGURATION');
      return request(path, query, signal, body, method);
    },
    invoice(method: 'GET' | 'POST' | 'PATCH', path: string, query = '', body?: FormData | { readonly qrContent: string },
      options: { readonly signal?: AbortSignal; readonly idempotencyKey?: string; readonly binary?: boolean } = {}): Promise<unknown> {
      const list = path === 'invoices', detail = /^invoices\/[a-f0-9]{24}$/.test(path), image = /^invoices\/[a-f0-9]{24}\/image$/.test(path);
      const qrPreview = path === 'invoices/qr/preview', qrCreate = path === 'invoices/qr';
      const valid = method === 'GET' ? body === undefined && (list || detail || image)
        : method === 'POST' ? (list && body instanceof FormData && Boolean(options.idempotencyKey))
          || (qrCreate && body instanceof FormData && Boolean(options.idempotencyKey))
          || (qrPreview && body !== undefined && !(body instanceof FormData))
          : method === 'PATCH' && detail && body instanceof FormData;
      const params = new URLSearchParams(query);
      const allowed = method === 'GET' && list ? ['scope', 'thirdPartyId', 'page', 'pageSize', 'q', 'vehicleId', 'dateFrom', 'dateTo', 'sort', 'direction'] : ['scope', 'thirdPartyId'];
      for (const [key] of params) if (!allowed.includes(key) || params.getAll(key).length !== 1) throw new ApplicationError('CONFIGURATION');
      if (!valid || params.get('scope') !== 'organization' || !/^[a-f0-9]{24}$/.test(params.get('thirdPartyId') ?? '') || Boolean(options.binary) !== image)
        throw new ApplicationError('CONFIGURATION');
      if (params.has('page') && !/^[1-9]\d{0,6}$/.test(params.get('page')!)) throw new ApplicationError('CONFIGURATION');
      if (params.has('pageSize') && !/^(?:[1-9]|[1-9]\d|100)$/.test(params.get('pageSize')!)) throw new ApplicationError('CONFIGURATION');
      if (params.has('sort') && !['invoiceDate', 'invoiceNumber', 'totalAmount', 'createdAt'].includes(params.get('sort')!)) throw new ApplicationError('CONFIGURATION');
      if (params.has('direction') && !['asc', 'desc'].includes(params.get('direction')!)) throw new ApplicationError('CONFIGURATION');
      if (params.has('vehicleId') && !/^[a-f0-9]{24}$/.test(params.get('vehicleId')!)) throw new ApplicationError('CONFIGURATION');
      if (params.has('q') && (!params.get('q')!.trim() || params.get('q')!.length > 100)) throw new ApplicationError('CONFIGURATION');
      return request(path, query, options.signal, body, method, true, options.idempotencyKey, options.binary, body instanceof FormData);
    },
    previewInvitation(token: string, signal?: AbortSignal): Promise<unknown> {
      return request('invitations/preview', '', signal, { token }, 'POST', false);
    },
  };
  async function request(path: string, query: string, signal?: AbortSignal, payload?: unknown, companyMethod?: 'GET' | 'POST' | 'PATCH' | 'PUT', authenticated = true,
    extraHeader?: string, binary = false, multipartPayload?: boolean): Promise<unknown> {
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
        const multipart = multipartPayload ?? (typeof FormData !== 'undefined' && payload instanceof FormData);
        const response = await fetcher(endpoint.href, { signal: controller.signal, redirect: 'error', cache: 'no-store', credentials: 'omit',
          ...(payload === undefined ? {} : { body: multipart ? payload as FormData : JSON.stringify(payload) }), method: companyMethod ?? (payload === undefined ? 'GET' : 'POST'),
          headers: { Accept: binary ? 'image/jpeg, image/png' : 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(payload === undefined || multipart ? {} : { 'Content-Type': 'application/json' }), ...(extraHeader ? { 'Idempotency-Key': extraHeader } : {}) } });
        if (response.status === 401) { session.invalidate(); throw new ApplicationError('UNAUTHENTICATED'); }
        if (response.status === 403) {
          if (path === 'invitations/accept' || path === 'invitations/reject' || path === 'invitations/received' || path.startsWith('invitations/received/')) {
            const failure = await response.json().catch(() => null);
            if (['IDENTITY_MISMATCH', 'EMAIL_UNVERIFIED', 'PROFILE_INCOMPLETE'].includes(failure?.error?.code)) throw new RequestError(failure.error.code);
          }
          if (path === 'auth/me' || path === 'roles' || companyMethod) denied.forEach(listener => listener());
          throw new ApplicationError('FORBIDDEN');
        }
        if (response.status === 404) throw new ApplicationError('NOT_FOUND');
        if (response.status === 503) {
          const failure = await response.json().catch(() => null);
          if (path === 'roles' && failure?.error?.code === 'POLICY_AUDIT_CAPACITY') throw new RequestError('POLICY_AUDIT_CAPACITY');
          if (path.startsWith('vehicles/') && failure?.error?.code === 'ASSIGNMENT_PROVIDER_UNAVAILABLE') throw new RequestError('ASSIGNMENT_PROVIDER_UNAVAILABLE');
          if (path.startsWith('assignments') && typeof failure?.error?.code === 'string') throw new RequestError(failure.error.code);
          if (path.startsWith('invoices') && typeof failure?.error?.code === 'string') throw new RequestError(failure.error.code);
          if (path.startsWith('parameters') && typeof failure?.error?.code === 'string') throw new RequestError(failure.error.code);
          throw new ApplicationError('UNAVAILABLE');
        }
        if (response.status === 410) throw new RequestError('INVITATION_EXPIRED');
        if (companyMethod && path !== 'roles' && [400, 409].includes(response.status)) {
          const failure = await response.json().catch(() => null);
          const codes = ['INVALID_REQUEST', 'INVALID_ADMINISTRATOR', 'COMPANY_DOCUMENT_CONFLICT', 'COMPANY_VERSION_CONFLICT', 'COMPANY_INACTIVE', 'THIRD_PARTY_DOCUMENT_CONFLICT', 'THIRD_PARTY_VERSION_CONFLICT', 'THIRD_PARTY_INACTIVE', 'RELATIONSHIP_INACTIVE', 'INVALID_ROLES', 'LAST_ROLE_REQUIRED', 'INVITATION_EXISTS', 'MEMBERSHIP_EXISTS', 'VERSION_CONFLICT', 'CONFLICT', 'LAST_ADMINISTRATOR_REQUIRED', 'VEHICLE_VERSION_CONFLICT', 'VEHICLE_IDENTIFIER_CONFLICT', 'VEHICLE_HAS_OPEN_ASSIGNMENT', 'ACTIVE_ASSIGNMENT_CONFLICT', 'ASSIGNMENT_VERSION_CONFLICT', 'DRIVER_NOT_ELIGIBLE', 'VEHICLE_NOT_ELIGIBLE', 'INVOICE_DUPLICATE', 'IDEMPOTENCY_CONFLICT', 'INVOICE_VERSION_CONFLICT', 'ASSIGNMENT_NOT_ELIGIBLE'];
          throw new RequestError(codes.includes(failure?.error?.code) ? failure.error.code : 'INVALID_REQUEST', Array.isArray(failure?.error?.fields) ? failure.error.fields.filter((field: unknown) => typeof field === 'string') : []);
        }
        if (path === 'roles' && [400, 409].includes(response.status)) {
          const failure = await response.json().catch(() => null);
          const expectedCode = response.status === 409 ? 'POLICY_CONFLICT' : 'INVALID_REQUEST';
          throw new RequestError(failure?.error?.code === expectedCode ? expectedCode : 'INVALID_REQUEST');
        }
        if (path.startsWith('parameters') && [400, 404, 409].includes(response.status)) {
          const failure = await response.json().catch(() => null);
          throw new RequestError(typeof failure?.error?.code === 'string' ? failure.error.code : response.status === 409 ? 'PARAMETER_VERSION_CONFLICT' : 'INVALID_REQUEST');
        }
        if (companyMethod && path.startsWith('invoices') && [413, 415].includes(response.status)) {
          const failure = await response.json().catch(() => null);
          const expected = response.status === 413 ? 'IMAGE_TOO_LARGE' : 'IMAGE_TYPE_UNSUPPORTED';
          throw new RequestError(['IMAGE_TOO_LARGE', 'IMAGE_TYPE_UNSUPPORTED', 'IMAGE_INVALID', 'IMAGE_DIMENSIONS_INVALID'].includes(failure?.error?.code)
            ? failure.error.code : expected);
        }
        if (!response.ok) throw new ApplicationError('HTTP');
        if (binary) {
          if (!['image/jpeg', 'image/png'].includes(response.headers.get('content-type') ?? '')) throw new ApplicationError('INVALID_RESPONSE');
          try { return await response.blob(); } catch { throw new ApplicationError('INVALID_RESPONSE'); }
        }
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
