import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const evidence = path.resolve('..', '.artifacts', 'company-management');

for (const width of [360, 1280]) test(`company screens fit ${width}px and remain keyboard accessible`, async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/tests/e2e/company-management-harness.html');
  await expect(page.getByRole('heading', { name: 'Empresas' })).toBeVisible();
  await expect(page.getByLabel('Buscar por nombre o documento')).toBeVisible();
  await expect(page.getByText('Empresa de prueba')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(evidence, `companies-${width}.png`), fullPage: true });

  await page.getByRole('link', { name: 'Ver empresa' }).click();
  await page.getByRole('button', { name: 'Desactivar empresa' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Activa', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Volver a empresas' }).click();
  await page.getByRole('link', { name: 'Crear empresa' }).click();
  await page.getByRole('button', { name: 'Guardar empresa' }).click();
  await expect(page.getByRole('alert')).toContainText('Revisa los campos indicados.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(evidence, `company-form-${width}.png`), fullPage: true });
});
