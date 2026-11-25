import type { KeycloakAdminEventSource, KeycloakAdminEvent } from './admin-event-collector';

export function createKeycloakAdminEventApi(input: {
  baseUrl: string; realm: string; clientId: string; clientSecret: string;
  fetcher?: typeof fetch;
}): KeycloakAdminEventSource {
  const fetcher = input.fetcher ?? fetch;
  const root = input.baseUrl.replace(/\/$/, '');
  if (!/^https?:\/\//.test(root) || !/^[A-Za-z0-9._-]{1,128}$/.test(input.realm)
    || !/^[A-Za-z0-9._-]{1,128}$/.test(input.clientId) || !input.clientSecret) throw new Error('KEYCLOAK_ADMIN_API_CONFIG_INVALID');
  return { async page({ from, to, first, max }): Promise<readonly KeycloakAdminEvent[]> {
    const tokenResponse = await fetcher(`${root}/realms/${encodeURIComponent(input.realm)}/protocol/openid-connect/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: input.clientId, client_secret: input.clientSecret }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!tokenResponse.ok) throw new Error('KEYCLOAK_ADMIN_TOKEN_UNAVAILABLE');
    const tokenValue: unknown = await tokenResponse.json();
    if (!tokenValue || typeof tokenValue !== 'object' || !('access_token' in tokenValue) || typeof tokenValue.access_token !== 'string') throw new Error('KEYCLOAK_ADMIN_TOKEN_INVALID');
    const url = new URL(`${root}/admin/realms/${encodeURIComponent(input.realm)}/admin-events`);
    url.search = new URLSearchParams({ dateFrom: String(from), dateTo: String(to), direction: 'asc', first: String(first), max: String(max) }).toString();
    const response = await fetcher(url, { headers: { authorization: `Bearer ${tokenValue.access_token}` }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error('KEYCLOAK_ADMIN_EVENTS_UNAVAILABLE');
    const result: unknown = await response.json();
    if (!Array.isArray(result)) throw new Error('KEYCLOAK_ADMIN_EVENTS_INVALID');
    return result as KeycloakAdminEvent[];
  } };
}
