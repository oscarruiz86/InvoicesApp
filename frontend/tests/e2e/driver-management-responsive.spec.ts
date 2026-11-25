import { test, expect } from '@playwright/test';

for (const width of [360, 1280]) test(`driver list and detail fit ${width}px and support keyboard status changes`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/tests/e2e/driver-management-harness.html');
  if (width <= 600) {
    await page.getByRole('button', { name: 'Abrir navegación' }).click();
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeHidden();
  } else await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Conductores', exact: true })).toBeVisible();
  const record = width <= 600 ? page.getByRole('heading', { name: 'Ana Ruiz' }).locator('..') : page.getByRole('row').filter({ hasText: 'Ana Ruiz' });
  await expect(record).toBeVisible();
  await expect(record.getByText(/CC · 1234/)).toBeVisible();
  await expect(record.getByRole('button', { name: 'Editar' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await record.getByRole('button', { name: 'Ver', exact: true }).click();
  const detail = page.getByRole('dialog', { name: 'Detalle del conductor' });
  await expect(detail).toBeVisible();
  await expect(detail).toContainText('Ana Ruiz');
  await expect(detail).toContainText('ana@example.invalid');
  await expect(detail).toContainText('CC · 1234');
  await expect(detail.getByRole('textbox')).toHaveCount(0);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(detail).toBeHidden();
  await expect(record.getByRole('button', { name: 'Ver', exact: true })).toBeFocused();

  await record.getByRole('button', { name: 'Desactivar', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Desactivar conductor' });
  await expect(confirmation).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  await confirmation.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('alert')).toContainText('Conductor desactivado correctamente.');
  await expect(page.getByText('Inactivo', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('direct driver URL shows only scoped read-only identity', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/tests/e2e/driver-management-harness.html#/drivers/1123456789abcdef01234567');
  await expect(page.getByRole('heading', { name: 'Detalle del conductor' })).toBeVisible();
  await expect(page.getByText('CC · 1234')).toBeVisible();
  await expect(page.getByText('ana@example.invalid')).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
