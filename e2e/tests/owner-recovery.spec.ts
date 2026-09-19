import { test, expect, request as playwrightRequest } from '@playwright/test';

test('master owner key remains permanent while backup keys rotate owner-only', async ({ request }) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const masterKey = `mc_rec_master-${suffix}-root-owner`;
  const editorPin = '583921';
  let archiveId = '';
  let ownerToken = '';

  try {
    const createdResponse = await request.post('/api/archives', {
      data: {
        archiveType: 'school',
        title: `Recovery E2E ${suffix}`,
        organizationName: 'OnceHere Recovery E2E',
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

    const contributorAuth = await request.post(`/api/archives/${archiveId}/auth/pin`, {
      data: { pin: editorPin }
    });
    expect(contributorAuth.ok()).toBeTruthy();
    const contributorToken = (await contributorAuth.json()).token;

    const contributorRotate = await request.post(`/api/archives/${archiveId}/auth/recovery/regenerate`, {
      headers: { Authorization: `Bearer ${contributorToken}` }
    });
    expect(contributorRotate.status()).toBe(403);

    const contributorSettingsAttack = await request.patch(`/api/archives/${archiveId}`, {
      headers: { Authorization: `Bearer ${contributorToken}` },
      data: { recoveryKeyHash: 'attacker', backupRecoveryKeyHash: 'attacker', title: 'Taken Over' }
    });
    expect(contributorSettingsAttack.status()).toBe(403);

    const firstBackupResponse = await request.post(`/api/archives/${archiveId}/auth/recovery/regenerate`, {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    expect(firstBackupResponse.ok()).toBeTruthy();
    const firstBackupBody = await firstBackupResponse.json();
    expect(firstBackupBody.keyKind).toBe('backup');
    expect(firstBackupBody.masterKeyStillValid).toBe(true);
    expect(firstBackupBody.recoveryKey).toMatch(/^mc_backup_/);
    const firstBackup = firstBackupBody.recoveryKey as string;

    const anonymous = await playwrightRequest.newContext({ baseURL: 'http://127.0.0.1:4173' });
    try {
      const masterLogin = await anonymous.post('/api/archives/auth/key-access', {
        data: { key: masterKey, identifier: archiveId }
      });
      expect(masterLogin.ok()).toBeTruthy();
      const masterLoginBody = await masterLogin.json();
      expect(masterLoginBody.keyKind).toBe('master');
      expect(masterLoginBody.archive.recoveryKeyHash).toBeUndefined();
      expect(masterLoginBody.archive.backupRecoveryKeyHash).toBeUndefined();

      const firstBackupLogin = await anonymous.post('/api/archives/auth/key-access', {
        data: { key: firstBackup, identifier: archiveId }
      });
      expect(firstBackupLogin.ok()).toBeTruthy();
      expect((await firstBackupLogin.json()).keyKind).toBe('backup');

      const secondBackupResponse = await anonymous.post(`/api/archives/${archiveId}/auth/recovery/regenerate`, {
        headers: { Authorization: `Bearer ${masterLoginBody.token}` }
      });
      expect(secondBackupResponse.ok()).toBeTruthy();
      const secondBackupBody = await secondBackupResponse.json();
      expect(secondBackupBody.replacedPreviousBackup).toBe(true);
      expect(secondBackupBody.masterKeyStillValid).toBe(true);
      const secondBackup = secondBackupBody.recoveryKey as string;
      expect(secondBackup).not.toBe(firstBackup);

      const oldBackupLogin = await anonymous.post('/api/archives/auth/key-access', {
        data: { key: firstBackup, identifier: archiveId }
      });
      expect(oldBackupLogin.status()).toBe(401);

      const newBackupLogin = await anonymous.post('/api/archives/auth/key-access', {
        data: { key: secondBackup, identifier: archiveId }
      });
      expect(newBackupLogin.ok()).toBeTruthy();
      expect((await newBackupLogin.json()).keyKind).toBe('backup');

      const revoke = await anonymous.delete(`/api/archives/${archiveId}/auth/recovery/backup`, {
        headers: { Authorization: `Bearer ${masterLoginBody.token}` }
      });
      expect(revoke.ok()).toBeTruthy();
      expect((await revoke.json()).masterKeyStillValid).toBe(true);

      const revokedBackupLogin = await anonymous.post('/api/archives/auth/key-access', {
        data: { key: secondBackup, identifier: archiveId }
      });
      expect(revokedBackupLogin.status()).toBe(401);

      const masterStillWorks = await anonymous.post('/api/archives/auth/key-access', {
        data: { key: masterKey, identifier: archiveId }
      });
      expect(masterStillWorks.ok()).toBeTruthy();
      expect((await masterStillWorks.json()).keyKind).toBe('master');
    } finally {
      await anonymous.dispose();
    }
  } finally {
    if (archiveId && ownerToken) {
      await request.delete(`/api/archives/${archiveId}`, {
        headers: { Authorization: `Bearer ${ownerToken}` }
      }).catch(() => undefined);
    }
  }
});


test('owner recovery opens the Studio workspace immediately with the issued durable session', async ({ page, request }) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const masterKey = `mc_rec_ui-${suffix}-owner-workspace`;
  let archiveId = '';
  let workspaceSlug = '';
  let cleanupToken = '';

  try {
    const createdResponse = await request.post('/api/archives', {
      data: {
        archiveType: 'school',
        title: `Owner Workspace Handoff ${suffix}`,
        organizationName: 'OnceHere Session Handoff E2E',
        startYear: 2025,
        endYear: 2026,
        themeId: 'midnight-cinema',
        visibility: 'unlisted',
        contributionMode: 'owner-only',
        recoveryKey: masterKey
      }
    });
    expect(createdResponse.status()).toBe(201);
    const created = await createdResponse.json();
    archiveId = created.archive.id;
    workspaceSlug = created.workspaceSlug;
    cleanupToken = created.ownerToken;

    await page.goto('/');
    await page.getByRole('button', { name: 'Key Access' }).click();
    await page.getByLabel('Owner Recovery Key *').fill(masterKey);
    await page.getByLabel(/Archive Slug, Title, or URL/i).fill(workspaceSlug);
    await page.getByRole('button', { name: /Unlock & Open Studio/i }).click();

    await expect(page).toHaveURL(new RegExp(`/workspace/${workspaceSlug.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&')}$`));
    await expect(page.getByText(workspaceSlug, { exact: true })).toBeVisible();
    await expect(page.getByText('Could not open this workspace')).toHaveCount(0);
  } finally {
    if (archiveId && cleanupToken) {
      await request.delete(`/api/archives/${archiveId}`, {
        headers: { Authorization: `Bearer ${cleanupToken}` }
      }).catch(() => undefined);
    }
  }
});
