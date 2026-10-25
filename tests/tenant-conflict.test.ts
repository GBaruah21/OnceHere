import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

const DB_PATH = '/tmp/tenant-conflict-test.db';
process.env.TURSO_DATABASE_URL = `file:${DB_PATH}`;
process.env.TURSO_AUTH_TOKEN = 'test-token';

import { MemoryDatabase, TenantConflictError } from '../server/db';

// Two MemoryDatabase instances against one durable store = two serverless
// instances serving the same archive. This is the deployment shape where a
// whole-tenant snapshot overwrite silently loses concurrent edits.
describe('cross-instance tenant write conflict', () => {
  let instA: MemoryDatabase;
  let instB: MemoryDatabase;

  beforeAll(async () => {
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(DB_PATH + suffix, { force: true });
    instA = new MemoryDatabase();
    instB = new MemoryDatabase();
    await instA.ensureLoaded();
    await instB.ensureLoaded();
  });

  it('rejects the loser of a concurrent save instead of silently losing the winner', async () => {
    const id = 'demo-marys-2025';
    await instA.persistArchive(id);
    await instB.ensureArchiveLoaded(id);
    // A edits and saves first.
    instA.updateArchive(id, { subtitle: 'instance-A edit' });
    await instA.persistArchive(id);
    // B edits its now-stale in-memory copy and saves without refreshing:
    // this is the refresh->persist race window, forced deterministically.
    instB.updateArchive(id, { subtitle: 'instance-B edit' });
    await expect(instB.persistArchive(id)).rejects.toBeInstanceOf(TenantConflictError);
    // The winner's edit survived and B converged to the winning copy.
    expect(instB.findById(id)?.subtitle).toBe('instance-A edit');
  });

  it('accepts a fresh save after reloading the winner (retry path works)', async () => {
    const id = 'demo-marys-2025';
    // B is converged after the previous conflict reload; a new edit now saves.
    instB.updateArchive(id, { subtitle: 'instance-B retry' });
    await expect(instB.persistArchive(id)).resolves.toBeUndefined();
    // And A sees B's newer copy after a forced freshness check.
    await instA.refreshArchiveIfStale(id, 0);
    expect(instA.findById(id)?.subtitle).toBe('instance-B retry');
  });
});

// Each hole below was named in review: same-ms tokens, first insert,
// multitenant queue isolation, index-row merge, winner never clobbered.
describe('CAS hardening against the reviewed holes', () => {
  const DEMO = 'demo-marys-2025';
  let instA: MemoryDatabase;
  let instB: MemoryDatabase;

  beforeAll(async () => {
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(DB_PATH + suffix, { force: true });
    instA = new MemoryDatabase();
    instB = new MemoryDatabase();
    await instA.ensureLoaded();
    await instB.ensureLoaded();
    await instA.ensureArchiveLoaded(DEMO);
    await instB.ensureArchiveLoaded(DEMO);
  });

  it('same-millisecond writes still get distinct version tokens (no stale overwrite)', async () => {
    const { vi } = await import('vitest');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T12:00:00.000Z'));
    try {
      instA.updateArchive(DEMO, { subtitle: 'A same-ms edit' });
      await instA.persistArchive(DEMO);
      instB.updateArchive(DEMO, { subtitle: 'B same-ms edit' });
      // Identical timestamp prefix: old code would treat the rows as one write.
      await expect(instB.persistArchive(DEMO)).rejects.toBeInstanceOf(TenantConflictError);
      expect(instB.findById(DEMO)?.subtitle).toBe('A same-ms edit');
    } finally {
      vi.useRealTimers();
    }
  });

  it('same-ms reader equality: a different token written in the same ms is reloaded, not skipped', async () => {
    const { vi } = await import('vitest');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T12:00:00.000Z'));
    try {
      await instB.refreshArchiveIfStale(DEMO, 0);
      instA.updateArchive(DEMO, { subtitle: 'A second same-ms edit' });
      await instA.persistArchive(DEMO);
      await instB.refreshArchiveIfStale(DEMO, 0);
      expect(instB.findById(DEMO)?.subtitle).toBe('A second same-ms edit');
    } finally {
      vi.useRealTimers();
    }
  });

  it('first-insert collision on the same archive id refuses to overwrite', async () => {
    const base = instA.findById(DEMO)!;
    const id = 'arc-collision-1';
    const mk = (title: string) => ({ ...base, id, slug: 'collision-x', workspaceSlug: 'ws-collision-x', title });
    (instA as any).archives.set(id, mk('from A'));
    (instB as any).archives.set(id, mk('from B'));
    await instA.persistArchive(id);
    await expect(instB.persistArchive(id)).rejects.toBeInstanceOf(TenantConflictError);
    expect(instB.findById(id)?.title).toBe('from A');
  });

  it('a conflict on one archive never rejects another archive’s queued write', async () => {
    const base = instA.findById(DEMO)!;
    const idX = 'arc-queue-x';
    const idY = 'arc-queue-y';
    for (const [inst, id, title] of [[instA, idX, 'X'], [instA, idY, 'Y']] as const) {
      (inst as any).archives.set(id, { ...base, id, slug: id, workspaceSlug: 'ws-' + id, title });
    }
    await instA.persistArchive(idX);
    await instA.persistArchive(idY);
    // B loads both, then A edits X; B edits both X (stale) and Y (fresh).
    await instB.ensureArchiveLoaded(idX);
    await instB.ensureArchiveLoaded(idY);
    instA.updateArchive(idX, { title: 'X winner on A' });
    await instA.persistArchive(idX);
    (instB as any).archives.get(idX)!.title = 'X stale on B';
    (instB as any).archives.get(idY)!.title = 'Y edited on B';
    await expect(instB.persistArchive(idX)).rejects.toBeInstanceOf(TenantConflictError);
    await expect(instB.persistArchive(idY)).resolves.toBeUndefined();
    const c = new MemoryDatabase();
    await c.ensureLoaded();
    await c.ensureArchiveLoaded(idY);
    expect(c.findById(idY)?.title).toBe('Y edited on B');
  });

  it('concurrent archive creation on two instances merges into one index (no erased listings)', async () => {
    const base = instA.findById(DEMO)!;
    const seedMaps = (inst: MemoryDatabase, id: string) => {
      for (const m of [(inst as any).sections, (inst as any).timelineEvents, (inst as any).members, (inst as any).memberMessages, (inst as any).mediaItems, (inst as any).albums, (inst as any).wallPosts, (inst as any).revisions, (inst as any).accessLogs, (inst as any).shareActivity] as Map<string, any[]>[]) m.set(id, []);
    };
    const id1 = 'arc-idx-1';
    const id2 = 'arc-idx-2';
    (instA as any).archives.set(id1, { ...base, id: id1, slug: 'idx-one', workspaceSlug: 'ws-idx-one', title: 'Index One' });
    seedMaps(instA, id1);
    (instB as any).archives.set(id2, { ...base, id: id2, slug: 'idx-two', workspaceSlug: 'ws-idx-two', title: 'Index Two' });
    seedMaps(instB, id2);
    await instA.persistArchive(id1); // tenant + index write
    await instB.persistArchive(id2); // tenant ok, index conflicts -> merge -> retry
    const c = new MemoryDatabase();
    await c.ensureLoaded();
    expect(c.findById(id1)?.title).toBe('Index One');
    expect(c.findById(id2)?.title).toBe('Index Two');
  });

  it('a rejected save never alters the winning durable row', async () => {
    instA.updateArchive(DEMO, { subtitle: 'durable winner' });
    await instA.persistArchive(DEMO);
    const before = instB.findById(DEMO)?.subtitle;
    (instB as any).archives.get(DEMO)!.subtitle = 'loser overwrite attempt';
    await expect(instB.persistArchive(DEMO)).rejects.toBeInstanceOf(TenantConflictError);
    const c = new MemoryDatabase();
    await c.ensureLoaded();
    await c.ensureArchiveLoaded(DEMO);
    expect(c.findById(DEMO)?.subtitle).toBe('durable winner');
    expect(before).not.toBe('loser overwrite attempt');
  });
});
