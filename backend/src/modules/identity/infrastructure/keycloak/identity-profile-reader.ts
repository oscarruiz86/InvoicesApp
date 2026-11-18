import { colombianDocumentTypes, IdentityProfileUnavailable, type ColombianDocumentType, type IdentityProfileReader } from '../../application/identity-profile-reader';
import { ConfigurationError } from '@/shared/application/configuration-error';

type Configuration = { issuer: string; directoryIssuer?: string; clientId: string; clientSecret: string };

const singleAttribute = (attributes: unknown, name: string): string | null => {
  if (!attributes || typeof attributes !== 'object' || !(name in attributes)) return null;
  const value = (attributes as Record<string, unknown>)[name];
  if (typeof value === 'string') return value.trim() || null;
  if (!Array.isArray(value) || value.length !== 1 || typeof value[0] !== 'string') return null;
  return value[0].trim() || null;
};

export function createIdentityProfileReader(configuration: () => Configuration | Promise<Configuration>, fetcher: typeof fetch = fetch): IdentityProfileReader {
  const mapUser = (user: unknown) => {
    if (!user || typeof user !== 'object') return null;
    const value = user as Record<string, unknown>;
    if (typeof value.id !== 'string' || typeof value.enabled !== 'boolean') return null;
    const firstName = typeof value.firstName === 'string' ? value.firstName.trim() : '';
    const lastName = typeof value.lastName === 'string' ? value.lastName.trim() : '';
    const email = typeof value.email === 'string' ? value.email.trim().toLocaleLowerCase('en-US') || null : null;
    const documentTypeValue = singleAttribute(value.attributes, 'document_type');
    const documentType = colombianDocumentTypes.includes(documentTypeValue as ColombianDocumentType) ? documentTypeValue as ColombianDocumentType : null;
    const documentNumberValue = singleAttribute(value.attributes, 'document_number');
    const documentNumber = documentNumberValue && /^[A-Za-z0-9-]{3,20}$/.test(documentNumberValue) ? documentNumberValue : null;
    return { subject: value.id, enabled: value.enabled, email, emailVerified: value.emailVerified === true,
      fullName: firstName && lastName ? `${firstName} ${lastName}` : null, documentType, documentNumber,
      profileComplete: value.enabled && Boolean(email && firstName && lastName && documentType && documentNumber) };
  };
  return {
    async read(subject) {
      if (!subject || subject.length > 128 || subject.trim() !== subject) return null;
      const config = await configuration();
      const issuer = new URL(config.issuer);
      const directoryIssuer = new URL(config.directoryIssuer ?? config.issuer);
      const validIssuer = (url: URL) => ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash
        && /\/realms\/[^/]+$/.test(url.pathname) && (url.protocol !== 'http:' || ['localhost', '127.0.0.1', 'keycloak'].includes(url.hostname));
      if (!validIssuer(issuer) || !validIssuer(directoryIssuer) || directoryIssuer.pathname !== issuer.pathname) throw new ConfigurationError(['KEYCLOAK_DIRECTORY_ISSUER_URL']);
      if (!config.clientId || !config.clientSecret) throw new ConfigurationError(['KEYCLOAK_DIRECTORY_CLIENT_ID', 'KEYCLOAK_DIRECTORY_CLIENT_SECRET']);
      try {
        const login = await fetcher(`${directoryIssuer.href}/protocol/openid-connect/token`, {
          method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000),
          body: new URLSearchParams({ grant_type: 'client_credentials', client_id: config.clientId, client_secret: config.clientSecret }),
        });
        if (!login.ok) throw new IdentityProfileUnavailable();
        const credentials = await login.json();
        if (typeof credentials.access_token !== 'string') throw new IdentityProfileUnavailable();
        const endpoint = `${directoryIssuer.origin}${directoryIssuer.pathname.replace('/realms/', '/admin/realms/')}/users/${encodeURIComponent(subject)}`;
        const response = await fetcher(endpoint, { headers: { Authorization: `Bearer ${credentials.access_token}` }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000) });
        if (response.status === 404) return null;
        if (!response.ok) throw new IdentityProfileUnavailable();
        const user: unknown = await response.json();
        if (!user || typeof user !== 'object') throw new IdentityProfileUnavailable();
        const value = user as Record<string, unknown>;
        if (value.id !== subject || typeof value.enabled !== 'boolean' || (value.email !== undefined && typeof value.email !== 'string')
          || (value.emailVerified !== undefined && typeof value.emailVerified !== 'boolean')) throw new IdentityProfileUnavailable();
        const firstName = typeof value.firstName === 'string' ? value.firstName.trim() : '';
        const lastName = typeof value.lastName === 'string' ? value.lastName.trim() : '';
        const email = typeof value.email === 'string' ? value.email.trim().toLocaleLowerCase('en-US') || null : null;
        const documentTypeValue = singleAttribute(value.attributes, 'document_type');
        const documentType = colombianDocumentTypes.includes(documentTypeValue as ColombianDocumentType) ? documentTypeValue as ColombianDocumentType : null;
        const documentNumberValue = singleAttribute(value.attributes, 'document_number');
        const documentNumber = documentNumberValue && /^[A-Za-z0-9-]{3,20}$/.test(documentNumberValue) ? documentNumberValue : null;
        return {
          subject, enabled: value.enabled, email, emailVerified: value.emailVerified === true,
          fullName: firstName && lastName ? `${firstName} ${lastName}` : null,
          documentType, documentNumber,
          profileComplete: value.enabled && Boolean(email && firstName && lastName && documentType && documentNumber),
        };
      } catch (error) {
        if (error instanceof ConfigurationError) throw error;
        throw new IdentityProfileUnavailable();
      }
    },
    async search(input) {
      const rawText = input.text?.trim() ?? '';
      const emailOnly = input.emailOnly === true;
      const inferredDocument = !emailOnly && !rawText.includes('@') && /\d/.test(rawText) && /^[A-Za-z0-9-]{3,20}$/.test(rawText) ? rawText : '';
      const text = inferredDocument ? '' : rawText;
      const documentNumber = (input.documentNumber?.trim() || inferredDocument).toLocaleUpperCase('en-US');
      if ((!text && !documentNumber) || text.length > 120 || documentNumber.length > 20) return [];
      try {
        const config = await configuration();
        const issuer = new URL(config.issuer);
        const directoryIssuer = new URL(config.directoryIssuer ?? config.issuer);
        const validIssuer = (url: URL) => ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash
          && /\/realms\/[^/]+$/.test(url.pathname) && (url.protocol !== 'http:' || ['localhost', '127.0.0.1', 'keycloak'].includes(url.hostname));
        if (!validIssuer(issuer) || !validIssuer(directoryIssuer) || directoryIssuer.pathname !== issuer.pathname) throw new ConfigurationError(['KEYCLOAK_DIRECTORY_ISSUER_URL']);
        if (!config.clientId || !config.clientSecret) throw new ConfigurationError(['KEYCLOAK_DIRECTORY_CLIENT_ID', 'KEYCLOAK_DIRECTORY_CLIENT_SECRET']);
        const login = await fetcher(`${directoryIssuer.href}/protocol/openid-connect/token`, { method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000),
          body: new URLSearchParams({ grant_type: 'client_credentials', client_id: config.clientId, client_secret: config.clientSecret }) });
        if (!login.ok) throw new IdentityProfileUnavailable();
        const credentials = await login.json();
        if (typeof credentials.access_token !== 'string') throw new IdentityProfileUnavailable();
        const query = new URLSearchParams({ first: '0', max: '100' });
        if (text && !documentNumber && (emailOnly || text.includes('@'))) {
          query.set('search', text);
        } else if (text && !documentNumber) {
          const words = text.split(/\s+/).filter(Boolean);
          if (words.length > 1) { query.set('firstName', words[0]); query.set('lastName', words.at(-1)!); }
          else query.set('search', text);
        }
        if (documentNumber) query.set('q', `document_number:${documentNumber}`);
        const endpoint = `${directoryIssuer.origin}${directoryIssuer.pathname.replace('/realms/', '/admin/realms/')}/users?${query}`;
        const response = await fetcher(endpoint, { headers: { Authorization: `Bearer ${credentials.access_token}` }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new IdentityProfileUnavailable();
        const users: unknown = await response.json();
        if (!Array.isArray(users)) throw new IdentityProfileUnavailable();
        const normalizedText = text.toLocaleLowerCase('es-CO');
        return users.map(mapUser).filter((profile): profile is NonNullable<typeof profile> => profile !== null).filter(profile =>
          (!documentNumber || profile.documentNumber?.toLocaleUpperCase('en-US') === documentNumber)
          && (!normalizedText || (emailOnly || text.includes('@')
            ? profile.email?.toLocaleLowerCase('es-CO').includes(normalizedText)
            : profile.fullName?.toLocaleLowerCase('es-CO').includes(normalizedText))));
      } catch (error) {
        if (error instanceof ConfigurationError) throw error;
        throw new IdentityProfileUnavailable();
      }
    },
  };
}
