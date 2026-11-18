import { expect, test } from '@playwright/test';

for (const width of [360, 1280]) {
  test(`anonymous session hides the application shell at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/tests/e2e/authentication-shell-harness.html?session=anonymous');
    await expect(page.getByRole('heading', { name: 'Todo empieza con una buena base.' })).toBeVisible();
    await expect(page.getByRole('banner')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toHaveCount(0);
    await expect(page.getByText('Invoices App', { exact: true })).toHaveCount(0);
  });
}

for (const width of [360, 1280]) {
  test(`authenticated session shows the application shell at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/tests/e2e/authentication-shell-harness.html?session=authenticated');
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('banner').getByText('Invoices App', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir menú de usuario' })).toBeVisible();
    if (width > 600) await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
    else {
      await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Abrir navegación' }).click();
      await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
    }
  });
}
