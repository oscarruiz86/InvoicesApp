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

  await expect(page.getByRole('heading', { name: 'Conductores' })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: 'Ana Ruiz' });
  await expect(row).toBeVisible();
  await expect(row.getByRole('link', { name: 'Ana Ruiz' })).toHaveAttribute('href', '/drivers/1123456789abcdef01234567');
  await expect(row.getByRole('button', { name: 'Editar' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await row.getByRole('link', { name: 'Ana Ruiz' }).click();
  await expect(page.getByRole('heading', { name: 'Detalle del conductor' })).toBeFocused();
  await expect(page.getByText('Identidad canónica · solo lectura')).toBeVisible();
  await expect(page.getByText('ana@example.invalid')).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole('button', { name: 'Desactivar conductor' }).click();
  const dialog = page.getByRole('dialog', { name: 'Desactivar conductor' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null)).toBe(true);
  await dialog.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('alert')).toContainText('Conductor desactivado correctamente.');
  await expect(page.getByText('Inactivo')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('direct driver URL shows only scoped read-only identity', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/tests/e2e/driver-management-harness.html#/drivers/1123456789abcdef01234567');
  await expect(page.getByRole('heading', { name: 'Detalle del conductor' })).toBeVisible();
  await expect(page.getByText('CC-1234')).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
