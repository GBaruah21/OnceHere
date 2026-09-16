import { test, expect, request as playwrightRequest } from '@playwright/test';

test('landing and trust surfaces render', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/OnceHere/);
  await expect(page.getByRole('button', { name: /Create Your Archive/i }).first()).toBeVisible();
  const footer = page.locator('#platform-attribution-footer');
  await footer.scrollIntoViewIfNeeded();
  await expect(footer.getByRole('link', { name: 'Privacy' })).toBeVisible();
  await expect(footer.getByRole('link', { name: 'Terms' })).toBeVisible();
  await expect(footer.getByRole('link', { name: 'Safety' })).toBeVisible();
  await expect(footer.getByRole('link', { name: 'Report content' })).toBeVisible();

  for (const route of ['/privacy', '/terms', '/safety', '/report']) {
    const response = await page.request.get(route);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('text/html');
  }
});

test('public share bridge emits archive metadata while private share bridge does not leak it', async ({ request }) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const publicTitle = `Public Metadata ${suffix}`;
  const privateTitle = `Private Metadata ${suffix}`;
  const publicSlug = `e2e-public-${suffix}`.toLowerCase();
  const privateSlug = `e2e-private-meta-${suffix}`.toLowerCase();
  const created: Array<{ id: string; token: string }> = [];

  const createArchive = async (visibility: 'public' | 'private', title: string, finalSlug: string) => {
    const response = await request.post('/api/archives', {
      data: {
        archiveType: 'school',
        title,
        organizationName: 'OnceHere Metadata E2E',
        subtitle: `${title} subtitle`,
        startYear: 2025,
        endYear: 2026,
        themeId: 'midnight-cinema',
        visibility,
        contributionMode: 'owner-only',
        viewerPin: visibility === 'private' ? '684205' : undefined,
        recoveryKey: `e2e-recovery-${visibility}-${suffix}`
      }
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    created.push({ id: body.archive.id, token: body.ownerToken });
    const deploy = await request.post(`/api/archives/${body.archive.id}/deploy`, {
      headers: { Authorization: `Bearer ${body.ownerToken}` },
      data: { finalSlug }
    });
    expect(deploy.ok()).toBeTruthy();
  };

  try {
    await createArchive('public', publicTitle, publicSlug);
    await createArchive('private', privateTitle, privateSlug);

    const anonymous = await playwrightRequest.newContext({ baseURL: 'http://127.0.0.1:4173' });
    try {
      const publicShare = await anonymous.get(`/share/${publicSlug}`);
      expect(publicShare.ok()).toBeTruthy();
      const publicHtml = await publicShare.text();
      expect(publicHtml).toContain(publicTitle);
      expect(publicHtml).toContain(`${publicTitle} subtitle`);
      expect(publicHtml).toContain(`/s/${publicSlug}`);

      const privateShare = await anonymous.get(`/share/${privateSlug}`);
      expect(privateShare.ok()).toBeTruthy();
      const privateHtml = await privateShare.text();
      expect(privateHtml).not.toContain(privateTitle);
      expect(privateHtml).not.toContain(`${privateTitle} subtitle`);
      expect(privateHtml).toContain('Every chapter deserves a place to live.');
    } finally {
      await anonymous.dispose();
    }
  } finally {
    for (const archive of created.reverse()) {
      await request.delete(`/api/archives/${archive.id}`, {
        headers: { Authorization: `Bearer ${archive.token}` }
      }).catch(() => undefined);
    }
  }
});

test('archive-wide video limit spans Journey and Media Vault', async ({ request }) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let archiveId = '';
  let ownerToken = '';

  try {
    const createdResponse = await request.post('/api/archives', {
      data: {
        archiveType: 'school',
        title: `Video quota ${suffix}`,
        organizationName: 'OnceHere Quota E2E',
        startYear: 2025,
        endYear: 2026,
        themeId: 'midnight-cinema',
        visibility: 'unlisted',
        contributionMode: 'owner-only',
        recoveryKey: `e2e-video-recovery-${suffix}`
      }
    });
    expect(createdResponse.status()).toBe(201);
    const created = await createdResponse.json();
    archiveId = created.archive.id;
    ownerToken = created.ownerToken;
    const headers = { Authorization: `Bearer ${ownerToken}` };

    for (let index = 1; index <= 3; index += 1) {
      const response = await request.post(`/api/archives/${archiveId}/timeline`, {
        headers,
        data: {
          title: `Video milestone ${index}`,
          description: `Video milestone ${index} description`,
          yearLabel: '2026',
          mediaUrl: `https://media.example.com/journey-${index}.mp4`
        }
      });
      expect(response.status()).toBe(201);
    }

    for (let index = 1; index <= 2; index += 1) {
      const response = await request.post(`/api/archives/${archiveId}/media`, {
        headers,
        data: {
          type: 'video',
          url: `https://media.example.com/vault-${index}.mp4`,
          caption: `Vault video ${index}`
        }
      });
      expect(response.status()).toBe(201);
    }

    const sixthVideo = await request.post(`/api/archives/${archiveId}/media`, {
      headers,
      data: {
        type: 'video',
        url: 'https://media.example.com/vault-3.mp4',
        caption: 'Sixth video'
      }
    });
    expect(sixthVideo.status()).toBe(413);
    expect((await sixthVideo.json()).error).toContain('maximum of 5 videos');
  } finally {
    if (archiveId && ownerToken) {
      await request.delete(`/api/archives/${archiveId}`, {
        headers: { Authorization: `Bearer ${ownerToken}` }
      }).catch(() => undefined);
    }
  }
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
