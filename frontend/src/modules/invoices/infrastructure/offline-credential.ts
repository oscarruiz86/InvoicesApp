import type { OfflineCredentialClaims, OfflineCredentialPublicJwk, OfflineCredentialRecord } from '../application/offline-invoice-ports';
export type { OfflineCredentialClaims, OfflineCredentialPublicJwk } from '../application/offline-invoice-ports';
const id = /^[a-f0-9]{24}$/;
function decodePart(value: string): unknown {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')), character => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}
function decodeBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  const result = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index++) result[index] = decoded.charCodeAt(index);
  return result;
}

export async function verifyOfflineCredential(record: OfflineCredentialRecord, publicJwks: readonly OfflineCredentialPublicJwk[], now = Date.now()): Promise<OfflineCredentialClaims | null> {
  try {
    if (record.id !== `${record.subject}:${record.thirdPartyId}` || !id.test(record.thirdPartyId) || !record.subject || record.credential.length > 8192) return null;
    const parts = record.credential.split('.');
    if (parts.length !== 3) return null;
    const header: unknown = decodePart(parts[0]);
    const claims: unknown = decodePart(parts[1]);
    if (!header || typeof header !== 'object' || !claims || typeof claims !== 'object') return null;
    const h = header as Record<string, unknown>, c = claims as Record<string, unknown>;
    const publicJwk = publicJwks.find(value => value.kid === h.kid);
    if (!publicJwk || h.alg !== 'ES256' || h.typ !== 'JWT' || c.iss !== 'invoice-app'
      || !(c.aud === 'invoice-offline-capture' || Array.isArray(c.aud) && c.aud.includes('invoice-offline-capture'))
      || c.scope !== 'invoice:offline-capture' || c.sub !== record.subject || c.thirdPartyId !== record.thirdPartyId
      || !Array.isArray(c.assignmentIds) || !c.assignmentIds.length || c.assignmentIds.length > 100 || c.assignmentIds.some(value => typeof value !== 'string' || !id.test(value))
      || !Number.isSafeInteger(c.iat) || !Number.isSafeInteger(c.exp) || !Number.isSafeInteger(now)
      || typeof c.jti !== 'string' || !c.jti || (c.iat as number) > Math.floor(now / 1000) + 60 || (c.exp as number) <= Math.floor(now / 1000)
      || (c.exp as number) - (c.iat as number) > 8 * 3600) return null;
    const assignmentIds = [...new Set(c.assignmentIds as string[])];
    if (assignmentIds.length !== c.assignmentIds.length || record.assignmentIds.length !== assignmentIds.length
      || assignmentIds.some(value => !record.assignmentIds.includes(value)) || record.assignments.length !== assignmentIds.length
      || record.assignments.some(value => !assignmentIds.includes(value.id) || value.thirdPartyId !== record.thirdPartyId || value.status !== 'ACTIVE')) return null;
    const key = await crypto.subtle.importKey('jwk', publicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, decodeBytes(parts[2]), signingInput);
    if (!valid) return null;
    const expiresAt = new Date((c.exp as number) * 1000).toISOString();
    if (Date.parse(record.expiresAt) !== Date.parse(expiresAt)) return null;
    return { sub: record.subject, thirdPartyId: record.thirdPartyId, assignmentIds, scope: 'invoice:offline-capture',
      iss: 'invoice-app', aud: 'invoice-offline-capture', iat: c.iat as number, exp: c.exp as number, jti: c.jti };
  } catch { return null; }
}

export async function findValidOfflineCredential(records: readonly OfflineCredentialRecord[], publicJwks: readonly OfflineCredentialPublicJwk[],
  now = Date.now()): Promise<{ readonly record: OfflineCredentialRecord; readonly claims: OfflineCredentialClaims } | null> {
  if (!publicJwks.length) return null;
  const valid = await Promise.all(records.map(async record => {
    const claims = await verifyOfflineCredential(record, publicJwks, now);
    return claims ? { record, claims } : null;
  }));
  return valid.filter((value): value is { record: OfflineCredentialRecord; claims: OfflineCredentialClaims } => value !== null)
    .sort((a, b) => b.record.updatedAt.localeCompare(a.record.updatedAt))[0] ?? null;
}
