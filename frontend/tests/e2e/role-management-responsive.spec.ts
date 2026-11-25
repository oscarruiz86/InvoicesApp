import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const evidence = path.resolve('..', '.artifacts', 'role-management');

test('shows only the selected role matrix', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/tests/e2e/role-management-harness.html');
  await expect(page.getByRole('tabpanel')).toHaveCount(1);
  await expect(page.getByRole('tabpanel', { name: 'Administrador global' })).toBeVisible();
  await page.getByRole('tab', { name: 'Administrador de empresa' }).click();
  await expect(page.getByRole('tabpanel')).toHaveCount(1);
  await expect(page.getByRole('tabpanel', { name: 'Administrador de empresa' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /companies:read en ámbito Global para Administrador global/ })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /companies:read en ámbito Empresa para Administrador de empresa/ })).toBeVisible();
});

for (const width of [360, 1280]) test(`role management fits ${width}px, supports keyboard editing and refreshes authorization`, async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/tests/e2e/role-management-harness.html');
  await expect(page.getByRole('heading', { name: 'Roles y permisos' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /roles:read/ })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (width <= 600) {
    await page.getByRole('button', { name: 'Abrir navegación' }).click();
    const navigation = page.getByRole('navigation', { name: 'Navegación principal' });
    await expect(navigation).toBeVisible();
    await expect(navigation.getByRole('link', { name: 'Roles y permisos' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(navigation).toBeHidden();
  } else await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();

  const optional = page.getByRole('checkbox', { name: /companies:read en ámbito Global para Administrador global/ });
  await optional.focus();
  await page.keyboard.press('Space');
  await expect(optional).not.toBeChecked();
  const companyAdminTab = page.getByRole('tab', { name: 'Administrador de empresa' });
  await companyAdminTab.click();
  await page.getByRole('button', { name: 'Demorar próxima respuesta del servicio' }).click();
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirmar cambio de permisos' });
  await expect(dialog).toContainText(/Vas a reemplazar toda la matriz/);
  await expect(dialog).toContainText('La versión vigente es 1.');
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
  await expect(companyAdminTab).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => (window as typeof window & { rolePolicyHarness: { replaceCalls(): number } }).rolePolicyHarness.replaceCalls())).toBe(0);
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar cambio' }).click();
  await expect(dialog.getByRole('status')).toContainText('Guardando cambios…');
  await expect(dialog.getByRole('progressbar', { name: 'Guardando cambios' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await page.evaluate(() => (window as typeof window & { rolePolicyHarness: { releasePendingSave(): void } }).rolePolicyHarness.releasePendingSave());
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status')).toContainText('La política se actualizó correctamente. Versión confirmada: 2.');
  await expect(companyAdminTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Administrador de empresa' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Empresas' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(evidence, `roles-${width}.png`), fullPage: true });

  await page.getByRole('button', { name: 'Cambiar a contexto organizacional' }).click();
  await expect(page.getByText(/solo está disponible en el contexto GLOBAL/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Roles y permisos' })).toHaveCount(0);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
});

test('a concurrent policy update keeps the matrix safe until an explicit reload', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/tests/e2e/role-management-harness.html');
  await expect(page.getByText('Versión vigente: 1')).toBeVisible();
  await page.getByRole('button', { name: 'Simular conflicto de versión' }).click();
  const optional = page.getByRole('checkbox', { name: /companies:read en ámbito Global para Administrador global/ });
  await optional.click();
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await page.getByRole('button', { name: 'Confirmar cambio' }).click();
  await expect(page.getByRole('alert')).toContainText(/La política cambió/);
  await expect(optional).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  await page.getByRole('button', { name: 'Recargar política' }).click();
  await expect(page.getByText('Versión vigente: 1')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /companies:read en ámbito Global para Administrador global/ })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
});

test('los permisos retirados eliminan la ruta de navegación', async ({ page }) => {
  await page.goto('/tests/e2e/role-management-harness.html');
  await expect(page.getByRole('link', { name: 'Roles y permisos' })).toBeVisible();
  await page.evaluate(() => (window as typeof window & { rolePolicyHarness: { revokeRead(): void } }).rolePolicyHarness.revokeRead());
  await expect(page.getByRole('link', { name: 'Roles y permisos' })).toHaveCount(0);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
});
