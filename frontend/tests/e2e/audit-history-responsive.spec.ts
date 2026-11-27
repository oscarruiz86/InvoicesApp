import { expect, test } from '@playwright/test';

for (const width of [360, 1280]) test(`audit history fits ${width}px and supports keyboard detail`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/tests/e2e/audit-history-harness.html');
  await expect(page.getByRole('heading', { name:'Auditoría' })).toBeVisible();
  await expect(width === 360 ? page.getByText(/Vehículo actualizado · Flota/).first() : page.getByText('Vehículo actualizado',{exact:true}).first()).toBeVisible();
  await expect(page.getByText(/COT$/).filter({visible:true}).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name:'Ver detalle' }).filter({ visible:true }).first().click();
  const dialog = page.getByRole('dialog', { name:'Detalle del evento' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
