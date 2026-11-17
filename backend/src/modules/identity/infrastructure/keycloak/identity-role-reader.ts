import { applicationRoles, type ApplicationRole } from '../../domain/actor';
import type { IdentityRoleReader } from '../../application/identity-role-reader';
import { IdentityProfileUnavailable } from '../../application/identity-profile-reader';

type Configuration = { issuer: string; directoryIssuer?: string; clientId: string; clientSecret: string };

export function createIdentityRoleReader(configuration: () => Configuration | Promise<Configuration>, fetcher: typeof fetch = fetch): IdentityRoleReader {
  return {
    async read(subject) {
      if (!subject || subject.length > 128 || subject.trim() !== subject) return null;
      const config = await configuration();
      const issuer = new URL(config.issuer);
      const directoryIssuer = new URL(config.directoryIssuer ?? config.issuer);
      if (directoryIssuer.pathname !== issuer.pathname || !config.clientId || !config.clientSecret) throw new IdentityProfileUnavailable();
      try {
        const login = await fetcher(`${directoryIssuer.href}/protocol/openid-connect/token`, { method: 'POST', redirect: 'error', cache: 'no-store',
          signal: AbortSignal.timeout(5000), body: new URLSearchParams({ grant_type: 'client_credentials', client_id: config.clientId, client_secret: config.clientSecret }) });
        if (!login.ok) throw new IdentityProfileUnavailable();
        const credentials: unknown = await login.json();
        if (!credentials || typeof credentials !== 'object' || typeof (credentials as Record<string, unknown>).access_token !== 'string') throw new IdentityProfileUnavailable();
        const endpoint = `${directoryIssuer.origin}${directoryIssuer.pathname.replace('/realms/', '/admin/realms/')}/users/${encodeURIComponent(subject)}/role-mappings/realm`;
        const response = await fetcher(endpoint, { headers: { Authorization: `Bearer ${(credentials as Record<string, string>).access_token}` }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000) });
        if (response.status === 404) return null;
        if (!response.ok) throw new IdentityProfileUnavailable();
        const value: unknown = await response.json();
        if (!Array.isArray(value) || value.some(role => !role || typeof role !== 'object' || typeof (role as Record<string, unknown>).name !== 'string')) throw new IdentityProfileUnavailable();
        return [...new Set(value.map(role => (role as { name: string }).name).filter((name): name is ApplicationRole => (applicationRoles as readonly string[]).includes(name)))];
      } catch { throw new IdentityProfileUnavailable(); }
    },
  };
}
