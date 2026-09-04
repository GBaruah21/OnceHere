import express from 'express';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { apiRouter } from '../server/api';
import { db } from '../server/db';
import { createSignedToken, verifySignedToken, verifyArchivePin, verifyOwnerRecoveryKey } from '../server/auth';

let server: Server;
let base = '';
beforeAll(async () => {
  vi.stubEnv('PLATFORM_ADMIN_KEY', 'test-only-platform-key');
  vi.spyOn(db, 'ensureLoaded').mockResolvedValue();
  vi.spyOn(db, 'persist').mockResolvedValue();
  const app = express();
  app.use('/api', apiRouter);
  server = await new Promise<Server>(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server unavailable');
  base = `http://127.0.0.1:${address.port}/api`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  vi.restoreAllMocks(); vi.unstubAllEnvs();
});
const request = (path: string, body?: unknown, headers: Record<string, string> = {}) => fetch(base + path, {
  method: body === undefined ? 'GET' : 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: body === undefined ? undefined : JSON.stringify(body)
});
const patchRequest = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(base + path, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body)
});

describe.each([1, 2, 3, 4, 5])('Retry regression iteration %i', iteration => {
  it('enforces private subresource isolation, viewer read-only access and session revocation', async () => {
    const original = db.archives.get('demo-marys-2025')!;
    const id = original.id;
    db.archives.set(id, { ...original, visibility: 'private' });
    const owner = createSignedToken(id, 'owner', 1);
    const secondOwner = createSignedToken(id, 'owner', 1);
    expect(secondOwner).not.toBe(owner);
    const viewer = createSignedToken(id, 'viewer', 1);
    const other = createSignedToken('demo-riverdale-2026', 'owner', 1);
    try {
      for (const resource of ['sections', 'timeline', 'members', 'media', 'wall']) {
        expect((await request(`/archives/${id}/${resource}`)).status).toBe(403);
        expect((await request(`/archives/${id}/${resource}`, undefined, { Authorization: `Bearer ${other}` })).status).toBe(403);
        expect((await request(`/archives/${id}/${resource}`, undefined, { Authorization: `Bearer ${owner}` })).status).toBe(200);
        expect((await request(`/archives/${id}/${resource}`, undefined, { Authorization: `Bearer ${viewer}` })).status).toBe(200);
        expect((await request(`/archives/${id}/${resource}`, {}, { Authorization: `Bearer ${viewer}` })).status).toBe(403);
      }
      db.sessions.delete(owner);
      expect(verifySignedToken(owner).valid).toBe(false);
      expect(verifySignedToken(secondOwner).valid).toBe(true);
      expect((await request(`/archives/${id}/media`, undefined, { Authorization: `Bearer ${owner}` })).status).toBe(403);
      db.archives.set(id, { ...original, deploymentStatus: 'draft' });
      expect((await request(`/archives/by-slug/${original.slug}`)).status).toBe(404);
      db.archives.set(id, original);
      const originalMessages = db.memberMessages.get(id);
      db.memberMessages.set(id, [
        { id: 'qa-public', archiveId: id, memberId: 'qa-member', authorName: 'QA', text: 'Visible', visibility: 'public', isHidden: false, createdAt: new Date().toISOString() },
        { id: 'qa-private', archiveId: id, memberId: 'qa-member', authorName: 'QA', text: 'Private', visibility: 'private', isHidden: false, createdAt: new Date().toISOString() },
        { id: 'qa-hidden', archiveId: id, memberId: 'qa-member', authorName: 'QA', text: 'Hidden', visibility: 'public', isHidden: true, createdAt: new Date().toISOString() }
      ]);
      try {
        const messages = await request(`/archives/${id}/members/qa-member/messages`);
        expect((await messages.json()).messages.map((message: { id: string }) => message.id)).toEqual(['qa-public']);
      } finally {
        if (originalMessages) db.memberMessages.set(id, originalMessages);
        else db.memberMessages.delete(id);
      }
      db.archives.set(id, { ...original, contributionMode: 'owner-only' });
      expect(verifyArchivePin(id, '202525', `qa-${iteration}`).success).toBe(false);
      db.archives.set(id, { ...original, deletedAt: new Date().toISOString() });
      expect(verifyOwnerRecoveryKey(id, 'mc_rec_sample_key_123').success).toBe(false);
      expect(verifySignedToken(viewer).valid).toBe(false);
    } finally {
      db.archives.set(id, original);
      [owner, secondOwner, viewer, other].forEach(token => db.sessions.delete(token));
    }
  });
  it('keeps a new draft hidden, recovers its owner, protects preview and never publishes through Unhide', async () => {
    const key = `mc_rec_test_only_${iteration}_f83dba74`;
    const created = await request('/archives', {
      archiveType: 'school', title: `QA Archive ${iteration}`, organizationName: 'Fictional QA',
      startYear: 2024, endYear: 2026, themeId: 'midnight-cinema', visibility: 'public',
      contributionMode: 'owner-only', recoveryKey: key
    });
    expect(created.status).toBe(201);
    const data = await created.json(); const id = data.archive.id;
    expect(data.archive.isHiddenFromExplore).toBe(true);
    expect(data.archive.deploymentStatus).toBe('draft');
    expect(data.archive.recoveryKeyHash).toBeUndefined();
    expect((await request(`/admin/archives/${id}/preview`)).status).toBe(403);
    const preview = await request(`/admin/archives/${id}/preview`, undefined, { 'x-platform-admin-key': 'test-only-platform-key' });
    expect(preview.status).toBe(200);
    expect((await preview.json()).readOnly).toBe(true);
    const recovered = await request('/archives/auth/key-access', { key });
    expect(recovered.status).toBe(200);
    const recovery = await recovered.json();
    expect(recovery.archive.id).toBe(id);
    expect(recovery.token).toBeTruthy();
    expect((await request('/archives/auth/key-access', { key: 'wrong-test-key', identifier: data.workspaceSlug })).status).toBe(401);
    expect((await request(`/archives/${id}/access-history`)).status).toBe(403);
    expect((await request(`/archives/${id}/access-history`, undefined, { Authorization: `Bearer ${recovery.token}` })).status).toBe(200);
    const unhidden = await request(`/admin/archives/${id}/explore-visibility`, { isHiddenFromExplore: false }, { 'x-platform-admin-key': 'test-only-platform-key' });
    expect(unhidden.status).toBe(200);
    expect((await unhidden.json()).archive.deploymentStatus).toBe('draft');
    expect(db.listPublicArchives().some(archive => archive.id === id)).toBe(false);
    db.updateArchive(id, { deploymentStatus: 'deployed', visibility: 'private' }, 'owner');
    expect(db.listPublicArchives().some(archive => archive.id === id)).toBe(false);
  });

  it('persists every planned yearbook size and keeps the draft recoverable', async () => {
    for (const count of [30, 31, 40, 100]) {
      const key = `mc_rec_member_count_${iteration}_${count}_f83dba74`;
      const created = await request('/archives', {
        archiveType: 'school', title: `Members ${iteration}-${count}`, organizationName: 'Fictional QA',
        startYear: 2024, endYear: 2026, approxPeopleCount: count, themeId: 'midnight-cinema',
        visibility: 'public', contributionMode: 'owner-only', recoveryKey: key
      });
      expect(created.status).toBe(201);
      const result = await created.json();
      expect(result.archive.approxPeopleCount).toBe(count);
      expect(result.archive.membersCount).toBe(count);
      const recovery = await request('/archives/auth/key-access', { key });
      const recovered = await recovery.json();
      expect(recovered.archive.approxPeopleCount).toBe(count);
      const updated = await patchRequest(`/archives/${result.archive.id}`, { approxPeopleCount: count + 1 }, { Authorization: `Bearer ${recovered.token}` });
      expect(updated.status).toBe(200);
      expect((await updated.json()).archive.membersCount).toBe(count + 1);
      expect((await patchRequest(`/archives/${result.archive.id}`, { approxPeopleCount: 0 }, { Authorization: `Bearer ${recovered.token}` })).status).toBe(400);
    }
  });
});
