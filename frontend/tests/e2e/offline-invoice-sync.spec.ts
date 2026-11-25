import { expect, test } from '@playwright/test';

test('stores a manual invoice while offline and restores it from IndexedDB', async ({ page, context }) => {
  const apiRequests: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url()); });
  await page.goto('/tests/e2e/offline-invoice-harness.html');
  await expect(page.getByRole('heading', { name: 'Captura offline de facturas' })).toBeVisible();
  await context.setOffline(true);
  await expect(page.evaluate(() => navigator.onLine)).resolves.toBe(false);

  await page.getByRole('combobox', { name: 'Asignación disponible' }).click();
  await page.getByRole('option', { name: /ABC123/ }).click();
  await page.getByLabel('Fecha de factura').fill('2026-11-20');
  await page.getByLabel('Hora').fill('12:30');
  await page.getByLabel('Número de factura').fill('FAC-OFFLINE-E2E');
  await page.getByLabel('NIT del emisor').fill('900123456');
  await page.getByLabel('Documento del adquiriente').fill('900654321');
  await page.getByLabel('Valor antes de impuestos').fill('100');
  await page.getByLabel('Total').fill('119');
  await page.getByLabel('Adjuntar imagen de factura').setInputFiles({ name: 'invoice.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('test image') });
  await page.getByRole('button', { name: 'Guardar en este dispositivo' }).click();
  await expect(page.getByRole('status')).toContainText('Aún no está registrado en el servidor.');
  expect(apiRequests).toEqual([]);

  const reload = page.waitForEvent('load');
  await context.setOffline(false);
  await reload;
  await expect(page.getByText(/Factura FAC-OFFLINE-E2E · Pendiente de envío/)).toBeVisible();
});

test('captures a QR offline without claiming local authenticity and preserves its raw content', async ({ page, context }) => {
  await page.goto('/tests/e2e/offline-invoice-harness.html');
  await context.setOffline(true);
  await page.getByRole('combobox', { name: 'Tipo de captura' }).click();
  await page.getByRole('option', { name: 'Código QR' }).click();
  await page.getByRole('combobox', { name: 'Asignación disponible' }).click();
  await page.getByRole('option', { name: /ABC123/ }).click();
  await page.getByRole('button', { name: 'Abrir cámara' }).click();
  const content = 'contenido QR E2E sin formato, pendiente de validación del servidor';
  await expect(page.getByRole('textbox', { name: 'Contenido QR capturado' })).toHaveValue(content);
  await expect(page.getByText(/se conservará sin validar localmente/)).toBeVisible();
  await page.getByRole('button', { name: 'Guardar en este dispositivo' }).click();
  await expect(page.getByRole('status')).toContainText('Aún no está registrado en el servidor.');

  const reload = page.waitForEvent('load');
  await context.setOffline(false);
  await reload;
  await expect(page.getByText(/Factura QR · Pendiente de envío/)).toBeVisible();
});
