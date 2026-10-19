import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, MemoryDatabase } from '../server/db';
import { findArchiveAndVerifyKey } from '../server/auth';

// "A" creates an archive; the shared `db` plays instance "B", started BEFORE the archive existed.
let dir: string;
const KEY = 'ARCHIVE-KEY-abcdefghij-1234567890';

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oncehere-create-'));
  process.env.TURSO_DATABASE_URL = `file:${path.join(dir, 'state.db')}`;
  process.env.TURSO_AUTH_TOKEN = 'test-token';
  (db as any).loadedFromStorage = false;
  (db as any).schemaReady = undefined;
  (db as any).indexCheckedAt = 0;
});
afterEach(() => {
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  fs.rmSync(dir, { recursive: true, force: true });
});

async function createOnInstanceA(id: string, slug: string) {
  const a = new MemoryDatabase();
  await a.ensureLoaded();
  const base = a.archives.get('demo-marys-2025')!;
  a.archives.set(id, { ...base, id, slug, workspaceSlug: `ws-${slug}`, title: `Throwaway ${slug}`, deletedAt: undefined, recoveryKeyHash: bcrypt.hashSync(KEY, 4) } as any);
  for (const m of [a.sections, a.timelineEvents, a.members, a.memberMessages, a.mediaItems, a.albums, a.wallPosts, a.revisions, a.accessLogs, a.shareActivity] as Map<string, any[]>[]) m.set(id, []);
  await a.persistArchive(id);
}

describe('create on one instance, owner key on another', () => {
  it('BEFORE the fix the other instance does not know the archive (reproduces "invalid key")', async () => {
    await db.ensureLoaded(); // instance B starts first
    await createOnInstanceA('arc-t1', 'throwaway-one');
    expect(db.findBySlug('throwaway-one')).toBeUndefined();
    expect(db.findById('arc-t1')).toBeUndefined();
  });

  it('AFTER the fix the correct key unlocks the new archive on the other instance', async () => {
    await db.ensureLoaded();
    await createOnInstanceA('arc-t2', 'throwaway-two');
    const result = await findArchiveAndVerifyKey(KEY);
    expect(result.success).toBe(true);
    expect(result.archive.id).toBe('arc-t2');
    await db.ensureArchiveLoaded('arc-t2');
    expect(db.findBySlug('throwaway-two')?.id).toBe('arc-t2');
  });

  it('a wrong key still fails, and does not hammer the database', async () => {
    await db.ensureLoaded();
    await createOnInstanceA('arc-t3', 'throwaway-three');
    const bad = await findArchiveAndVerifyKey('WRONG-KEY-abcdefghij-1234567890');
    expect(bad.success).toBe(false);
    const checkedAt = (db as any).indexCheckedAt;
    const bad2 = await findArchiveAndVerifyKey('WRONG-KEY-abcdefghij-1234567890');
    expect(bad2.success).toBe(false);
    expect((db as any).indexCheckedAt).toBe(checkedAt); // throttled: no second read
  });

  it('existing archives and keys behave as before (no refresh on a hit)', async () => {
    await db.ensureLoaded();
    const before = (db as any).indexCheckedAt;
    const ok = await findArchiveAndVerifyKey('sample_key');
    expect(ok.success).toBe(true);
    expect(ok.archive.id.startsWith('demo-')).toBe(true);
    expect((db as any).indexCheckedAt).toBe(before);
  });

  it('refreshIndexIfMissing only adds, never replaces what the instance holds', async () => {
    await db.ensureLoaded();
    const held = db.archives.get('demo-marys-2025')!;
    held.title = 'Local title';
    await createOnInstanceA('arc-t4', 'throwaway-four');
    expect(await db.refreshIndexIfMissing(0)).toBe(1);
    expect(db.archives.get('demo-marys-2025')).toBe(held);
    expect(db.archives.get('demo-marys-2025')!.title).toBe('Local title');
    expect(db.findById('arc-t4')).toBeDefined();
    expect(await db.refreshIndexIfMissing(0)).toBe(0);
  });

  it('no durable storage configured: does nothing and does not throw', async () => {
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    expect(await new MemoryDatabase().refreshIndexIfMissing(0)).toBe(0);
  });
});
