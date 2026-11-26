import { z } from 'zod';
import { ApplicationError } from '@/shared/application/application-error';

const schema = z.object({ VITE_API_BASE_URL: z.string().trim().refine(value => {
  if (value === '/api') return true;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}).default('/api'),
  VITE_OFFLINE_CREDENTIAL_PUBLIC_JWKS: z.preprocess(value => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().min(1).max(16_384).optional()),
  VITE_OFFLINE_CREDENTIAL_MAX_TTL_HOURS: z.preprocess(value => value === '' || value === undefined ? 72 : Number(value), z.number().int().min(1).max(72)) });
export function readClientEnvironment(source: Record<string, unknown>) {
  const result = schema.safeParse(source);
  if (!result.success) throw new ApplicationError('CONFIGURATION');
  let offlineCredentialPublicJwks: readonly (JsonWebKey & { kid: string })[] = [];
  if (result.data.VITE_OFFLINE_CREDENTIAL_PUBLIC_JWKS) {
    try {
      const parsed: unknown = JSON.parse(result.data.VITE_OFFLINE_CREDENTIAL_PUBLIC_JWKS);
      const values: unknown[] = Array.isArray(parsed) ? parsed
        : parsed && typeof parsed === 'object' && 'keys' in parsed && Array.isArray(parsed.keys) ? parsed.keys : [];
      if (!values.length || values.length > 10) throw new Error();
      const keys = values.map(value => {
        if (!value || typeof value !== 'object' || !('kty' in value) || value.kty !== 'EC' || !('crv' in value) || value.crv !== 'P-256'
          || !('x' in value) || typeof value.x !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.x)
          || !('y' in value) || typeof value.y !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.y)
          || !('kid' in value) || typeof value.kid !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(value.kid) || 'd' in value
          || 'alg' in value && value.alg !== 'ES256' || 'use' in value && value.use !== 'sig') throw new Error();
        return value as JsonWebKey & { kid: string };
      });
      if (new Set(keys.map(value => value.kid)).size !== keys.length) throw new Error();
      offlineCredentialPublicJwks = keys;
    } catch { throw new ApplicationError('CONFIGURATION'); }
  }
  return { apiBaseUrl: result.data.VITE_API_BASE_URL.replace(/\/$/, ''), offlineCredentialPublicJwks,
    offlineCredentialMaxTtlHours: result.data.VITE_OFFLINE_CREDENTIAL_MAX_TTL_HOURS };
}
