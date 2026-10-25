import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryDatabase } from '../server/db';

// Two MemoryDatabase objects on one real libSQL file = two warm serverless instances sharing Turso.
const DEMO = 'demo-marys-2025';
let dir: string;

async function twoInstances() {
  const a = new MemoryDatabase();
  const b = new MemoryDatabase();
  await a.ensureLoaded();
  await b.ensureLoaded();
  await a.ensureArchiveLoaded(DEMO);
  await b.ensureArchiveLoaded(DEMO);
  return { a, b };
}

const setTitle = (d: MemoryDatabase, title: string) => { d.archives.get(DEMO)!.title = title; };
const addWall = (d: MemoryDatabase, id: string) => {
  d.wallPosts.get(DEMO)!.push({ id, archiveId: DEMO, authorName: 'T', message: id, likesCount: 0, createdAt: new Date().toISOString() } as any);
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oncehere-multi-'));
  process.env.TURSO_DATABASE_URL = `file:${path.join(dir, 'state.db')}`;
  process.env.TURSO_AUTH_TOKEN = 'test-token';
});
afterEach(() => {
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('two serverless instances sharing one database', () => {
  it('CLOSED by CAS: a stale save is REJECTED instead of overwriting A\'s edit', async () => {
    const { a, b } = await twoInstances();
    setTitle(a, 'Edited on A');
    await a.persistArchive(DEMO);
    expect(b.archives.get(DEMO)!.title).not.toBe('Edited on A'); // stale read

    addWall(b, 'wall-from-B');
    // Pre-CAS this silently clobbered A's edit. Now it fails closed...
    await expect(b.persistArchive(DEMO)).rejects.toThrow(/Save rejected/);
    const c = new MemoryDatabase();
    await c.ensureLoaded();
    await c.ensureArchiveLoaded(DEMO);
    expect(c.archives.get(DEMO)!.title).toBe('Edited on A'); // A's edit preserved
    // ...and the rejection re-based B on the winner, so a re-applied change saves.
    addWall(b, 'wall-from-B');
    await b.persistArchive(DEMO);
    const d = new MemoryDatabase();
    await d.ensureLoaded();
    await d.ensureArchiveLoaded(DEMO);
    expect(d.archives.get(DEMO)!.title).toBe('Edited on A');
    expect(d.wallPosts.get(DEMO)!.some((p) => p.id === 'wall-from-B')).toBe(true);
  });

  it('FIX: B reloads the newer copy before serving it', async () => {
    const { a, b } = await twoInstances();
    setTitle(a, 'Edited on A');
    await a.persistArchive(DEMO);
    await b.refreshArchiveIfStale(DEMO, 0);
    expect(b.archives.get(DEMO)!.title).toBe('Edited on A');
  });

  it('FIX: refreshing before a write keeps both A\'s edit and B\'s new wall post', async () => {
    const { a, b } = await twoInstances();
    setTitle(a, 'Edited on A');
    await a.persistArchive(DEMO);
    await b.refreshArchiveIfStale(DEMO, 0); // re-base the tenant
    await b.refreshIndexIfMissing(0);       // re-base the index too (CAS covers both)
    addWall(b, 'wall-from-B');
    await b.persistArchive(DEMO);

    const c = new MemoryDatabase();
    await c.ensureLoaded();
    await c.ensureArchiveLoaded(DEMO);
    expect(c.archives.get(DEMO)!.title).toBe('Edited on A');
    expect(c.wallPosts.get(DEMO)!.some((p) => p.id === 'wall-from-B')).toBe(true);
  });

  it('does nothing when nothing changed, and never throws', async () => {
    const { b } = await twoInstances();
    const before = b.archives.get(DEMO);
    await b.refreshArchiveIfStale(DEMO, 0);
    expect(b.archives.get(DEMO)).toBe(before); // same object: no reload
    await b.refreshArchiveIfStale('does-not-exist', 0);
  });

  it('keeps local state while a local save is in flight, then that stale save fails closed and re-bases', async () => {
    const { a, b } = await twoInstances();
    setTitle(a, 'Edited on A');
    await a.persistArchive(DEMO);
    setTitle(b, 'Local unsaved edit on B');
    const saving = b.persistArchive(DEMO); // queued, in flight
    await b.refreshArchiveIfStale(DEMO, 0);
    expect(b.archives.get(DEMO)!.title).toBe('Local unsaved edit on B'); // refresh never clobbers an in-flight save
    // B's in-flight save was computed on the stale copy: rejected, not landed over A.
    await expect(saving).rejects.toThrow(/Save rejected/);
    // The rejection re-based B on the winner: the unsaved edit is gone WITH an
    // honest error, and B now holds A's content.
    expect(b.archives.get(DEMO)!.title).toBe('Edited on A');
  });

  it('B finds an archive that A created after B started', async () => {
    const { a, b } = await twoInstances();
    const base = a.archives.get(DEMO)!;
    const id = 'arc-new-1';
    a.archives.set(id, { ...base, id, slug: 'brand-new', workspaceSlug: 'ws-brand-new', title: 'Brand new' });
    for (const m of [a.sections, a.timelineEvents, a.members, a.memberMessages, a.mediaItems, a.albums, a.wallPosts, a.revisions, a.accessLogs, a.shareActivity] as Map<string, any[]>[]) m.set(id, []);
    await a.persistArchive(id);
    expect(b.findBySlug('brand-new')).toBeUndefined();
    await b.refreshIndexIfMissing(0);
    expect(b.findBySlug('brand-new')?.id).toBe(id);
    await b.ensureArchiveLoaded(id);
    expect(b.archives.get(id)!.title).toBe('Brand new');
    // existing archives untouched by an index refresh
    expect(b.archives.get(DEMO)).toBeDefined();
  });

  it('throttles index checks so random slugs cannot hammer the database', async () => {
    const { b } = await twoInstances();
    await b.refreshIndexIfMissing(60_000);
    const first = (b as any).indexCheckedAt;
    await b.refreshIndexIfMissing(60_000);
    expect((b as any).indexCheckedAt).toBe(first);
  });
});
