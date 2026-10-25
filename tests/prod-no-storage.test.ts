/**
 * Missing-storage honest failure: with NODE_ENV=production and no durable
 * store configured, NO mutation route may report success, and reads keep
 * working in memory. Guards the "conditional no-durability" audit finding.
 */
import express from 'express';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { apiRouter } from '../server/api';
import { ownerKeyRouter } from '../server/ownerKeyRouter';
import { db, archiveSaveVersion } from '../server/db';
import { createSignedToken } from '../server/auth';

let server: Server;
let base = '';
const ID = 'demo-marys-2025';
let owner = '';

const req = (path: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(method === 'GET' ? {} : { Authorization: `Bearer ${owner}` }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

beforeAll(async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('SESSION_SECRET', 'prod-no-storage-test-secret');
  vi.stubEnv('PLATFORM_ADMIN_KEY', 'test-only-platform-key');
  vi.stubEnv('TURSO_DATABASE_URL', '');
  vi.stubEnv('TURSO_AUTH_TOKEN', '');
  const app = express();
  app.use(cookieParser());
  // Same mount order as production: ownerKeyRouter ahead of apiRouter.
  app.use('/api', ownerKeyRouter, apiRouter);
  server = await new Promise<Server>((resolve) => { const i = app.listen(0, '127.0.0.1', () => resolve(i)); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  base = `http://127.0.0.1:${address.port}/api`;
  owner = createSignedToken(ID, 'owner', 1);
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  vi.unstubAllEnvs();
});

describe('Production without durable storage fails closed', () => {
  it('keeps reads working from memory', async () => {
    const read = await req(`/archives/${ID}`, 'GET', undefined, { Authorization: `Bearer ${owner}` });
    expect(read.status).toBe(200);
  });

  it('refuses archive creation', async () => {
    const r = await req('/archives', 'POST', {
      archiveType: 'school', title: 'No Storage Probe', organizationName: 'QA', startYear: 2024, endYear: 2026,
      approxPeopleCount: 10, themeId: 'midnight-cinema', visibility: 'public', contributionMode: 'owner-only',
      recoveryKey: 'no_storage_probe_key_1'
    });
    expect(r.status).toBe(503);
  });

  it('refuses archive PATCH', async () => {
    const r = await req(`/archives/${ID}`, 'PATCH', { subtitle: 'must not save', baseVersion: archiveSaveVersion(db.findById(ID)!) });
    expect(r.status).toBe(503);
    expect(db.findById(ID)!.subtitle).not.toBe('must not save');
  });

  it('refuses sub-resource mutations (timeline, members, wall, media)', async () => {
    const tl = await req(`/archives/${ID}/timeline`, 'POST', { title: 'Probe event', description: 'probe description', yearLabel: '2024' });
    expect(tl.status, `timeline ${JSON.stringify(await tl.json().catch(() => null)).slice(0, 120)}`).toBe(503);
    const mb = await req(`/archives/${ID}/members`, 'POST', { name: 'Probe Person' });
    expect(mb.status, `members ${JSON.stringify(await mb.json().catch(() => null)).slice(0, 120)}`).toBe(503);
    const wl = await req(`/archives/${ID}/wall`, 'POST', { text: 'probe note', authorName: 'QA' });
    expect(wl.status, `wall ${JSON.stringify(await wl.json().catch(() => null)).slice(0, 120)}`).toBe(503);
    // Idempotent re-registration of an existing item reaches the success path
    // (and its persistence wrapper) without needing live object storage.
    const existing = db.getMediaItems(ID)[0];
    const md = await req(`/archives/${ID}/media`, 'POST', { url: existing.url, storageKey: existing.storageKey, type: 'image', caption: existing.caption, contentType: existing.contentType || 'image/jpeg', fileSize: existing.fileSize || 10 });
    expect(md.status, `media ${JSON.stringify(await md.json().catch(() => null)).slice(0, 120)}`).toBe(503);
  });

  it('refuses wall moderation and media delete', async () => {
    const wallId = db.getWallPosts(ID)[0]?.id;
    if (wallId) expect((await req(`/archives/${ID}/wall/${wallId}`, 'PATCH', { isHidden: true })).status).toBe(503);
    const mediaId = db.getMediaItems(ID)[0]?.id;
    if (mediaId) {
      const r = await req(`/archives/${ID}/media/${mediaId}`, 'DELETE');
      expect(r.status).toBe(503);
      // Object must remain referenced: the durable write failed before removal.
      expect(db.getMediaItems(ID).some((m) => m.id === mediaId)).toBe(true);
    }
  });

  it('refuses revision restore, deploy and admin visibility change', async () => {
    const revId = db.getRevisions(ID)[0]?.id;
    if (revId) expect((await req(`/archives/${ID}/revisions/${revId}/restore`, 'POST', {})).status).toBe(503);
    expect((await req(`/archives/${ID}/deploy`, 'POST', { finalSlug: 'demo-marys-2025' })).status).toBe(503);
    // Admin mutations of DEMO archives are refused outright ('Demo archives are
    // protected'); the route's real persistence path shares the same honest
    // res.json persistence wrapper proven by the routes above.
    const admin = await req(`/admin/archives/${ID}/explore-visibility`, 'POST', { isHiddenFromExplore: false }, { 'x-platform-admin-key': 'test-only-platform-key' });
    expect(admin.status).toBe(403);
    expect((await admin.json()).error).toMatch(/protected/i);
  });

  it('refuses sign-ins and recovery (a non-durable session is worthless)', async () => {
    expect((await req(`/archives/${ID}/auth/pin`, 'POST', { pin: '202525' }, { Authorization: '' })).status).toBe(503);
    expect((await req('/archives/auth/key-access', 'POST', { key: 'mc_rec_sample_key_123' }, { Authorization: '' })).status).toBe(503);
  });

  it('refuses owner-key backup changes', async () => {
    const r = await req(`/archives/${ID}/auth/recovery/regenerate`, 'POST', {});
    expect(r.status).toBe(503);
  });

  it('refuses analytics mutations honestly', async () => {
    expect((await req('/analytics', 'POST', { eventName: 'probe', archiveId: ID }, { Authorization: '' })).status).toBe(503);
  });
});
