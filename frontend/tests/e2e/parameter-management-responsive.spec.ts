import { expect, test } from '@playwright/test';

for (const width of [360, 1280]) test(`parameter administration fits ${width}px and is keyboard operable`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/tests/e2e/parameter-management-harness.html');
  await expect(page.getByRole('heading', { name: 'Parámetros funcionales' })).toBeVisible();
  await expect(page.getByText('Ventana de edición de facturas manuales').nth(width <= 600 ? 1 : 0)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole('button', { name: 'Historial' }).click();
  const history = page.getByRole('dialog', { name: /Historial:/ });
  await expect(history).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(history).toBeHidden();

  await page.getByRole('button', { name: 'Detalle' }).click();
  const detail = page.getByRole('dialog', { name: /Detalle:/ });
  await expect(detail).toBeVisible();
  await expect(detail.getByText(/Rango permitido/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(detail).toBeHidden();

  await page.getByRole('button', { name: 'Editar valor' }).click();
  const editor = page.getByRole('dialog', { name: /Editar:/ });
  await expect(editor).toBeVisible();
  await expect(editor.getByText(/El cambio se aplica también a facturas existentes/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(editor).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
