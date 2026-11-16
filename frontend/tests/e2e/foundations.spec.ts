import { test, expect } from '@playwright/test';

for (const width of [360, 1280]) test(`responsive shell at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.route('**/api/health', route => route.fulfill({ json: { status: 'ok' } }));
  await page.goto('/');
  await expect(page.getByText('API disponible', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `../.artifacts/home-${width}.png`, fullPage: true });
  await page.goto('/ruta-inexistente');
  await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
  await page.getByRole('link', { name: 'Volver al inicio' }).click();
  await expect(page.getByText('API disponible', { exact: true })).toBeVisible();
});

test('API failure followed by explicit recovery', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/health', route => ++attempts === 1
    ? route.fulfill({ status: 503, contentType: 'text/html', body: '<h1>Unavailable</h1>' })
    : route.fulfill({ json: { status: 'ok' } }));
  await page.goto('/');
  await expect(page.getByText('API no disponible.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reintentar conexión' }).click();
  await expect(page.getByText('API disponible', { exact: true })).toBeVisible();
});

test('real API and Swagger work through the frontend proxy', async ({ page, request, baseURL }) => {
  const health = await request.get('/api/health');
  expect(health.ok()).toBe(true);
  expect(await health.json()).toEqual({ status: 'ok' });
  const external: string[] = [];
  const origin = new URL(baseURL!).origin;
  page.on('request', req => { if (/^https?:/.test(req.url()) && new URL(req.url()).origin !== origin) external.push(req.url()); });
  await page.goto('/api/docs');
  await expect(page.locator('#swagger-ui .opblock').first()).toBeVisible();
  await expect(page.locator('#swagger-ui')).toContainText('/api/health');
  expect(external).toEqual([]);
});
