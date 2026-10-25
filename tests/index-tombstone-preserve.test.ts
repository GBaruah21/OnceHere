import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryDatabase } from '../server/db';

// Regression: a soft-delete (deleteArchive) sets deletedAt without bumping
// updatedAt. A second warm instance holding a pre-delete copy then flushes an
// unrelated tenant write; its guarded index write conflicts, and the merge
// kept "fresher by updatedAt, ties keep ours" - so the stale pre-delete entry
// tied and survived, and the durable index lost the tombstone.
const DEMO = 'demo-marys-2025';
let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oncehere-tombstone-'));
  process.env.TURSO_DATABASE_URL = `file:${path.join(dir, 'state.db')}`;
  process.env.TURSO_AUTH_TOKEN = 'test-token';
});
afterEach(() => {
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('index merge must preserve tombstones', () => {
  it('a stale instance flushing an unrelated write must not resurrect a deleted index entry', async () => {
    const a = new MemoryDatabase();
    const b = new MemoryDatabase();
    await a.ensureLoaded();
    await b.ensureLoaded();
    await a.ensureArchiveLoaded(DEMO);
    await b.ensureArchiveLoaded(DEMO);

    // Instance A soft-deletes the archive; the flush writes row + guarded index.
    expect(a.deleteArchive(DEMO)).toBe(true);
    await a.persistArchive(DEMO);

    // Instance B never saw the delete: it still holds the pre-delete copy and
    // refreshIndexIfMissing never overwrites held entries.
    expect(b.archives.get(DEMO)!.deletedAt).toBeUndefined();

    // B flushes an unrelated tenant write (new archive), forcing a guarded
    // index write against a moved CAS basis -> conflict -> merge -> retry.
    const NEWID = 'arc-test-unrelated-writer';
    (b as any).createArchive({
      id: NEWID,
      workspaceSlug: 'ws-test-unrelated',
      title: 'Unrelated Writer',
      organizationName: 'QA',
      visibility: 'public',
      deploymentStatus: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    } as any);
    await b.persistArchive(NEWID);

    // The durable index must still carry the tombstone for DEMO.
    const c = new MemoryDatabase();
    await c.ensureLoaded();
    const entry = c.archives.get(DEMO);
    expect(entry, 'index entry for deleted archive missing entirely').toBeDefined();
    expect(entry!.deletedAt, 'durable index lost the deletedAt tombstone').toBeTruthy();
  });

  it('a fresh delete remains visible to later cold starts (sanity)', async () => {
    const a = new MemoryDatabase();
    await a.ensureLoaded();
    await a.ensureArchiveLoaded(DEMO);
    a.deleteArchive(DEMO);
    await a.persistArchive(DEMO);
    const c = new MemoryDatabase();
    await c.ensureLoaded();
    expect(c.archives.get(DEMO)?.deletedAt).toBeTruthy();
  });
});
