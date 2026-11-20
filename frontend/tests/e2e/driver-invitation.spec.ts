import { test, expect, type Page } from '@playwright/test';
const token = 'D'.repeat(43);

async function verifyProvisionedDriver(page: Page) {
  await page.getByRole('button', { name: 'Ver mis conductores' }).click();
  await expect(page.getByRole('heading', { name: 'Conductores', exact: true })).toBeVisible();
  const card = page.getByRole('heading', { name: 'Camila Conductora', exact: true }).locator('..');
  await expect(card).toBeVisible();
  await expect(card).toContainText('CC · 87654321');
  await expect(page.getByRole('button', { name: 'Editar', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Desactivar', exact: true })).toHaveCount(0);
  await card.getByRole('button', { name: 'Ver', exact: true }).click();
  const detail = page.getByRole('dialog', { name: 'Detalle del conductor' });
  await expect(detail).toBeVisible();
  await expect(detail).toContainText('Camila Conductora');
  await expect(detail).toContainText('CC · 87654321');
  await expect(detail.getByRole('textbox')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('accepting a DRIVER invitation reveals the provisioned read-only driver record', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto(`/tests/e2e/driver-invitation-harness.html#token=${token}`);
  await expect(page.getByText('Transportes Andinos te invita a vincularte a su organización.')).toBeVisible();
  await expect(page.getByText('Roles: Conductor')).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Aceptar invitación' }).click();
  await expect(page.getByText('Invitación aceptada. Tu registro de conductor ya está disponible en esta organización.')).toBeVisible();
  await verifyProvisionedDriver(page);
});

test('accepting a received DRIVER invitation reveals its provisioned record', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/tests/e2e/driver-invitation-harness.html?screen=received');
  await expect(page.getByRole('heading', { name: 'Mis invitaciones' })).toBeVisible();
  await expect(page.getByText('Transportes Andinos')).toBeVisible();
  await page.getByRole('button', { name: 'Aceptar invitación' }).click();
  await expect(page.getByText('Aceptaste la invitación de Transportes Andinos. Tu registro de conductor ya está disponible.')).toBeVisible();
  await verifyProvisionedDriver(page);
});
