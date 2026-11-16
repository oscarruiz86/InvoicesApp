import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { applicationRoles, type ApplicationRole } from '../../domain/actor';
import type { IdentityVerifier } from '../../application/identity-verifier';
import { AuthenticationError } from '../../application/authentication-error';
import type { KeycloakConfiguration } from './configuration';

export function createJwtIdentityVerifier(configuration: KeycloakConfiguration, options: {
  resolveKey?: JWTVerifyGetKey;
  currentDate?: () => Date;
  diagnostic?: (category: 'JWKS_UNAVAILABLE' | 'INVALID_TOKEN') => void;
} = {}): IdentityVerifier {
  const resolveKey = options.resolveKey ?? createRemoteJWKSet(new URL(configuration.jwksUrl), {
    cacheMaxAge: 600_000, timeoutDuration: 5000, cooldownDuration: 30_000,
  });
  return {
    async verify(accessToken) {
      let resolutionFailure = false;
      try {
        const { payload } = await jwtVerify(accessToken, async (...args) => {
          try { return await resolveKey(...args); }
          catch (error) {
            resolutionFailure = !(error instanceof errors.JWKSNoMatchingKey);
            throw error;
          }
        }, {
          algorithms: ['RS256'], issuer: configuration.issuer, audience: configuration.audience,
          requiredClaims: ['exp', 'sub', 'iss', 'aud'], clockTolerance: 30,
          currentDate: options.currentDate?.(),
        });
        if (payload.typ !== 'Bearer' || typeof payload.sub !== 'string' || !payload.sub.trim()) throw new AuthenticationError();
        const realm = payload.realm_access;
        const supplied = realm && typeof realm === 'object' && 'roles' in realm ? realm.roles : [];
        const roles = Array.isArray(supplied) ? [...new Set(supplied.filter((role): role is ApplicationRole => typeof role === 'string' && applicationRoles.includes(role as ApplicationRole)))] : [];
        const attribute = (value: unknown) => typeof value === 'string' ? value : null;
        return {
          subject: payload.sub, username: attribute(payload.preferred_username), name: attribute(payload.name),
          email: attribute(payload.email), roles, permissions: [],
        };
      } catch (error) {
        // Never log token, claims, URL, or the original provider exception.
        if (error instanceof AuthenticationError) throw error;
        if (error instanceof errors.JOSEError || error instanceof TypeError || (error instanceof Error && error.name === 'TimeoutError')) {
          options.diagnostic?.(resolutionFailure ? 'JWKS_UNAVAILABLE' : 'INVALID_TOKEN');
          throw new AuthenticationError();
        }
        throw error;
      }
    },
  };
}
