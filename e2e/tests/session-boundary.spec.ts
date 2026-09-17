import { test, expect } from '@playwright/test';

test('a contributor workspace token cannot inherit a stale owner token or cached owner key', async ({ request, page }) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const masterKey = `mc_rec_session-boundary-${suffix}`;
  const editorPin = '583921';
  let archiveId = '';
  let ownerToken = '';
  let workspaceSlug = '';

  try {
    const createdResponse = await request.post('/api/archives', {
      data: {
        archiveType: 'school',
        title: `Session Boundary ${suffix}`,
        organizationName: 'OnceHere Security E2E',
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
    workspaceSlug = created.workspaceSlug;

    const contributorResponse = await request.post(`/api/archives/${archiveId}/auth/pin`, {
      data: { pin: editorPin }
    });
    expect(contributorResponse.ok()).toBeTruthy();
    const contributorToken = (await contributorResponse.json()).token as string;

    await page.goto('/');
    await page.evaluate(({ archiveId, workspaceSlug, ownerToken, contributorToken, masterKey }) => {
      sessionStorage.setItem(`mc_owner_${archiveId}`, ownerToken);
      sessionStorage.setItem(`mc_key_${archiveId}`, masterKey);
      sessionStorage.setItem(`mc_backup_key_${archiveId}`, 'mc_backup_should-not-leak');
      sessionStorage.setItem(`mc_workspace_${workspaceSlug}`, contributorToken);
    }, { archiveId, workspaceSlug, ownerToken, contributorToken, masterKey });

    await page.goto(`/workspace/${workspaceSlug}`);
    await expect(page.getByRole('button', { name: /Visual Themes/i })).toBeVisible();

    const cached = await page.evaluate(({ archiveId, workspaceSlug }) => ({
      owner: sessionStorage.getItem(`mc_owner_${archiveId}`),
      master: sessionStorage.getItem(`mc_key_${archiveId}`),
      backup: sessionStorage.getItem(`mc_backup_key_${archiveId}`),
      workspace: sessionStorage.getItem(`mc_workspace_${workspaceSlug}`),
      roleHint: document.documentElement.dataset.oncehereWorkspaceRole
    }), { archiveId, workspaceSlug });

    expect(cached.workspace).toBe(contributorToken);
    expect(cached.owner).toBeNull();
    expect(cached.master).toBeNull();
    expect(cached.backup).toBeNull();
    expect(cached.roleHint).toBe('contributor');

    await expect(page.locator('#open-deploy-modal-btn')).toBeHidden();
    await expect(page.getByRole('button', { name: /Access & Privacy/i })).toBeHidden();
    await expect(page.getByRole('button', { name: /Access Log/i })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Open owner key safety' })).toHaveCount(0);
  } finally {
    if (archiveId && ownerToken) {
      await request.delete(`/api/archives/${archiveId}`, {
        headers: { Authorization: `Bearer ${ownerToken}` }
      }).catch(() => undefined);
    }
  }
});
