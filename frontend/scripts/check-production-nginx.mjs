import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const config = await readFile(resolve(process.cwd(), 'nginx/default.conf.template'), 'utf8');
for (const header of ['Content-Security-Policy', 'X-Content-Type-Options nosniff', 'X-Frame-Options DENY', 'Referrer-Policy strict-origin-when-cross-origin'])
  assert(config.includes(header), `Missing required web security header: ${header}`);
assert(config.includes("frame-src 'self' https://auth.oarg.casa"), 'CSP must allow the app callback and Keycloak in the silent authentication frame');
assert(config.includes("location = /silent-check-sso.html"), 'The silent SSO callback needs a scoped framing policy');
assert(config.includes("frame-ancestors 'self'"), 'The silent SSO callback must be frameable by the app origin');
assert(config.includes('camera=(self)'), 'Camera access for the invoice QR scanner must remain available on this origin');
assert(!/script-src[^;]*unsafe-(?:inline|eval)/.test(config), 'CSP must not enable inline script or eval');
assert(config.includes('server_tokens off;'));
assert(config.includes('proxy_pass http://backend:3000;'));
console.log('Production Nginx security header and proxy policy check passed.');
