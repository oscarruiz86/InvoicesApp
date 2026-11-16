import { ApplicationError } from '@/shared/application/application-error';

export interface OidcConfiguration { url: string; realm: string; clientId: string }
export function readOidcConfiguration(source: Record<string, unknown>): OidcConfiguration | null {
  const values = [source.VITE_KEYCLOAK_URL, source.VITE_KEYCLOAK_REALM, source.VITE_KEYCLOAK_CLIENT_ID];
  if (values.every(value => value === undefined || value === '')) return null;
  if (!values.every(value => typeof value === 'string' && value.trim().length > 0)) throw new ApplicationError('CONFIGURATION');
  const [address, realm, clientId] = values as string[];
  try {
    const url = new URL(address);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.search || url.hash || !/^[\w.-]+$/.test(realm) || !/^[\w.-]+$/.test(clientId)) throw new Error();
    return { url: address.replace(/\/$/, ''), realm, clientId };
  } catch { throw new ApplicationError('CONFIGURATION'); }
}
