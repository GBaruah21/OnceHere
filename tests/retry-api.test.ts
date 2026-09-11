import express from 'express';
import cookieParser from 'cookie-parser';
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
  vi.spyOn(db, 'persistArchive').mockResolvedValue();
  const app = express();
  app.use(cookieParser());
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
const putRequest = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(base + path, {
  method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body)
});
const deleteRequest = (path: string, headers: Record<string, string> = {}) => fetch(base + path, {
  method: 'DELETE', headers
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
    const ownerCookie = recovered.headers.getSetCookie().find(cookie => cookie.startsWith('mc_owner_token='));
    expect(ownerCookie).toBeTruthy();
    const staleToken = `${recovery.token}-stale`;
    const cookieHeader = ownerCookie!.split(';')[0];
    expect((await request(`/archives/${id}/access-history`, undefined, {
      Authorization: `Bearer ${staleToken}`,
      Cookie: cookieHeader
    })).status).toBe(200);
    expect((await request('/archives/auth/key-access', { key: 'wrong-test-key', identifier: data.workspaceSlug })).status).toBe(401);
    expect((await request(`/archives/${id}/access-history`)).status).toBe(403);
    expect((await request(`/archives/${id}/access-history`, undefined, { Authorization: `Bearer ${recovery.token}` })).status).toBe(200);
    for (const year of ['2025', '2026']) {
      const added = await request(`/archives/${id}/timeline`, {
        title: `QA milestone ${year}`,
        description: `Isolated reorder regression milestone for ${year}.`,
        yearLabel: year
      }, { Authorization: `Bearer ${recovery.token}` });
      expect(added.status).toBe(201);
    }
    const beforeOrder = db.getTimelineEvents(id).map(event => event.id);
    expect(beforeOrder).toHaveLength(2);
    const reversed = [...beforeOrder].reverse();
    const reordered = await putRequest(`/archives/${id}/timeline/reorder`, { orderedIds: reversed }, { Authorization: `Bearer ${recovery.token}` });
    expect(reordered.status).toBe(200);
    expect(db.getTimelineEvents(id).map(event => event.id)).toEqual(reversed);
    expect((await putRequest(`/archives/${id}/timeline/reorder`, { orderedIds: [reversed[0]] }, { Authorization: `Bearer ${recovery.token}` })).status).toBe(409);
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

  it('blocks cross-archive destructive actions and keeps revision restore owner-only', async () => {
    const id = 'demo-marys-2025';
    const otherOwner = createSignedToken('demo-riverdale-2026', 'owner', 1);
    const ownOwner = createSignedToken(id, 'owner', 1);
    const mediaId = db.getMediaItems(id)[0]?.id || 'missing-media';
    const wallId = db.getWallPosts(id)[0]?.id || 'missing-wall';
    const revisionId = db.getRevisions(id)[0]?.id || 'missing-revision';
    try {
      expect((await deleteRequest(`/archives/${id}/media/${mediaId}`, { Authorization: `Bearer ${otherOwner}` })).status).toBe(403);
      expect((await deleteRequest(`/archives/${id}/media/${mediaId}/notes/fake-note`, { Authorization: `Bearer ${otherOwner}` })).status).toBe(403);
      expect((await patchRequest(`/archives/${id}/wall/${wallId}`, { isHidden: true }, { Authorization: `Bearer ${otherOwner}` })).status).toBe(403);
      expect((await deleteRequest(`/archives/${id}/wall/${wallId}`, { Authorization: `Bearer ${otherOwner}` })).status).toBe(403);
      expect((await request(`/archives/${id}/revisions`)).status).toBe(403);
      expect((await request(`/archives/${id}/revisions`, undefined, { Authorization: `Bearer ${ownOwner}` })).status).toBe(200);
      expect((await request(`/archives/${id}/revisions/${revisionId}/restore`, {})).status).toBe(403);
    } finally {
      db.sessions.delete(otherOwner);
      db.sessions.delete(ownOwner);
    }
  });
});

describe('Durable save acknowledgement', () => {
  it('does not report a mutation as successful when persistence fails', async () => {
    vi.mocked(db.persist).mockRejectedValueOnce(new Error('simulated durable storage failure'));
    const response = await request('/analytics', { eventName: 'test_storage_failure' });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'The change could not be saved to durable storage. Retry without closing this page.',
      storageCode: 'storage-unavailable'
    });
  });

  it('rolls an archive mutation back when durable storage rejects it', async () => {
    const id = 'demo-marys-2025';
    const owner = createSignedToken(id, 'owner', 1);
    const originalTitle = db.findById(id)!.title;
    vi.mocked(db.persistArchive).mockRejectedValueOnce(new Error('simulated tenant save failure'));
    try {
      const response = await patchRequest(`/archives/${id}`, { title: 'Must not remain in memory' }, { Authorization: `Bearer ${owner}` });
      expect(response.status).toBe(503);
      expect(db.findById(id)!.title).toBe(originalTitle);
    } finally {
      db.sessions.delete(owner);
    }
  });
});

describe('API error responses', () => {
  it('returns a JSON 404 instead of the frontend document for an unknown API route', async () => {
    const response = await request('/route-that-does-not-exist');
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({ error: 'API route not found.' });
  });

  it('returns a sanitized JSON error for a malformed archive address', async () => {
    const response = await request('/archives/by-slug/%E0%A4%A');
    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({ error: 'The request address is invalid.' });
  });

  it('does not expose storage error details when archive loading fails', async () => {
    vi.mocked(db.ensureLoaded).mockRejectedValueOnce(new Error('Supabase secret endpoint failed'));
    const response = await request('/archives');
    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({
      error: 'Archive storage is temporarily unavailable. Please retry.'
    });
  });
});
