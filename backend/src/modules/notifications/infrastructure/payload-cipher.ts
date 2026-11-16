import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { EncryptedPayload } from '../domain/notification';
import type { PayloadCipher, PayloadKeyringConfiguration, SecretReader } from '../application/ports';
function keyBytes(secret: string): Buffer {
  const value = secret.trim(); const key = /^[a-f\d]{64}$/i.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('INVALID_ENCRYPTION_KEY'); return key;
}
export function createAesPayloadCipher(secrets: SecretReader, configuration: string | PayloadKeyringConfiguration): PayloadCipher {
  const keyring = typeof configuration === 'string' ? { activeVersion: 1, keyFiles: { 1: configuration } } : configuration;
  const keys = new Map<number, Promise<Buffer>>();
  const key = (version: number) => {
    const reference = keyring.keyFiles[version];
    if (!reference) throw new Error('UNSUPPORTED_ENCRYPTION_KEY_VERSION');
    let value = keys.get(version);
    if (!value) { value = secrets.read(reference).then(keyBytes); keys.set(version, value); value.catch(() => keys.delete(version)); }
    return value;
  };
  return {
    async prepare() { await key(keyring.activeVersion); },
    async encrypt(value) { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', await key(keyring.activeVersion), iv);
      const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
      return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), keyVersion: keyring.activeVersion }; },
    async decrypt<T>(value: EncryptedPayload) { const decipher = createDecipheriv('aes-256-gcm', await key(value.keyVersion), Buffer.from(value.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8')) as T; },
  };
}