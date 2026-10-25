/**
 * Mid-session storage loss: durable storage is configured and WORKING at
 * startup (archive creation + first PATCH persist fine), then the backing
 * store becomes unreachable. From that point, every mutation must fail
 * honestly (503, never a fake success), the failed change must NOT leak into
 * the in-memory copy (the persistence wrapper's capture/restore rollback),
 * and reads keep serving the last good state.
 */
import express from 'express';
import cookieParser from 'cookie-parser';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { apiRouter } from '../server/api';
import { ownerKeyRouter } from '../server/ownerKeyRouter';
import { db, archiveSaveVersion } from '../server/db';
import { createSignedToken } from '../server/auth';

let server: Server;
let base = '';
let id = '';
let owner = '';
let dir = '';

const req = (path: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(method === 'GET' ? {} : { Authorization: `Bearer ${owner}` }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'storage-lost-'));
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('SESSION_SECRET', 'storage-lost-test-secret');
  vi.stubEnv('TURSO_DATABASE_URL', `file:${join(dir, 'c.db')}`);
  vi.stubEnv('TURSO_AUTH_TOKEN', 'x');
  const app = express();
  app.use(cookieParser());
  app.use('/api', ownerKeyRouter, apiRouter);
  server = await new Promise<Server>((resolve) => { const i = app.listen(0, '127.0.0.1', () => resolve(i)); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  base = `http://127.0.0.1:${address.port}/api`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe('Storage lost mid-session fails honestly and rolls back', () => {
  it('creates and patches an archive while storage is healthy', async () => {
    owner = createSignedToken('bootstrap', 'owner', 1);
    const created = await req('/archives', 'POST', {
      archiveType: 'school', title: 'Storage Loss Probe', organizationName: 'QA', startYear: 2024, endYear: 2026,
      approxPeopleCount: 10, themeId: 'midnight-cinema', visibility: 'public', contributionMode: 'pin-protected', editorPin: '739281',
      recoveryKey: 'storage_loss_probe_key_1'
    });
    expect(created.status).toBe(201);
    id = ((await created.json()) as { archive: { id: string } }).archive.id;
    owner = createSignedToken(id, 'owner', 1);
    const patched = await req(`/archives/${id}`, 'PATCH', { subtitle: 'saved-while-healthy', baseVersion: archiveSaveVersion(db.findById(id)!) });
    expect(patched.status).toBe(200);
    expect(db.findById(id)!.subtitle).toBe('saved-while-healthy');
  });

  it('PATCH after storage loss: honest 503 and NO in-memory leak of the change', async () => {
    vi.stubEnv('TURSO_DATABASE_URL', 'file:/proc/definitely-not-a-real-dir-mid-session/c.db');
    const before = archiveSaveVersion(db.findById(id)!);
    const r = await req(`/archives/${id}`, 'PATCH', { subtitle: 'must-not-leak', baseVersion: before });
    expect(r.status).toBe(503);
    const body = await r.json().catch(() => ({}));
    expect(String((body as { error?: string }).error || '')).toMatch(/could not be saved|not configured|unavailable/i);
    // Handler rollback: the failed change must not be visible in memory...
    expect(db.findById(id)!.subtitle).toBe('saved-while-healthy');
    // ...and therefore not to any other reader of this instance either.
    const read = await req(`/archives/${id}`, 'GET', undefined, { Authorization: `Bearer ${owner}` });
    expect(read.status).toBe(200);
    expect(((await read.json()) as { archive: { subtitle?: string } }).archive.subtitle).toBe('saved-while-healthy');
  });

  it('sub-resource mutation after storage loss: honest 503 and memory unchanged', async () => {
    const before = db.getTimelineEvents(id).length;
    const r = await req(`/archives/${id}/timeline`, 'POST', { title: 'Leak probe', description: 'must not persist', yearLabel: '2024' });
    expect(r.status).toBe(503);
    expect(db.getTimelineEvents(id).length).toBe(before);
  });

  it('sign-in after storage loss: honest 503 (no fake session)', async () => {
    // Correct PIN, but the counter clear cannot reach durable storage: the
    // route must fail closed with storageError -> 503, not issue a session
    // whose activity/counter state was never persisted.
    const r = await req(`/archives/${id}/auth/pin`, 'POST', { pin: '739281' }, { Authorization: '' });
    expect(r.status).toBe(503);
  });
});
