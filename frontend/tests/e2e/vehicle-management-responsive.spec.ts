import { expect, test } from '@playwright/test';
for (const width of [360, 910, 1225, 1280]) test(`vehicle CRUD and unavailable assignment fit ${width}px with keyboard focus`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/tests/e2e/vehicle-management-harness.html');
  await expect(page.getByText('ABC123', { exact: true })).toBeVisible();
  await expect(page.getByText('Sin conductor asignado', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Crear vehículo', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Crear vehículo' });
  await expect(create.getByLabel('Placa', { exact: false })).toBeFocused();
  await create.getByLabel('Placa', { exact: false }).fill('AB-12');
  await expect(create.getByLabel('Placa', { exact: false })).toHaveAttribute('aria-invalid', 'true');
  await expect(create).toContainText('3 letras seguidas de 2 o 3 números');
  await create.getByLabel('Placa', { exact: false }).fill('NEW123');
  await create.getByLabel('Número interno', { exact: false }).fill('0002');
  await create.getByLabel('Número de tarjeta de propiedad', { exact: false }).fill('000456');
  await create.getByRole('button', { name: 'Guardar cambios' }).focus(); await page.keyboard.press('Enter');
  await expect(create).toBeHidden(); await expect(page.getByText('NEW123', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Editar', exact: true }).first().click();
  const inspect = page.getByRole('dialog', { name: 'Editar vehículo' });
  await expect(inspect.getByLabel('Número de tarjeta de propiedad', { exact: false })).toHaveValue('000123');
  await inspect.getByRole('button', { name: 'Cancelar' }).click();
  await page.getByRole('button', { name: 'Editar', exact: true }).first().click();
  const edit = page.getByRole('dialog', { name: 'Editar vehículo' });
  await edit.getByLabel('Número interno', { exact: false }).fill('0003');
  await edit.getByRole('button', { name: 'Guardar cambios' }).click(); await expect(edit).toBeHidden();
  const deactivate = page.getByRole('button', { name: 'Desactivar', exact: true }).first();
  await expect(deactivate).toBeEnabled();
  await deactivate.click();
  const status = page.getByRole('dialog', { name: 'Desactivar vehículo' });
  await expect(status.getByRole('button', { name: 'Confirmar' })).toBeEnabled();
  await status.getByRole('button', { name: 'Confirmar' }).click();
  await expect(status).toBeHidden();
  await expect(page.getByText('Vehículo guardado.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('DRIVER sees no vehicles without an own active assignment', async ({ page }) => {
  await page.goto('/tests/e2e/vehicle-management-harness.html?driver=1');
  await expect(page.getByRole('alert')).toContainText('No hay vehículos para mostrar.');
  await expect(page.getByText('ABC123', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Crear vehículo' })).toHaveCount(0);
});
test('duplicate and stale versions retain safe form input', async ({ page }) => {
  for (const query of ['', '?conflict=1']) {
    await page.goto('/tests/e2e/vehicle-management-harness.html' + query);
    await page.getByRole('button', { name: 'Editar', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Editar vehículo' });
    const value = query ? 'NEW123' : 'DUP123';
    await dialog.getByLabel('Placa', { exact: false }).fill(value);
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(dialog.getByRole('alert')).toContainText(query ? 'El vehículo cambió' : 'La placa'); await expect(dialog.getByLabel('Placa', { exact: false })).toHaveValue(value);
  }
});
test('context changes discard pending reads and clear pending write forms', async ({ page }) => {
  await page.goto('/tests/e2e/vehicle-management-harness.html?slow=read');
  await page.getByRole('button', { name: 'Cambiar tercero' }).click();
  await expect(page.getByText('ABC123', { exact: true })).toHaveCount(0);
  await expect(page.getByText('No hay vehículos para mostrar.')).toBeVisible();
  await page.goto('/tests/e2e/vehicle-management-harness.html?slow=write');
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar vehículo' });
  await dialog.getByLabel('Placa', { exact: false }).fill('NEW456');
  await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
  // A real external context invalidation can occur while a modal traps focus.
  await page.getByRole('button', { name: 'Cambiar tercero', includeHidden: true }).evaluate((button: HTMLButtonElement) => button.click());
  await expect(dialog).toBeHidden(); await expect(page.getByText('No hay vehículos para mostrar.')).toBeVisible();
  await expect(page.getByText('NEW456', { exact: true })).toHaveCount(0);
});
