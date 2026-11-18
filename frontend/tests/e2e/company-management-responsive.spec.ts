import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const evidence = path.resolve('..', '.artifacts', 'company-management');

for (const width of [360, 1280]) test(`company screens fit ${width}px and remain keyboard accessible`, async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/tests/e2e/company-management-harness.html');
  expect(await page.locator('body').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(244, 246, 250)');
  if (width <= 600) {
    await page.getByRole('button', { name: 'Abrir navegación' }).click();
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeHidden();
  } else {
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Empresas' })).toBeVisible();
  await page.getByRole('button', { name: 'Filtro' }).click();
  const filters = page.getByRole('dialog', { name: 'Filtros de empresas' });
  await expect(filters.getByLabel('Buscar por nombre o documento')).toBeVisible();
  await filters.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByText('Empresa de prueba')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(evidence, `companies-${width}.png`), fullPage: true });

  await page.getByRole('button', { name: 'Desactivar', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Desactivar empresa' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Activa', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Editar', exact: true }).click();
  const editDialog = page.getByRole('dialog', { name: 'Editar empresa' });
  await expect(editDialog).toBeVisible();
  await editDialog.getByRole('button', { name: 'Guardar empresa' }).click();
  await expect(page.getByRole('alert')).toContainText('Empresa actualizada correctamente.');
  await page.getByRole('button', { name: 'Crear empresa' }).click();
  const createDialog = page.getByRole('dialog', { name: 'Crear empresa' });
  const save = createDialog.getByRole('button', { name: 'Guardar empresa' });
  await expect(save).toBeDisabled();
  await createDialog.getByLabel('Número de documento').fill('900123456');
  await createDialog.getByLabel('Razón social').fill('Empresa de prueba E2E');
  await createDialog.getByLabel('Correo electrónico').fill('e2e@example.invalid');
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByRole('alert')).toContainText('Empresa creada correctamente.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(evidence, `company-form-${width}.png`), fullPage: true });
});
