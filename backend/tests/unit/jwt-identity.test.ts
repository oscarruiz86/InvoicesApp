import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createLocalJWKSet, createRemoteJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload, type JWK } from 'jose';
import { createServer } from 'node:http';
import { createJwtIdentityVerifier } from '@/modules/identity/infrastructure/keycloak/jwt-identity-verifier';
import { AuthenticationError } from '@/modules/identity/application/authentication-error';

const configuration = { issuer: 'https://identity.example.invalid/realms/invoices', audience: 'invoices-api', jwksUrl: 'https://identity.example.invalid/certs' };
let key: CryptoKey; let otherKey: CryptoKey; let offlineKey: CryptoKey; let jwk: JWK; let otherJwk: JWK;
const now = Math.floor(Date.now() / 1000);
const claims = { iss: configuration.issuer, aud: configuration.audience, sub: 'subject-1', exp: now + 300, typ: 'Bearer' };
beforeAll(async () => {
  const first = await generateKeyPair('RS256'); const second = await generateKeyPair('RS256');
  const offline = await generateKeyPair('ES256');
  key = first.privateKey; otherKey = second.privateKey; offlineKey = offline.privateKey;
  jwk = { ...await exportJWK(first.publicKey), kid: 'first', alg: 'RS256' };
  otherJwk = { ...await exportJWK(second.publicKey), kid: 'second', alg: 'RS256' };
});
const sign = (payload: JWTPayload, privateKey = key, kid = 'first') => new SignJWT(payload).setProtectedHeader({ alg: 'RS256', kid }).sign(privateKey);
const verifier = () => createJwtIdentityVerifier(configuration, { resolveKey: createLocalJWKSet({ keys: [jwk] }), currentDate: () => new Date(now * 1000) });

describe('verified access token', () => {
  it('accepts string/array audience and exposes only known unique realm roles', async () => {
    for (const aud of ['invoices-api', ['another-api', 'invoices-api']]) {
      const actor = await verifier().verify(await sign({ ...claims, aud, preferred_username: 'driver', name: 'Test Driver', email: 'driver@example.invalid', realm_access: { roles: ['DRIVER', 'DRIVER', 'offline_access', 'invented'] } }));
      expect(actor).toEqual({ subject: 'subject-1', username: 'driver', name: 'Test Driver', email: 'driver@example.invalid', roles: ['DRIVER'], permissions: [] });
    }
  });
  it('accepts a partial profile with no roles', async () => {
    expect(await verifier().verify(await sign(claims))).toMatchObject({ username: null, name: null, email: null, roles: [] });
    const roles = ['APP_ADMIN', 'COMPANY_ADMIN', 'THIRD_PARTY_ADMIN', 'DRIVER'];
    expect((await verifier().verify(await sign({ ...claims, realm_access: { roles } }))).roles).toEqual(roles);
  });
  it.each([
    { exp: now - 31 }, { exp: undefined }, { exp: 'invalid' }, { sub: '' }, { sub: ' ' }, { sub: undefined },
    { iss: 'https://untrusted.invalid' }, { aud: 'invoices-web' }, { aud: undefined, azp: 'invoices-api' },
    { nbf: now + 31 }, { typ: 'ID' }, { typ: 'Refresh' }, { typ: undefined },
  ])('rejects invalid claims without exposing them', async overrides => {
    await expect(verifier().verify(await sign({ ...claims, ...overrides } as JWTPayload))).rejects.toBeInstanceOf(AuthenticationError);
  });
  it('bounds clock tolerance and rejects wrong signature or algorithm', async () => {
    await expect(verifier().verify(await sign({ ...claims, exp: now - 29 }))).resolves.toMatchObject({ subject: 'subject-1' });
    await expect(verifier().verify(await sign(claims, otherKey))).rejects.toBeInstanceOf(AuthenticationError);
    const hs = await new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).sign(new Uint8Array(32));
    await expect(verifier().verify(hs)).rejects.toBeInstanceOf(AuthenticationError);
    await expect(verifier().verify(`${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.`)).rejects.toBeInstanceOf(AuthenticationError);
  });
  it('rejects an ES256 offline capture ticket as an API bearer credential', async () => {
    const ticket = await new SignJWT({ scope: 'invoice:offline-capture', thirdPartyId: 'f'.repeat(24), assignmentIds: ['a'.repeat(24)] })
      .setProtectedHeader({ alg: 'ES256', typ: 'JWT', kid: 'offline-v1' })
      .setIssuer('invoice-app').setAudience('invoice-offline-capture').setSubject('subject-1')
      .setIssuedAt(now).setExpirationTime(now + 8 * 3600).sign(offlineKey);
    await expect(verifier().verify(ticket)).rejects.toBeInstanceOf(AuthenticationError);
  });
  it('does not use a jku or x5u supplied by a token', async () => {
    const token = await new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'first', jku: 'https://untrusted.invalid/jwks', x5u: 'https://untrusted.invalid/key' }).sign(key);
    const network = vi.spyOn(globalThis, 'fetch');
    await expect(verifier().verify(token)).resolves.toMatchObject({ subject: 'subject-1' });
    expect(network).not.toHaveBeenCalled();
  });
});

describe('JWKS rotation and recovery', () => {
  it('caches, rotates after cooldown, fails closed and recovers after an outage', async () => {
    let clock = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
    let keys = [jwk]; let requests = 0; let available = true; let hang = false;
    const server = createServer((_req, res) => {
      requests++;
      if (hang) return;
      res.writeHead(available ? 200 : 503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ keys }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error();
    const url = new URL(`http://127.0.0.1:${address.port}/certs`);
    const resolveKey = createRemoteJWKSet(url, { cooldownDuration: 1000, cacheMaxAge: 10_000, timeoutDuration: 1000 });
    const diagnostic = vi.fn();
    const verify = createJwtIdentityVerifier(configuration, { resolveKey, diagnostic });
    try {
      const token = await sign(claims);
      await verify.verify(token); await verify.verify(token); expect(requests).toBe(1);
      await expect(verify.verify(await sign(claims, otherKey, 'unknown'))).rejects.toBeInstanceOf(AuthenticationError);
      expect(requests).toBe(1); expect(diagnostic).toHaveBeenLastCalledWith('INVALID_TOKEN');
      available = false; await verify.verify(token); expect(requests).toBe(1);
      available = true; keys = [jwk, otherJwk];
      clock += 1001;
      await verify.verify(await sign(claims, otherKey, 'second')); expect(requests).toBe(2);
      available = false; clock += 10_001;
      await expect(verify.verify(token)).rejects.toBeInstanceOf(AuthenticationError);
      expect(diagnostic).toHaveBeenLastCalledWith('JWKS_UNAVAILABLE');
      available = true; await verify.verify(token);
      const uncached = createJwtIdentityVerifier(configuration, { resolveKey: createRemoteJWKSet(url, { timeoutDuration: 100 }) });
      hang = true; await expect(uncached.verify(token)).rejects.toBeInstanceOf(AuthenticationError);
      hang = false; await uncached.verify(token);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
