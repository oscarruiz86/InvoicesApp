import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const evidence = path.resolve('..', '.artifacts', 'user-invitations');

for (const width of [360, 1280]) test(`membership screen fits ${width}px and supports keyboard navigation`, async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/tests/e2e/user-invitations-harness.html');
  await expect(page.getByRole('heading', { name: 'Usuarios vinculados' })).toBeVisible();
  await expect(page.getByText('Ana Ejemplo')).toBeVisible();
  await expect(page.getByText('Documento: CC · 12345')).toBeVisible();
  await expect(page.getByText('Correo: ana@example.invalid')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(evidence, `memberships-${width}.png`), fullPage: true });

  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.textContent?.trim())).toBe('Invitar usuario');
  const confirmation = page.waitForEvent('dialog');
  const clickSuspension = page.getByRole('button', { name: 'Suspender' }).click();
  const dialog = await confirmation;
  expect(dialog.message()).toContain('Suspender esta pertenencia');
  await dialog.accept();
  await clickSuspension;
  await expect(page.getByRole('alert')).toContainText('Cambios guardados.');
  await expect(page.getByText('Suspendido')).toBeVisible();
});
