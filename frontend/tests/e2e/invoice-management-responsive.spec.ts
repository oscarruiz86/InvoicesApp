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
