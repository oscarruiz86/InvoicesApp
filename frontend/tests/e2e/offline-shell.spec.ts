import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createVersionOneQr } from './offline-test-qr';

const subject = 'offline-shell-e2e-driver';
const thirdPartyId = '111111111111111111111111';
const assignmentId = '222222222222222222222222';

function signedCredential() {
  const keyMaterial = JSON.parse(readFileSync(new URL('../../test-results/offline-shell-e2e-key.json', import.meta.url), 'utf8')) as { jwks: string; privateKeyPem: string };
  const privateKey = keyMaterial.privateKeyPem;
  const issuedAt = Math.floor(Date.now() / 1000), expiresAt = issuedAt + 3 * 60 * 60;
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'ES256', typ: 'JWT', kid: 'offline-shell-e2e-v1' });
  const payload = encode({ iss: 'invoice-app', aud: 'invoice-offline-capture', sub: subject, thirdPartyId, assignmentIds: [assignmentId],
    scope: 'invoice:offline-capture', iat: issuedAt, exp: expiresAt, jti: 'offline-shell-e2e-ticket' });
  const signingInput = `${header}.${payload}`;
  const signature = sign('sha256', Buffer.from(signingInput), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  const jwk = (JSON.parse(keyMaterial.jwks) as { keys?: Array<Record<string, string>> }).keys?.[0];
  if (!jwk || !verify('sha256', Buffer.from(signingInput), { key: createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')))
    throw new Error('The temporary offline signing key does not match the public JWKS');
  const derivedJwk = createPublicKey(createPrivateKey(privateKey)).export({ format: 'jwk' });
  if (derivedJwk.x !== jwk.x || derivedJwk.y !== jwk.y) throw new Error('The temporary offline signing key pair does not match');
  return { credential: `${signingInput}.${signature}`, expiresAt: new Date(expiresAt * 1000).toISOString(), jwks: keyMaterial.jwks };
}

async function qrImage(page: import('@playwright/test').Page, text: string) {
  const matrix = createVersionOneQr(text);
  const base64 = await page.evaluate(modules => {
    const quietZone = 4, scale = 10, side = (modules.length + quietZone * 2) * scale;
    const canvas = document.createElement('canvas'); canvas.width = side; canvas.height = side;
    const context = canvas.getContext('2d')!; context.fillStyle = '#fff'; context.fillRect(0, 0, side, side);
    context.fillStyle = '#000';
    modules.forEach((row, y) => row.forEach((dark, x) => { if (dark) context.fillRect((x + quietZone) * scale, (y + quietZone) * scale, scale, scale); }));
    return canvas.toDataURL('image/png').split(',')[1];
  }, matrix);
  return { name: 'offline-invoice-qr.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}

test('switches offline and online, and keeps real QR scanning after an offline reload', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await page.goto('/tests/e2e/offline-shell-harness.html');
  const ticket = signedCredential();
  await page.evaluate(async value => window.offlineShellE2e.seedCredential(value.credential, value.expiresAt, value.jwks), ticket);
  const validCredential = await page.evaluate(() => window.offlineShellE2e.hasValidCredential());
  expect(validCredential).toBe(true);
  await page.evaluate(() => window.offlineShellE2e.preloadQrReader());

  await page.goto('/');
  await page.waitForFunction(() => document.querySelector('#root')?.childElementCount);
  await context.setOffline(true);
  await expect(page.getByRole('heading', { name: 'Captura offline de facturas' })).toBeVisible();

  const scanAndSave = async (expectedCount: number) => {
    await page.getByRole('combobox', { name: 'Tipo de captura' }).click();
    await page.getByRole('option', { name: 'Código QR' }).click();
    await page.getByRole('combobox', { name: 'Asignación disponible' }).click();
    await page.getByRole('option', { name: /ABC123/ }).click();
    await page.getByRole('button', { name: 'Leer imagen QR' }).locator('input').setInputFiles(await qrImage(page, 'OFFLINEQR01'));
    await expect(page.getByRole('textbox', { name: 'Contenido QR capturado' })).toHaveValue('OFFLINEQR01');
    await page.getByRole('button', { name: 'Guardar en este dispositivo' }).click();
    await expect(page.getByText(new RegExp(`Registros locales \\(${expectedCount}\\)`))).toBeVisible();
  };

  await scanAndSave(1);
  await expect(page.getByText(/Factura QR · Pendiente de envío/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Captura offline de facturas' })).toBeVisible();
  await expect(page.getByText(/Factura QR · Pendiente de envío/)).toBeVisible();
  await scanAndSave(2);
  await expect(page.getByText(/Factura QR · Pendiente de envío/)).toHaveCount(2);

  const onlineReload = page.waitForEvent('load');
  await context.setOffline(false);
  await onlineReload;
  await expect(page.getByRole('heading', { name: 'Captura offline de facturas' })).toBeHidden();
});
