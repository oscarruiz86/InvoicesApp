import { expect, test } from '@playwright/test';

test('APP_ADMIN with global context can enter audit history', async ({ page }) => {
  await page.goto('/tests/e2e/audit-access-harness.html?role=APP_ADMIN&context=GLOBAL');
  await expect(page.getByRole('link',{name:'Auditoría'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Historial seguro'})).toBeVisible();
});

for (const role of ['COMPANY_ADMIN','THIRD_PARTY_ADMIN','DRIVER']) test(`denies ${role} even by direct route`, async ({ page }) => {
  await page.goto(`/tests/e2e/audit-access-harness.html?role=${role}&context=GLOBAL`);
  await expect(page.getByRole('link',{name:'Auditoría'})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Acceso denegado'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Historial seguro'})).toHaveCount(0);
});

test('APP_ADMIN cannot enter the audit route from organizational context', async ({ page }) => {
  await page.goto('/tests/e2e/audit-access-harness.html?role=APP_ADMIN&context=ORGANIZATION');
  await expect(page.getByRole('link',{name:'Auditoría'})).toHaveCount(0);
  await expect(page.getByText('Auditoría solo está disponible en el contexto GLOBAL.')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Historial seguro'})).toHaveCount(0);
});
