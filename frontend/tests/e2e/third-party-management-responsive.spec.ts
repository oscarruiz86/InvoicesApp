import { test, expect } from '@playwright/test';

const companyId = 'c'.repeat(24);

for (const width of [360, 1280]) test(`third-party screens fit ${width}px and support keyboard interaction`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/tests/e2e/third-party-management-harness.html');
  if (width <= 600) {
    await page.getByRole('button', { name: 'Abrir navegación' }).click();
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeHidden();
  } else await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Terceros' })).toBeVisible();
  if (width <= 600) await expect(page.getByRole('heading', { name: 'Tercero Andino' })).toBeVisible();
  else await expect(page.getByRole('cell', { name: 'Tercero Andino' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Ver' }).click();
  await expect(page.getByRole('heading', { name: 'Tercero Andino' })).toBeVisible();
  await page.getByLabel('ID de empresa').fill(companyId);
  await page.getByRole('button', { name: 'Consultar relación' }).click();
  const create = page.getByRole('button', { name: 'Crear relación' });
  await expect(create).toBeVisible();
  await create.click();
  const dialog = page.getByRole('dialog', { name: 'Activar relación' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null)).toBe(true);
  await dialog.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('alert')).toContainText('Cambio confirmado.');
  await expect(page.getByText('Relación activa')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.getByLabel('ID de empresa').inputValue()).toBe(companyId);
});

test('create and edit third-party profiles on the routed form', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/tests/e2e/third-party-management-harness.html');
  await page.getByRole('link', { name: 'Crear tercero' }).click();
  await expect(page.getByRole('heading', { name: 'Crear tercero' })).toBeVisible();
  const documentNumber = page.getByLabel('NIT');
  await documentNumber.fill('900123456');
  await expect(documentNumber).toHaveValue('900123456');
  await page.getByLabel('Razón social').fill('Tercero de prueba');
  await expect(documentNumber).toHaveValue('900123456');
  await page.getByLabel('Correo electrónico').fill('e2e@example.invalid');
  await expect(documentNumber).toHaveValue('900123456');
  await page.getByRole('button', { name: 'Crear tercero', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Tercero de prueba' })).toBeVisible();
  await page.getByRole('link', { name: 'Editar' }).click();
  await page.getByLabel('Ciudad').fill('Medellín');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('alert')).toContainText('Tercero actualizado correctamente.');
  await expect(page.getByText('Medellín')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
