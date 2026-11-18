import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const evidence = path.resolve('..', '.artifacts', 'user-invitations');

for (const width of [360, 1280]) test(`membership screen fits ${width}px and supports keyboard navigation`, async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/tests/e2e/user-invitations-harness.html');
  expect(await page.locator('body').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(244, 246, 250)');
  if (width <= 600) {
    await page.getByRole('button', { name: 'Abrir navegación' }).click();
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeHidden();
  } else {
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Asociados' })).toBeVisible();
  await expect(page.getByText('Ana Ejemplo')).toBeVisible();
  await expect(page.getByText('Documento: CC · 12345')).toBeVisible();
  await expect(page.getByText('Correo: ana@example.invalid')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(evidence, `memberships-${width}.png`), fullPage: true });

  await page.getByRole('button', { name: 'Asociar usuario' }).click();
  const inviteDialog = page.getByRole('dialog', { name: 'Asociar usuario' });
  await expect(inviteDialog).toBeVisible();
  await expect(inviteDialog.getByLabel('Correo del usuario')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(inviteDialog).toBeHidden();

  await page.getByRole('button', { name: 'Suspender', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Suspender asociado' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Estado: Activo')).toBeVisible();

  await page.getByRole('button', { name: 'Suspender', exact: true }).click();
  await dialog.getByRole('button', { name: 'Suspender', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Cambios guardados.');
  await expect(page.getByText('Suspendido')).toBeVisible();
});
