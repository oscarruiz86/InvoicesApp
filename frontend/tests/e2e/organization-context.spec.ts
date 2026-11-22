import { expect, test } from '@playwright/test';

test('validates A to B selection and clears private data from the prior context', async ({ page }) => {
  await page.goto('/tests/e2e/organization-context-harness.html#/organizations/select');
  await page.getByRole('button', { name: 'Seleccionar Empresa A' }).click();
  await expect(page.getByText('Empresa A: datos privados')).toBeVisible();
  await page.getByRole('button', { name: 'Cambiar organización' }).click();
  await expect(page.getByText('Empresa A: datos privados')).toHaveCount(0);
  await page.getByRole('button', { name: 'Seleccionar Empresa B' }).click();
  await expect(page.getByText('Contexto: Empresa B (Empresa)').first()).toBeVisible();
  await expect(page.getByText('Empresa B: datos privados')).toBeVisible();
});

test('ignores a late B resolution after the user selects C', async ({ page }) => {
  await page.goto('/tests/e2e/organization-context-harness.html?late=bbbbbbbbbbbbbbbbbbbbbbbb#/session');
  await page.getByRole('button', { name: 'Probar respuesta tardía B frente a C' }).click();
  await expect(page.getByText('Contexto: Empresa C (Empresa)').first()).toBeVisible();
  await page.waitForTimeout(400);
  await expect(page.getByText('Contexto: Empresa B (Empresa)')).toHaveCount(0);
  await expect(page.getByText('Empresa C: datos privados')).toBeVisible();
});

test('keeps an unavailable organization out of the active context', async ({ page }) => {
  await page.goto('/tests/e2e/organization-context-harness.html?reject=aaaaaaaaaaaaaaaaaaaaaaaa#/organizations/select');
  await page.getByRole('button', { name: 'Seleccionar Empresa A' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('Empresa A: datos privados')).toHaveCount(0);
});
