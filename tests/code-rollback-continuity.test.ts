import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

// THE RECOVERY ROUTE: roll back CODE while keeping CURRENT durable data.
// A candidate-era database (rowVersion-stamped rows, saveVersion markers,
// barrier installed, entries created/edited during the incident window) must
// keep serving under the rolled-back build: every intervening entry, edit and
// deletion continues, no content restore, no merge, no data loss.

const DB_PATH = '/tmp/code-rollback-test.db';
process.env.TURSO_DATABASE_URL = `file:${DB_PATH}`;
process.env.TURSO_AUTH_TOKEN = 'test-token';

import { createClient } from '@libsql/client';
import { MemoryDatabase, encodeSnapshot, decodeSnapshot } from '../server/db';

const BARRIER_SQL = fs.readFileSync('/tmp/oncehere-scan/db/rowversion-barrier.sql', 'utf8');
const barrierStatements = BARRIER_SQL.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
  .split(/END;\s*/).map((s) => s.trim()).filter(Boolean).map((s) => `${s}END;`);
const freshVersion = () => `${new Date().toISOString()}#${Math.random().toString(36).slice(2)}${Date.now()}`;

const minArchive = (id: string) => ({
  id, slug: id, workspaceSlug: `ws-${id}`, title: `Archive ${id}`, subtitle: 'seeded',
  visibility: 'public', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
} as never);
const wallPost = (id: string, archiveId: string) => ({
  id, archiveId, authorName: 'T', text: `note ${id}`, cardStyle: 'polaroid',
  isPinned: false, isApproved: true, likesCount: 0, createdAt: new Date().toISOString()
} as never);

describe('code rollback keeps current durable data (the recovery condition)', () => {
  let raw: ReturnType<typeof createClient>;
  const INDEX = 'tenant-index';

  const rewriteTenant = async (rowId: string, mutate: (snap: Record<string, unknown>) => void) => {
    const row = (await raw.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: [rowId] })).rows[0];
    const env = JSON.parse(String(row.data));
    const snap = decodeSnapshot(env.chunks, env.sha256, env.compression) as Record<string, unknown>;
    mutate(snap);
    await raw.execute({
      sql: 'UPDATE oncehere_state SET data = ?, updated_at = ? WHERE id = ?',
      args: [JSON.stringify({ format: 1, ...encodeSnapshot(snap), rowVersion: freshVersion() }), new Date().toISOString(), rowId]
    });
  };

  beforeAll(async () => {
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(DB_PATH + suffix, { force: true });
    raw = createClient({ url: `file:${DB_PATH}`, authToken: 'test-token' });
    await raw.execute('CREATE TABLE IF NOT EXISTS oncehere_state (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL)');
    for (const stmt of barrierStatements) await raw.execute(stmt);
  });

  it('rolled-back build boots on candidate-era data and keeps operating; nothing is lost', async () => {
    // 1. Pre-incident data
    const instA = new MemoryDatabase();
    await instA.ensureLoaded();
    instA.createArchive(minArchive('rb-a1'));
    instA.createArchive(minArchive('rb-a3'));
    instA.addWallPost('rb-a1', wallPost('p1-pre', 'rb-a1'));
    await instA.persistArchive('rb-a1');
    await instA.persistArchive('rb-a3');

    // 2. Incident window: CANDIDATE-era writes land (fresh rowVersion, saveVersion
    //    markers, new entry, same-entity edit) - the data the rollback must keep.
    await rewriteTenant('tenant-rb-a1', (snap) => {
      const arch = snap.archive as Record<string, unknown>;
      arch.subtitle = 'candidate-era edit';
      arch.saveVersion = '2026-10-25T15:00:00.000Z#1'; // candidate marker the old build never knew
      (snap.wallPosts as unknown[]).push(wallPost('p2-candidate-era', 'rb-a1'));
    });

    // 3. CODE ROLLBACK: a fresh rolled-back build boots on that current data.
    const instB = new MemoryDatabase();
    await instB.ensureLoaded();
    await instB.ensureArchiveLoaded('rb-a1');
    await instB.ensureArchiveLoaded('rb-a3');
    // intervening candidate-era data visible and intact
    expect((instB.findById('rb-a1') as { subtitle?: string })?.subtitle).toBe('candidate-era edit');
    expect(instB.getWallPosts('rb-a1').map((p) => p.id)).toEqual(expect.arrayContaining(['p1-pre', 'p2-candidate-era']));

    // 4. Operation continues on the rolled-back build: new entry, same-entity edit, deletion.
    instB.createArchive(minArchive('rb-a2'));
    instB.updateArchive('rb-a1', { subtitle: 'rolled-back edit' }, 'owner');
    instB.addWallPost('rb-a1', wallPost('p3-after-rollback', 'rb-a1'));
    instB.deleteArchive('rb-a3');
    await instB.persistArchive('rb-a1');
    await instB.persistArchive('rb-a2');
    await instB.persistArchive('rb-a3');

    // 5. Fresh boot verifies: everything that ever existed is accounted for.
    const instC = new MemoryDatabase();
    await instC.ensureLoaded();
    await instC.ensureArchiveLoaded('rb-a1');
    expect((instC.findById('rb-a1') as { subtitle?: string })?.subtitle).toBe('rolled-back edit');
    expect(instC.getWallPosts('rb-a1').map((p) => p.id)).toEqual(
      expect.arrayContaining(['p1-pre', 'p2-candidate-era', 'p3-after-rollback'])); // pre, candidate-era, post-rollback
    expect(instC.findById('rb-a2')).toBeTruthy();        // created under rolled-back build
    expect(instC.findById('rb-a3')).toBeUndefined();     // deletion stuck
    const idx = JSON.parse(String((await raw.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: [INDEX] })).rows[0].data));
    const a3 = (idx.archives as [string, { deletedAt?: string }][]).find(([id]) => id === 'rb-a3');
    expect(a3?.[1].deletedAt).toBeTruthy();
    // all rows remain barrier-stamped (guards never bypassed, no guard removal)
    const unstamped = await raw.execute({
      sql: "SELECT count(*) n FROM oncehere_state WHERE data NOT LIKE '%rowVersion%'"
    });
    expect(Number(unstamped.rows[0].n)).toBe(0);
  });

  it('overlap during rollback fails closed: concurrent candidate-shaped winner preserved', async () => {
    const instD = new MemoryDatabase();
    await instD.ensureLoaded();
    await instD.ensureArchiveLoaded('rb-a1');
    instD.updateArchive('rb-a1', { subtitle: 'rolled-back loser' }, 'owner');
    // candidate-shaped concurrent writer lands first (fresh rowVersion, new content)
    await rewriteTenant('tenant-rb-a1', (snap) => {
      (snap.archive as Record<string, unknown>).subtitle = 'concurrent winner';
    });
    await expect(instD.persistArchive('rb-a1')).rejects.toThrow();
    const instE = new MemoryDatabase();
    await instE.ensureLoaded();
    await instE.ensureArchiveLoaded('rb-a1');
    expect((instE.findById('rb-a1') as { subtitle?: string })?.subtitle).toBe('concurrent winner');
  });
});
