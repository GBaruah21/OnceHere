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

test('creator master key survives editor access and backup-key rotation', async ({ request }) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const masterKey = `mc_rec_e2e-master-${suffix}`;
  const editorPin = '583921';
  let archiveId = '';
  let ownerToken = '';

  try {
    const createdResponse = await request.post('/api/archives', {
      data: {
        archiveType: 'school',
        title: `Ownership E2E ${suffix}`,
        organizationName: 'OnceHere Ownership E2E',
        startYear: 2025,
        endYear: 2026,
        themeId: 'midnight-cinema',
        visibility: 'unlisted',
        contributionMode: 'pin-protected',
        editorPin,
        recoveryKey: masterKey
      }
    });
    expect(createdResponse.status()).toBe(201);
    const created = await createdResponse.json();
    archiveId = created.archive.id;
    ownerToken = created.ownerToken;

    const contributorAuth = await request.post(`/api/archives/${archiveId}/auth/pin`, { data: { pin: editorPin } });
    expect(contributorAuth.ok()).toBeTruthy();
    const contributorToken = (await contributorAuth.json()).token as string;

    const contributorRotate = await request.post(`/api/archives/${archiveId}/auth/recovery/regenerate`, {
      headers: { Authorization: `Bearer ${contributorToken}` }
    });
    expect(contributorRotate.status()).toBe(403);

    const contributorSettingsAttack = await request.patch(`/api/archives/${archiveId}`, {
      headers: { Authorization: `Bearer ${contributorToken}` },
      data: { recoveryKeyHash: 'attacker-controlled', backupRecoveryKeyHash: 'attacker-controlled', title: 'Taken Over' }
    });
    expect(contributorSettingsAttack.status()).toBe(403);

    const firstRotation = await request.post(`/api/archives/${archiveId}/auth/recovery/regenerate`, {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    expect(firstRotation.ok()).toBeTruthy();
    const firstRotationBody = await firstRotation.json();
    const firstBackup = firstRotationBody.recoveryKey as string;
    expect(firstRotationBody.masterKeyStillValid).toBe(true);
    expect(firstBackup).toMatch(/^mc_backup_/);

    const firstBackupLogin = await request.post(`/api/archives/${archiveId}/auth/recovery`, {
      data: { recoveryKey: firstBackup }
    });
    expect(firstBackupLogin.ok()).toBeTruthy();
    expect((await firstBackupLogin.json()).keyKind).toBe('backup');

    const secondRotation = await request.post(`/api/archives/${archiveId}/auth/recovery/regenerate`, {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    expect(secondRotation.ok()).toBeTruthy();
    const secondBackup = (await secondRotation.json()).recoveryKey as string;
    expect(secondBackup).not.toBe(firstBackup);

    const oldBackupLogin = await request.post(`/api/archives/${archiveId}/auth/recovery`, {
      data: { recoveryKey: firstBackup }
    });
    expect(oldBackupLogin.status()).toBe(401);

    const newBackupLogin = await request.post(`/api/archives/${archiveId}/auth/recovery`, {
      data: { recoveryKey: secondBackup }
    });
    expect(newBackupLogin.ok()).toBeTruthy();
    expect((await newBackupLogin.json()).keyKind).toBe('backup');

    const masterLogin = await request.post(`/api/archives/${archiveId}/auth/recovery`, {
      data: { recoveryKey: masterKey }
    });
    expect(masterLogin.ok()).toBeTruthy();
    expect((await masterLogin.json()).keyKind).toBe('master');

    const status = await request.get(`/api/archives/${archiveId}/auth/recovery/status`, {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    expect(status.ok()).toBeTruthy();
    expect(await status.json()).toMatchObject({ masterKeyImmutable: true, backupConfigured: true });

    const revoke = await request.delete(`/api/archives/${archiveId}/auth/recovery/backup`, {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    expect(revoke.ok()).toBeTruthy();
    expect((await revoke.json()).masterKeyStillValid).toBe(true);

    const revokedBackupLogin = await request.post(`/api/archives/${archiveId}/auth/recovery`, {
      data: { recoveryKey: secondBackup }
    });
    expect(revokedBackupLogin.status()).toBe(401);

    const masterStillWorks = await request.post(`/api/archives/${archiveId}/auth/recovery`, {
      data: { recoveryKey: masterKey }
    });
    expect(masterStillWorks.ok()).toBeTruthy();
    expect((await masterStillWorks.json()).keyKind).toBe('master');
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

test('editor curated ordering persists into the live audience archive', async ({ request }) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const editorPin = '583921';
  const finalSlug = `e2e-order-${suffix}`.toLowerCase();
  let archiveId = '';
  let ownerToken = '';

  try {
    const createdResponse = await request.post('/api/archives', {
      data: {
        archiveType: 'school',
        title: `Curated order ${suffix}`,
        organizationName: 'OnceHere Ordering E2E',
        startYear: 2025,
        endYear: 2026,
        themeId: 'midnight-cinema',
        visibility: 'public',
        contributionMode: 'pin-protected',
        editorPin,
        recoveryKey: `mc_rec_order-${suffix}`
      }
    });
    expect(createdResponse.status()).toBe(201);
    const created = await createdResponse.json();
    archiveId = created.archive.id;
    ownerToken = created.ownerToken;

    const contributorAuth = await request.post(`/api/archives/${archiveId}/auth/pin`, {
      data: { pin: editorPin }
    });
    expect(contributorAuth.ok()).toBeTruthy();
    const contributorToken = (await contributorAuth.json()).token as string;
    const editorHeaders = { Authorization: `Bearer ${contributorToken}` };

    const timelineIds: string[] = [];
    const memberIds: string[] = [];
    const mediaIds: string[] = [];
    const wallIds: string[] = [];

    for (let index = 0; index < 3; index += 1) {
      const timelineResponse = await request.post(`/api/archives/${archiveId}/timeline`, {
        headers: editorHeaders,
        data: { title: `Milestone ${index}`, description: `Milestone ${index}`, yearLabel: '2026' }
      });
      expect(timelineResponse.status()).toBe(201);
      timelineIds.push((await timelineResponse.json()).event.id);

      const memberResponse = await request.post(`/api/archives/${archiveId}/members`, {
        headers: editorHeaders,
        data: { name: `Member ${index}`, imageUrl: `https://example.com/member-${index}.jpg` }
      });
      expect(memberResponse.status()).toBe(201);
      memberIds.push((await memberResponse.json()).member.id);

      const mediaResponse = await request.post(`/api/archives/${archiveId}/media`, {
        headers: editorHeaders,
        data: { type: 'image', url: `https://example.com/memory-${index}.jpg`, caption: `Memory ${index}` }
      });
      expect(mediaResponse.status()).toBe(201);
      mediaIds.push((await mediaResponse.json()).item.id);

      const wallResponse = await request.post(`/api/archives/${archiveId}/wall`, {
        headers: editorHeaders,
        data: { authorName: `Friend ${index}`, text: `Wall note ${index}` }
      });
      expect(wallResponse.status()).toBe(201);
      wallIds.push((await wallResponse.json()).post.id);
    }

    const desiredTimeline = [timelineIds[2], timelineIds[0], timelineIds[1]];
    const desiredMembers = [memberIds[1], memberIds[2], memberIds[0]];
    const desiredMedia = [mediaIds[2], mediaIds[1], mediaIds[0]];
    const desiredWall = [wallIds[1], wallIds[0], wallIds[2]];

    for (const [route, orderedIds] of [
      ['timeline', desiredTimeline],
      ['members', desiredMembers],
      ['media', desiredMedia],
      ['wall', desiredWall]
    ] as const) {
      const response = await request.put(`/api/archives/${archiveId}/${route}/reorder`, {
        headers: editorHeaders,
        data: { orderedIds }
      });
      expect(response.ok()).toBeTruthy();
    }

    const deployed = await request.post(`/api/archives/${archiveId}/deploy`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
      data: { finalSlug }
    });
    expect(deployed.ok()).toBeTruthy();

    const audience = await request.get(`/api/archives/by-slug/${finalSlug}`);
    expect(audience.ok()).toBeTruthy();
    const live = await audience.json();
    expect(live.timeline.map((item: { id: string }) => item.id)).toEqual(desiredTimeline);
    expect(live.members.map((item: { id: string }) => item.id)).toEqual(desiredMembers);
    expect(live.media.map((item: { id: string }) => item.id)).toEqual(desiredMedia);
    expect(live.wall.map((item: { id: string }) => item.id)).toEqual(desiredWall);
  } finally {
    if (archiveId && ownerToken) {
      await request.delete(`/api/archives/${archiveId}`, {
        headers: { Authorization: `Bearer ${ownerToken}` }
      }).catch(() => undefined);
    }
  }
});
