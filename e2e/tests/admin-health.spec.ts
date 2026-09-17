import { expect, test } from '@playwright/test';

const ADMIN_KEY = process.env.PLATFORM_ADMIN_KEY || 'oncehere-e2e-admin-key';

test('platform health endpoint stays private and reports the 20 MB video limit', async ({ request }) => {
  const denied = await request.get('/api/admin/health');
  expect(denied.status()).toBe(403);

  const allowed = await request.get('/api/admin/health', {
    headers: { 'x-platform-admin-key': ADMIN_KEY }
  });
  expect(allowed.status()).toBe(200);
  const body = await allowed.json();
  expect(body.limits.videoBytes).toBe(20 * 1024 * 1024);
  expect(body.storage).toHaveProperty('usedBytes');
  expect(body.storage).toHaveProperty('remainingBytes');
  expect(body.services).toHaveProperty('databaseConfigured');
  expect(body.monitoring.persistentRuntimeErrorHistory).toBe(false);
});

test('owner tools displays live system health and current limits', async ({ page }) => {
  page.on('dialog', async (dialog) => {
    if (dialog.type() === 'prompt') await dialog.accept(ADMIN_KEY);
    else await dialog.dismiss();
  });

  await page.goto('/?owner=1');
  await expect(page.getByRole('heading', { name: 'OnceHere Owner Tools' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'System health & capacity' })).toBeVisible();
  await expect(page.getByText('Video file', { exact: true })).toBeVisible();
  await expect(page.getByText('20.0 MB', { exact: true })).toBeVisible();
  await expect(page.getByText(/Historical function\/runtime errors remain in the active hosting provider logs/i)).toBeVisible();
});
