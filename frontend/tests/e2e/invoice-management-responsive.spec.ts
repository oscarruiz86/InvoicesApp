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
  await page.getByRole('button', { name: 'Registrar factura' }).click();
  const manualDialog = page.getByRole('dialog', { name: 'Registrar factura manual' });
  await manualDialog.getByRole('button', { name: 'Registrar desde QR' }).click();
  const dialog = page.getByRole('dialog', { name: 'Registrar factura desde QR' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null)).toBe(true);
  await page.getByRole('button', { name: 'Abrir cámara' }).click();
  await expect(dialog.getByRole('textbox', { name: 'Número de factura' })).toHaveValue('QR-E2E-1');
  await expect(dialog.getByText(/no acredita autenticidad fiscal/i)).toBeVisible();
  await dialog.getByLabel('Vehículo y asignación').click();
  await page.getByRole('option', { name: /ABC123/ }).click();
  await expect(dialog.getByRole('textbox', { name: 'Número de factura' })).toHaveAttribute('readonly');
  await dialog.getByLabel('Adjunto opcional de la factura').setInputFiles({ name: 'adjunto.png', mimeType: 'image/png', buffer: Buffer.from('separate attachment') });
  await dialog.getByRole('button', { name: 'Confirmar registro' }).dblclick();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Factura registrada desde QR.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('third-party admin links a duplicate with an explicit reason', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/tests/e2e/invoice-management-harness.html?admin=duplicate');
  await expect(page.getByText('Causas: Factura duplicada')).toBeVisible();
  await page.getByRole('button', { name: /Vincular con FAC-E2E-1/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Resolver conflicto' });
  await dialog.getByLabel('Motivo de la decisión').fill('La factura ya estaba registrada.');
  await dialog.getByRole('button', { name: 'Vincular factura' }).click();
  await expect(page.getByText('Decisión registrada con auditoría.')).toBeVisible();
  await expect(page.getByText('No hay conflictos pendientes para este tercero.')).toBeVisible();
});

test('third-party admin approves a closed assignment after reviewing its image', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/tests/e2e/invoice-management-harness.html?admin=1');
  await expect(page.getByText('Causas: Asignación cerrada')).toBeVisible();
  await page.getByRole('button', { name: 'Revisar imagen' }).click();
  await expect(page.getByRole('dialog', { name: 'Imagen del registro en conflicto' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar' }).last().click();
  await page.getByRole('button', { name: 'Aprobar asignación cerrada' }).click();
  const dialog = page.getByRole('dialog', { name: 'Resolver conflicto' });
  await dialog.getByLabel('Motivo de la decisión').fill('Revisé la factura, imagen e intervalo histórico.');
  await dialog.getByRole('button', { name: 'Aprobar excepción' }).click();
  await expect(page.getByText('Decisión registrada con auditoría.')).toBeVisible();
});

test('third-party admin can reject a conflict and stale decisions require refresh', async ({ page }) => {
  await page.goto('/tests/e2e/invoice-management-harness.html?admin=reject');
  await page.getByRole('button', { name: 'Rechazar', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Resolver conflicto' });
  await dialog.getByLabel('Motivo de la decisión').fill('No corresponde al tercero.');
  await dialog.getByRole('button', { name: 'Rechazar registro' }).click();
  await expect(page.getByText('Decisión registrada con auditoría.')).toBeVisible();

  await page.goto('/tests/e2e/invoice-management-harness.html?admin=stale');
  await page.getByRole('button', { name: 'Aprobar asignación cerrada' }).click();
  dialog = page.getByRole('dialog', { name: 'Resolver conflicto' });
  await dialog.getByLabel('Motivo de la decisión').fill('Intento con versión obsoleta.');
  await dialog.getByRole('button', { name: 'Aprobar excepción' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'El conflicto cambió mientras lo revisabas.' })).toBeVisible();
});
