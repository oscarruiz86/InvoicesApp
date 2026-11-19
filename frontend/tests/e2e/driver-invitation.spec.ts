import { test, expect } from '@playwright/test';

const token = 'D'.repeat(43);
test('accepting a DRIVER invitation reveals the provisioned read-only driver record', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto(`/tests/e2e/driver-invitation-harness.html#token=${token}`);
  await expect(page.getByText('Transportes Andinos te invita a vincularte a su organización.')).toBeVisible();
  await expect(page.getByText('Roles: Conductor')).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Aceptar invitación' }).click();
  await expect(page.getByText('Invitación aceptada. Tu registro de conductor ya está disponible en esta organización.')).toBeVisible();
  await page.getByRole('button', { name: 'Ver mis conductores' }).click();
  await expect(page.getByRole('heading', { name: 'Conductores' })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: 'Camila Conductora' });
  await expect(row).toBeVisible();
  await expect(row.getByText('CC-87654321')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar' })).toHaveCount(0);
  await row.getByRole('link', { name: 'Camila Conductora' }).click();
  await expect(page.getByRole('heading', { name: 'Detalle del conductor' })).toBeVisible();
  await expect(page.getByText('Identidad canónica · solo lectura')).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Editar' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('accepting a received DRIVER invitation reveals its provisioned record', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/tests/e2e/driver-invitation-harness.html?screen=received');
  await expect(page.getByRole('heading', { name: 'Mis invitaciones' })).toBeVisible();
  await expect(page.getByText('Transportes Andinos')).toBeVisible();
  await page.getByRole('button', { name: 'Aceptar invitación' }).click();
  await expect(page.getByText('Aceptaste la invitación de Transportes Andinos. Tu registro de conductor ya está disponible.')).toBeVisible();
  await page.getByRole('button', { name: 'Ver mis conductores' }).click();
  await expect(page.getByRole('heading', { name: 'Conductores' })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: 'Camila Conductora' });
  await expect(row).toBeVisible();
  await expect(row.getByText('CC-87654321')).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Editar' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
