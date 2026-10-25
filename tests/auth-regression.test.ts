/**
 * Key-role + token-expiry + migration regression:
 * - expired session tokens are rejected (not silently honored)
 * - viewer/contributor roles cannot perform owner mutations
 * - backup owner key: full owner capability, master key unaffected,
 *   regeneration replaces only the backup key
 * - archives with no pre-existing rate-limit rows (pre-feature "migration"
 *   state) enforce limits from the first attempt
 */
import express from 'express';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { apiRouter } from '../server/api';
import { ownerKeyRouter } from '../server/ownerKeyRouter';
import { db, archiveSaveVersion } from '../server/db';
import { createSignedToken, verifySignedToken } from '../server/auth';

let server: Server;
let base = '';
let id = '';
let owner = '';

const req = (path: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(method === 'GET' ? {} : { Authorization: `Bearer ${owner}` }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

beforeAll(async () => {
  vi.stubEnv('SESSION_SECRET', 'auth-regression-secret');
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use('/api', ownerKeyRouter, apiRouter);
  server = await new Promise<Server>((resolve) => { const i = app.listen(0, '127.0.0.1', () => resolve(i)); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  base = `http://127.0.0.1:${address.port}/api`;
  owner = createSignedToken('bootstrap', 'owner', 1);
  const created = await req('/archives', 'POST', {
    archiveType: 'school', title: 'Auth Regression', organizationName: 'QA', startYear: 2022, endYear: 2026,
    approxPeopleCount: 10, themeId: 'midnight-cinema', visibility: 'unlisted', contributionMode: 'pin-protected',
    editorPin: '739281', recoveryKey: 'mc_rec_authreg_master_1'
  });
  expect(created.status).toBe(201);
  id = ((await created.json()) as { archive: { id: string } }).archive.id;
  owner = createSignedToken(id, 'owner', 1);
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  vi.unstubAllEnvs();
});

describe('key roles and token expiry', () => {
  it('rejects an already-expired owner token', async () => {
    const expired = createSignedToken(id, 'owner', -1);
    expect(verifySignedToken(expired).valid).toBe(false);
    const r = await req(`/archives/${id}`, 'PATCH', { subtitle: 'x', baseVersion: archiveSaveVersion(db.findById(id)!) }, { Authorization: `Bearer ${expired}` });
    expect([401, 403]).toContain(r.status);
  });

  it('viewer token cannot mutate settings or wall', async () => {
    const viewer = createSignedToken(id, 'viewer', 1);
    const p = await req(`/archives/${id}`, 'PATCH', { subtitle: 'x', baseVersion: archiveSaveVersion(db.findById(id)!) }, { Authorization: `Bearer ${viewer}` });
    expect(p.status).toBe(403);
    const w = await req(`/archives/${id}/wall`, 'POST', { text: 'hi', authorName: 'v' }, { Authorization: `Bearer ${viewer}` });
    expect([401, 403]).toContain(w.status);
  });

  it('contributor (PIN) token cannot change archive-wide settings but can post', async () => {
    const pinLogin = await fetch(`${base}/archives/${id}/auth/pin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '739281' }) });
    expect(pinLogin.status).toBe(200);
    const contributor = ((await pinLogin.json()) as { token: string }).token;
    const p = await req(`/archives/${id}`, 'PATCH', { subtitle: 'x', baseVersion: archiveSaveVersion(db.findById(id)!) }, { Authorization: `Bearer ${contributor}` });
    expect(p.status).toBe(403);
    const w = await req(`/archives/${id}/wall`, 'POST', { text: 'contrib note', authorName: 'c' }, { Authorization: `Bearer ${contributor}` });
    expect(w.status).toBeLessThan(300);
  });

  it('backup key: owner-capable, master unaffected, regeneration rotates backup only', async () => {
    const regen = await req(`/archives/${id}/auth/recovery/regenerate`, 'POST', {});
    expect(regen.status).toBe(200);
    const backupKey = ((await regen.json()) as { recoveryKey?: string; backupKey?: string }).recoveryKey
      || ((await Promise.resolve(null), ''));
    expect(backupKey.length).toBeGreaterThan(8);
    const login = await fetch(`${base}/archives/auth/key-access`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: backupKey }) });
    const body = await login.json() as { success?: boolean; keyKind?: string; token?: string; error?: string };
    expect(login.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.keyKind).toBe('backup');
    const p = await req(`/archives/${id}`, 'PATCH', { subtitle: 'backup-key-edit', baseVersion: archiveSaveVersion(db.findById(id)!) }, { Authorization: `Bearer ${body.token}` });
    expect(p.status).toBe(200);
    // Master still works:
    const master = await fetch(`${base}/archives/auth/key-access`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'mc_rec_authreg_master_1' }) });
    expect(master.status).toBe(200);
    // Rotate backup: old backup dies, master still fine.
    const regen2 = await req(`/archives/${id}/auth/recovery/regenerate`, 'POST', {});
    expect(regen2.status).toBe(200);
    const oldBackup = await fetch(`${base}/archives/auth/key-access`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: backupKey }) });
    expect(oldBackup.status).toBe(401);
    const master2 = await fetch(`${base}/archives/auth/key-access`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'mc_rec_authreg_master_1' }) });
    expect(master2.status).toBe(200);
  });

  it('migration: archive with no rate-limit rows enforces from the first attempt', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await fetch(`${base}/archives/${id}/auth/pin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '000000' }) });
      expect(r.status).toBe(401);
    }
    const locked = await fetch(`${base}/archives/${id}/auth/pin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '739281' }) });
    expect(locked.status).toBe(401);
    expect(JSON.stringify(await locked.json())).toMatch(/locked|too many|try again/i);
  });
});
