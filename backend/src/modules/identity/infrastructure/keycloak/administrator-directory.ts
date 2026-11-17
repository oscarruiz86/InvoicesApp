import type { AdministratorDirectory } from '../../application/administrator-directory';
import { ConfigurationError } from '@/shared/application/configuration-error';
export class AdministratorDirectoryUnavailable extends Error { constructor() { super('IDENTITY_UNAVAILABLE'); } }
export function createAdministratorDirectory(configuration: () => { issuer: string; directoryIssuer?: string; clientId: string; clientSecret: string } | Promise<{ issuer: string; directoryIssuer?: string; clientId: string; clientSecret: string }>, fetcher: typeof fetch = fetch): AdministratorDirectory {
  return {
    async isEnabledCompanyAdministrator(subject) {
      if (!subject || subject.length > 128 || subject.trim() !== subject) return false;
      const config = await configuration();
      const issuer = new URL(config.issuer);
      const directoryIssuer = new URL(config.directoryIssuer ?? config.issuer);
      const validIssuer = (url: URL) => ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash
        && /\/realms\/[^/]+$/.test(url.pathname) && (url.protocol !== 'http:' || ['localhost', '127.0.0.1', 'keycloak'].includes(url.hostname));
      if (!validIssuer(issuer) || !validIssuer(directoryIssuer) || directoryIssuer.pathname !== issuer.pathname) throw new ConfigurationError(['KEYCLOAK_DIRECTORY_ISSUER_URL']);
      if (!config.clientId || !config.clientSecret) throw new ConfigurationError(['KEYCLOAK_DIRECTORY_CLIENT_ID', 'KEYCLOAK_DIRECTORY_CLIENT_SECRET']);
      try {
        const login = await fetcher(`${directoryIssuer.href}/protocol/openid-connect/token`, { method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000), body: new URLSearchParams({ grant_type: 'client_credentials', client_id: config.clientId, client_secret: config.clientSecret }) });
        if (!login.ok) throw new AdministratorDirectoryUnavailable();
        const token = await login.json();
        if (typeof token.access_token !== 'string') throw new AdministratorDirectoryUnavailable();
        const base = `${directoryIssuer.origin}${directoryIssuer.pathname.replace('/realms/', '/admin/realms/')}/users/${encodeURIComponent(subject)}`;
        const options = { headers: { Authorization: `Bearer ${token.access_token}` }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000) } as const;
        const userResponse = await fetcher(base, options);
        if (userResponse.status === 404) return false;
        if (!userResponse.ok) throw new AdministratorDirectoryUnavailable();
        const user = await userResponse.json();
        if (user.id !== subject || user.enabled !== true) return false;
        const rolesResponse = await fetcher(`${base}/role-mappings/realm/composite`, { ...options, signal: AbortSignal.timeout(5000) });
        if (!rolesResponse.ok) throw new AdministratorDirectoryUnavailable();
        const roles: unknown = await rolesResponse.json();
        if (!Array.isArray(roles)) throw new AdministratorDirectoryUnavailable();
        return roles.some(role => role && typeof role === 'object' && role.name === 'COMPANY_ADMIN');
      } catch { throw new AdministratorDirectoryUnavailable(); }
    },
  };
}
