import { SignJWT, importPKCS8 } from 'jose';
import { randomUUID } from 'node:crypto';
import type { OfflineCredentialSigner } from '../application/offline-credential';
import type { SecretReader } from '@/shared/application/secret-reader';

const issuer = 'invoice-app';
const audience = 'invoice-offline-capture';
const privateKeyCache = new Map<string, Promise<CryptoKey>>();

export function createOfflineCredentialSigner(input: { readonly keyFile: string; readonly keyId: string; readonly secrets: SecretReader }): OfflineCredentialSigner {
  async function privateKey() {
    let pending = privateKeyCache.get(input.keyFile);
    if (!pending) {
      pending = input.secrets.read(input.keyFile).then(value => importPKCS8(value, 'ES256')).catch(() => { privateKeyCache.delete(input.keyFile); throw new Error('OFFLINE_CREDENTIAL_CONFIGURATION'); });
      privateKeyCache.set(input.keyFile, pending);
    }
    return pending;
  }
  return {
    async sign(value) {
      const issuedAt = Math.floor(value.now.getTime() / 1000);
      const expiresAt = issuedAt + Math.min(8, value.ttlHours) * 3600;
      return new SignJWT({ thirdPartyId: value.thirdPartyId, assignmentIds: value.assignmentIds, scope: 'invoice:offline-capture' })
        .setProtectedHeader({ alg: 'ES256', typ: 'JWT', kid: input.keyId })
        .setIssuer(issuer).setAudience(audience).setSubject(value.subject).setJti(randomUUID())
        .setIssuedAt(issuedAt).setExpirationTime(expiresAt).sign(await privateKey());
    },
  };
}
