import { test, expect, request as playwrightRequest } from '@playwright/test';

test('landing and trust links render', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/OnceHere/);
  await expect(page.getByRole('button', { name: /Create Your Archive/i }).first()).toBeVisible();
  const footer = page.locator('#platform-attribution-footer');
  await footer.scrollIntoViewIfNeeded();
  await expect(footer.getByRole('link', { name: 'Privacy' })).toBeVisible();
  await expect(footer.getByRole('link', { name: 'Terms' })).toBeVisible();
  await expect(footer.getByRole('link', { name: 'Safety' })).toBeVisible();
  await expect(footer.getByRole('link', { name: 'Report content' })).toBeVisible();
});

test('private archive lifecycle enforces viewer access', async ({ request, page }) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const title = `E2E Archive ${suffix}`;
  const finalSlug = `e2e-${suffix}`.toLowerCase();
  const recoveryKey = `e2e-recovery-${suffix}`;
  const editorPin = '583921';
  const viewerPin = '746205';
  let archiveId = '';
  let ownerToken = '';

  try {
    const createdResponse = await request.post('/api/archives', {
      data: {
        archiveType: 'school',
        title,
        organizationName: 'OnceHere E2E',
        startYear: 2025,
        endYear: 2026,
        themeId: 'midnight-cinema',
        visibility: 'private',
        contributionMode: 'pin-protected',
        editorPin,
        viewerPin,
        recoveryKey
      }
    });
    expect(createdResponse.status()).toBe(201);
    const created = await createdResponse.json();
    archiveId = created.archive.id;
    ownerToken = created.ownerToken;

    const deployed = await request.post(`/api/archives/${archiveId}/deploy`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
      data: { finalSlug }
    });
    expect(deployed.ok()).toBeTruthy();

    // Creation intentionally establishes an owner cookie on the fixture request
    // context. Use a separate cookie-free context to prove anonymous visitors do
    // not receive private archive content.
    const anonymous = await playwrightRequest.newContext({ baseURL: 'http://127.0.0.1:4173' });
    try {
      const locked = await anonymous.get(`/api/archives/by-slug/${finalSlug}`);
      expect(locked.ok()).toBeTruthy();
      const lockedBody = await locked.json();
      expect(lockedBody.locked).toBe(true);
      expect(lockedBody.archive.visibility).toBe('private');
      expect(lockedBody.sections).toBeUndefined();
      expect(lockedBody.media).toBeUndefined();
    } finally {
      await anonymous.dispose();
    }

    const viewerAuth = await request.post(`/api/archives/${archiveId}/auth/viewer-pin`, {
      data: { pin: viewerPin }
    });
    expect(viewerAuth.ok()).toBeTruthy();
    const viewerToken = (await viewerAuth.json()).token;

    const authorizedArchive = await request.get(`/api/archives/by-slug/${finalSlug}`, {
      headers: { Authorization: `Bearer ${viewerToken}` }
    });
    expect(authorizedArchive.ok()).toBeTruthy();
    expect((await authorizedArchive.json()).archive.title).toBe(title);

    const contributorAuth = await request.post(`/api/archives/${archiveId}/auth/pin`, {
      data: { pin: editorPin }
    });
    expect(contributorAuth.ok()).toBeTruthy();

    await page.goto(`/s/${finalSlug}`);
    await expect(page.getByText('This archive is protected.')).toBeVisible();
    await page.getByPlaceholder('Enter PIN').fill(viewerPin);
    await page.getByRole('button', { name: 'Unlock Archive' }).click();
    await expect(page.getByText('This archive is protected.')).toBeHidden();
    await expect(page.getByText(title).first()).toBeVisible();
  } finally {
    if (archiveId && ownerToken) {
      await request.delete(`/api/archives/${archiveId}`, {
        headers: { Authorization: `Bearer ${ownerToken}` }
      }).catch(() => undefined);
    }
  }
});
