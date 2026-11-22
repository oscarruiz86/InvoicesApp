import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const evidence = path.resolve('..', '.artifacts', 'invoice-management');

for (const width of [360, 1280]) test(`invoice screens fit ${width}px and support keyboard use`, async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/tests/e2e/invoice-management-harness.html');
  await expect(page.getByRole('heading', { name: 'Facturas' })).toBeVisible();
  await expect(width <= 600 ? page.getByText('FAC-E2E-1').last() : page.getByText('FAC-E2E-1').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(evidence, `invoices-${width}.png`), fullPage: true });
  await page.getByRole('button', { name: 'Registrar factura' }).click();
  const dialog = page.getByRole('dialog', { name: 'Registrar factura manual' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

for (const width of [360, 1280]) test(`QR capture review and confirmation fit ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/tests/e2e/invoice-management-harness.html');
  await page.getByRole('button', { name: 'Registrar desde QR' }).click();
  const dialog = page.getByRole('dialog', { name: 'Registrar factura desde QR' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null)).toBe(true);
  await page.getByRole('button', { name: 'Abrir cámara' }).click();
  await expect(dialog.getByRole('textbox', { name: 'Número de factura' })).toHaveValue('QR-E2E-1');
  await expect(dialog.getByText(/no acredita autenticidad fiscal/i)).toBeVisible();
  await dialog.getByLabel('Vehículo y asignación propia').click();
  await page.getByRole('option', { name: /ABC123/ }).click();
  await expect(dialog.getByRole('textbox', { name: 'Número de factura' })).toHaveAttribute('readonly');
  await dialog.getByLabel('Adjunto opcional de la factura').setInputFiles({ name: 'adjunto.png', mimeType: 'image/png', buffer: Buffer.from('separate attachment') });
  await dialog.getByRole('button', { name: 'Confirmar registro' }).dblclick();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Factura registrada desde QR.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
