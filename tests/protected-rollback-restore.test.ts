import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';

const DB_PATH = '/tmp/protected-rollback-test.db';
process.env.TURSO_DATABASE_URL = `file:${DB_PATH}`;
process.env.TURSO_AUTH_TOKEN = 'test-token';

import { createClient } from '@libsql/client';
import { MemoryDatabase, decodeSnapshot, encodeSnapshot } from '../server/db';
// The engineered protected-restore route (plain ESM script, no test runner deps).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const restore: any = await import('../db/protected-restore.mjs');

function barrierStatements(): string[] {
  const rawSql = fs.readFileSync(path.join(__dirname, '..', 'db', 'rowversion-barrier.sql'), 'utf8');
  const noComments = rawSql.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n');
  return noComments.split(/END;\s*/).map((s) => s.trim()).filter(Boolean).map((s) => `${s}END;`);
}

const freshVersion = () => `${new Date().toISOString()}#${Math.random().toString(36).slice(2)}${Date.now()}`;

// EXACT write shape of every pre-barrier build (main:server/db.ts upsertRows).
const upsert = (id: string, data: Record<string, unknown>, stamp: string) => ({
  sql: 'INSERT INTO oncehere_state (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
  args: [id, JSON.stringify(data), stamp]
});

describe('protected rollback + restore under the rowVersion barrier', () => {
  let raw: ReturnType<typeof createClient>;
  let inst: MemoryDatabase;
  const id = 'demo-marys-2025';
  const tenantRowId = `tenant-${id}`;

  beforeAll(async () => {
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(DB_PATH + suffix, { force: true });
    raw = createClient({ url: `file:${DB_PATH}`, authToken: 'test-token' });
    inst = new MemoryDatabase();
    await inst.ensureLoaded();
    await inst.persistArchive(id); // candidate-stamped tenant + index rows
    for (const stmt of barrierStatements()) await raw.execute(stmt);
  });

  const readRow = async (rowId: string) => (await raw.execute({
    sql: 'SELECT data, updated_at FROM oncehere_state WHERE id = ?', args: [rowId]
  })).rows[0];

  it('rollback-hotfix branch actually stamps rowVersion in both envelope builders', () => {
    const patched = execSync('git show exp/rollback-hotfix-2026-10-25:server/db.ts', { encoding: 'utf8' });
    const stamps = patched.match(/rowVersion: newRowVersion\(\)/g) || [];
    expect(stamps.length).toBe(2); // tenantStorageRow + tenantIndexSnapshot
    expect(patched).toContain('const newRowVersion = () => `${new Date().toISOString()}#${randomUUID()}`;');
  });

  it('accepts rollback-hotfix (patched old code) writes while the barrier stays installed', async () => {
    // A real patched-old save: decode the candidate row, change content,
    // re-encode with the SAME encoder (the hotfix adds rowVersion only).
    const before = JSON.parse(String((await readRow(tenantRowId)).data));
    const snapshot = decodeSnapshot(before.chunks, before.sha256, before.compression);
    (snapshot.archive as { subtitle: string }).subtitle = 'patched-old save';
    const encoded = encodeSnapshot(snapshot);
    await raw.execute(upsert(tenantRowId, {
      format: before.format, chunks: encoded.chunks, compression: encoded.compression,
      sha256: encoded.sha256, rowVersion: freshVersion() // the hotfix's one addition
    }, new Date().toISOString()));
    const after = JSON.parse(String((await readRow(tenantRowId)).data));
    expect(after.rowVersion).not.toBe(before.rowVersion);
    // Index write shape of the patched build: no sha256, WITH rowVersion.
    const indexBefore = JSON.parse(String((await readRow('tenant-index')).data));
    await raw.execute(upsert('tenant-index', {
      format: indexBefore.format, archives: indexBefore.archives,
      legacyArchiveIds: indexBefore.legacyArchiveIds, platformSettings: indexBefore.platformSettings,
      rowVersion: freshVersion()
    }, new Date().toISOString()));
    const indexAfter = JSON.parse(String((await readRow('tenant-index')).data));
    expect(indexAfter.rowVersion).not.toBe(indexBefore.rowVersion);
  });

  it('still rejects UNPATCHED pre-barrier stragglers while patched code runs', async () => {
    const before = String((await readRow(tenantRowId)).data);
    await expect(raw.execute(upsert(tenantRowId, {
      format: 1, chunks: ['eA=='], compression: 'gzip', sha256: 'STRAGGLER'
    }, new Date().toISOString()))).rejects.toThrow(/rowVersion barrier/);
    expect(String((await readRow(tenantRowId)).data)).toBe(before);
  });

  it('candidate code reads rows written by the rollback-hotfix build', async () => {
    const check = new MemoryDatabase();
    await check.ensureLoaded();
    await check.ensureArchiveLoaded(id);
    expect(check.findById(id)?.subtitle).toBe('patched-old save');
    // And the patched build's reader predicate accepts candidate-written index
    // envelopes (format + archives; sha256/rowVersion are ignored extras).
    const indexNow = JSON.parse(String((await readRow('tenant-index')).data));
    expect(indexNow.format === 1 && Array.isArray(indexNow.archives)).toBe(true);
  });

  it('restores a backup row with a FRESH rowVersion - accepted with guards installed', async () => {
    const backup = await readRow(tenantRowId); // { data, updated_at } as a backup file would hold
    const backupData = JSON.parse(String(backup.data));
    // Time passes: a newer save lands (content + rowVersion advance). A fresh
    // instance models reality (the original's CAS basis is stale after the
    // direct patched-old write above, and it converges by design).
    const newer = new MemoryDatabase();
    await newer.ensureLoaded();
    await newer.ensureArchiveLoaded(id);
    newer.updateArchive(id, { subtitle: 'newer save after backup' });
    await newer.persistArchive(id);
    const current = JSON.parse(String((await readRow(tenantRowId)).data));
    expect(current.rowVersion).not.toBe(backupData.rowVersion);
    // Protected restore of the backup (fresh mint inside buildRestoreRow),
    // conditioned on a FRESH content inventory of the current durable row.
    const inventory = await restore.inventoryRows(raw, [tenantRowId]);
    const result = await restore.restoreRows(raw,
      [{ id: tenantRowId, data: backupData, updated_at: String(backup.updated_at) }],
      { expected: { [tenantRowId]: inventory[0] } });
    expect(result.restored).toEqual([tenantRowId]);
    const restored = JSON.parse(String((await readRow(tenantRowId)).data));
    expect(restored.rowVersion).not.toBe(backupData.rowVersion); // fresh, not replayed
    expect(restored.rowVersion).not.toBe(current.rowVersion);
    const check = new MemoryDatabase();
    await check.ensureLoaded();
    await check.ensureArchiveLoaded(id);
    expect(check.findById(id)?.subtitle).toBe('patched-old save'); // backup content is back
  });

  it('rejects a verbatim replay of the CURRENT rowVersion', async () => {
    const current = JSON.parse(String((await readRow(tenantRowId)).data));
    await expect(raw.execute(upsert(tenantRowId, current, new Date().toISOString())))
      .rejects.toThrow(/rowVersion barrier/);
  });

  it('mints per attempt: replaying one buildRestoreRow output twice fails the second time', async () => {
    const backup = JSON.parse(String((await readRow(tenantRowId)).data));
    const builtOnce = restore.buildRestoreRow({ id: tenantRowId, data: backup });
    await raw.execute(upsert(builtOnce.id, builtOnce.data, builtOnce.updated_at)); // first: OK
    await expect(raw.execute(upsert(builtOnce.id, builtOnce.data, builtOnce.updated_at)))
      .rejects.toThrow(/rowVersion barrier/); // replay of the same mint: rejected
    const builtAgain = restore.buildRestoreRow({ id: tenantRowId, data: backup });
    expect(builtAgain.data.rowVersion).not.toBe(builtOnce.data.rowVersion); // fresh per call
  });

  it('blocks the delete+reinsert restore shape; restore must be upsert-only', async () => {
    await expect(raw.execute({ sql: 'DELETE FROM oncehere_state WHERE id = ?', args: [tenantRowId] }))
      .rejects.toThrow(/rowVersion barrier/);
  });

  it('restores into a row that does not exist yet (fresh-id INSERT passes)', async () => {
    const backup = JSON.parse(String((await readRow(tenantRowId)).data));
    const result = await restore.restoreRows(raw, [{ id: 'tenant-restored-copy', data: backup }]);
    expect(result.restored).toEqual(['tenant-restored-copy']);
    expect(JSON.parse(String((await readRow('tenant-restored-copy')).data)).rowVersion).toBeTruthy();
  });

  it('aborts the WHOLE restore when one row moved since inventory (no partial restore)', async () => {
    const tenantBefore = String((await readRow(tenantRowId)).data);
    const tenantStamp = String((await readRow(tenantRowId)).updated_at);
    const indexBefore = String((await readRow('tenant-index')).data);
    const tenantBackup = JSON.parse(tenantBefore);
    const indexBackup = JSON.parse(indexBefore);
    // Tenant base is current; index base is stale (simulates a save landing
    // between the operator's inventory and the restore).
    await expect(restore.restoreRows(raw, [
      { id: tenantRowId, data: tenantBackup },
      { id: 'tenant-index', data: indexBackup }
    ], { expected: {
      [tenantRowId]: { id: tenantRowId, data: tenantBackup, updated_at: tenantStamp },
      'tenant-index': { id: 'tenant-index', data: { stale: true }, updated_at: 'stale-base' }
    } }))
      .rejects.toThrow(/Restore aborted|Refusing to restore/);
    // Atomicity: NEITHER row was restored.
    expect(String((await readRow(tenantRowId)).data)).toBe(tenantBefore);
    expect(String((await readRow('tenant-index')).data)).toBe(indexBefore);
  });

  it('aborts instead of overwriting a save that landed between inventory and restore', async () => {
    const backup = JSON.parse(String((await readRow(tenantRowId)).data));
    const inventory = await restore.inventoryRows(raw, [tenantRowId]);
    // A concurrent save lands after the inventory but before the restore.
    const concurrent = new MemoryDatabase();
    await concurrent.ensureLoaded();
    await concurrent.ensureArchiveLoaded(id);
    concurrent.updateArchive(id, { subtitle: 'concurrent winner' });
    await concurrent.persistArchive(id);
    await expect(restore.restoreRows(raw,
      [{ id: tenantRowId, data: backup }],
      { expected: { [tenantRowId]: inventory[0] } }))
      .rejects.toThrow(/Restore aborted/);
    // The concurrent save is untouched; nothing was restored over it.
    const durable = JSON.parse(String((await readRow(tenantRowId)).data));
    const winnerSnapshot = decodeSnapshot(durable.chunks, durable.sha256, durable.compression);
    expect((winnerSnapshot.archive as { subtitle: string }).subtitle).toBe('concurrent winner');
  });

  it('same-ms repro: refuses when content changed under an UNCHANGED updated_at stamp', async () => {
    const inventory = await restore.inventoryRows(raw, [tenantRowId]);
    const backup = JSON.parse(String((await readRow(tenantRowId)).data));
    // Change the durable row's content while forcing the stamp back to the
    // inventoried value. Under the barrier the only writer that can do this
    // is a barrier-passing one with a bare-ISO stamp - the rollback build:
    // fresh rowVersion (guard passes), same-millisecond updated_at.
    const changed = { ...inventory[0].data, marker: 'same-ms-change', rowVersion: `2026-01-01T00:00:00.000Z#same-ms-writer` };
    await raw.execute({
      sql: 'UPDATE oncehere_state SET data = ?, updated_at = ? WHERE id = ?',
      args: [JSON.stringify(changed), inventory[0].updated_at, tenantRowId]
    });
    expect(String((await readRow(tenantRowId)).updated_at)).toBe(inventory[0].updated_at);
    // A stamp-only precondition would wave the restore through and erase the
    // change; the content precondition must refuse and write NOTHING.
    await expect(restore.restoreRows(raw,
      [{ id: tenantRowId, data: backup }],
      { expected: { [tenantRowId]: inventory[0] } }))
      .rejects.toThrow(/Restore aborted/);
    expect(JSON.parse(String((await readRow(tenantRowId)).data)).marker).toBe('same-ms-change');
  });

  it('refuses to restore over an existing row with no expected base and no force', async () => {
    const before = String((await readRow(tenantRowId)).data);
    const backup = JSON.parse(before);
    await expect(restore.restoreRows(raw, [{ id: tenantRowId, data: backup }]))
      .rejects.toThrow(/Refusing to restore/);
    expect(String((await readRow(tenantRowId)).data)).toBe(before);
  });

  it('force restores over current state deliberately (still atomic + verified)', async () => {
    const backup = JSON.parse(String((await readRow(tenantRowId)).data));
    const result = await restore.restoreRows(raw, [{ id: tenantRowId, data: backup }], { force: true });
    expect(result.restored).toEqual([tenantRowId]);
    expect(result.forced).toBe(true);
  });

  it('keeps all three guards installed after every operation above', async () => {
    const triggers = await raw.execute(
      "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'rv_guard_%' ORDER BY name"
    );
    expect(triggers.rows.map((r) => r.name)).toEqual(['rv_guard_delete', 'rv_guard_insert', 'rv_guard_update']);
  });
});

// ---------------------------------------------------------------------------
// Merge restore: the launch recovery condition. A reversal must restore the
// backup content WITHOUT erasing data that arrived after the backup (new
// entries, new archives, logs, sessions) and without interrupting operation.
// ---------------------------------------------------------------------------
describe('merge restore preserves intervening data (launch recovery condition)', () => {
  const MDB = '/tmp/merge-restore-test.db';
  let mraw: ReturnType<typeof createClient>;
  const INDEX = 'tenant-index';

  const minArchive = (id: string) => ({
    id, slug: id, workspaceSlug: `ws-${id}`,
    title: `Archive ${id}`, subtitle: 'backup subtitle',
    visibility: 'public', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  } as never);

  const wallPost = (id: string, archiveId: string) => ({
    id, archiveId, authorName: 'Tester', text: `note ${id}`, cardStyle: 'polaroid',
    isPinned: false, isApproved: true, likesCount: 0, createdAt: new Date().toISOString()
  } as never);

  const decodeTenant = async (rowId: string) => {
    const row = (await mraw.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: [rowId] })).rows[0];
    const env = JSON.parse(String(row.data));
    return decodeSnapshot(env.chunks, env.sha256, env.compression) as Record<string, unknown>;
  };

  beforeAll(async () => {
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(MDB + suffix, { force: true });
    process.env.TURSO_DATABASE_URL = `file:${MDB}`;
    mraw = createClient({ url: `file:${MDB}`, authToken: 'test-token' });
    await mraw.execute('CREATE TABLE IF NOT EXISTS oncehere_state (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL)');
    for (const stmt of barrierStatements()) await mraw.execute(stmt);
  });

  it('restores backup content while keeping post-backup entries, archives, logs, sessions', async () => {
    // 1. BACKUP POINT: archive A with 'backup subtitle'
    const instA = new MemoryDatabase();
    await instA.ensureLoaded();
    instA.createArchive(minArchive('arch-merge'));
    instA.createArchive(minArchive('arch-del'));
    await instA.persistArchive('arch-merge');
    await instA.persistArchive('arch-del');
    const backupRows = await restore.inventoryRows(mraw, ['tenant-arch-merge', 'tenant-arch-del', INDEX]);

    // 2. INTERVENING OPERATION (new instance = the site kept running):
    const instB = new MemoryDatabase();
    await instB.ensureLoaded();
    await instB.ensureArchiveLoaded('arch-merge'); // read the durable base before editing (CAS precondition)
    await instB.ensureArchiveLoaded('arch-del');
    instB.updateArchive('arch-merge', { subtitle: 'edited after backup' }, 'owner');
    instB.addWallPost('arch-merge', wallPost('post-after-backup', 'arch-merge'));
    instB.createArchive(minArchive('arch-new')); // archive created AFTER the backup
    instB.deleteArchive('arch-del');           // archive deleted AFTER the backup
    await instB.persistArchive('arch-merge');
    await instB.persistArchive('arch-del');
    await instB.persistArchive('arch-new');
    // an intervening session, injected at the data layer (fresh rowVersion = barrier-passing writer)
    {
      const row = (await mraw.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: ['tenant-arch-merge'] })).rows[0];
      const env = JSON.parse(String(row.data));
      const snap = decodeSnapshot(env.chunks, env.sha256, env.compression) as Record<string, unknown>;
      snap.sessions = [['tok-intervening', { token: 'tok-intervening', archiveId: 'arch-merge', createdAt: new Date().toISOString() }]];
      const enc = encodeSnapshot(snap);
      await mraw.execute({
        sql: 'UPDATE oncehere_state SET data = ?, updated_at = ? WHERE id = ?',
        args: [JSON.stringify({ format: 1, ...enc, rowVersion: freshVersion() }), new Date().toISOString(), 'tenant-arch-merge']
      });
    }

    // 3. INVENTORY + MERGE + APPLY (operator flow: inventory -> merge -> conditional apply)
    const inv = await restore.inventoryRows(mraw, ['tenant-arch-merge', 'tenant-arch-del', INDEX]);
    const merged = restore.buildMergedRestoreRows(backupRows, inv);
    expect(merged.rows.map((r: { id: string }) => r.id).sort()).toEqual(['tenant-arch-del', 'tenant-arch-merge', 'tenant-index'].sort());
    // Every merge decision is surfaced in the audit report - nothing is chosen silently.
    expect(merged.report).toContain('preserved-new wallPosts/post-after-backup (created after backup)');
    expect(merged.report).toContain('preserved-new index/arch-new (archive created after backup)');
    expect(merged.report).toContain('preserved-deletion archive (deleted after backup; not resurrected)');
    expect(merged.report).toContain('preserved-deletion index/arch-del (deleted after backup; not resurrected)');
    expect(merged.report.some((line: string) => line.startsWith('reverted archive settings'))).toBe(true);
    const applied = await restore.restoreMergedRows(mraw, merged, inv);
    expect(applied.restored.length).toBe(3);

    // 4. VERIFY with a fresh instance (continued operation reads the merged state)
    const instC = new MemoryDatabase();
    await instC.ensureLoaded();
    await instC.ensureArchiveLoaded('arch-merge'); // tenant content loads lazily
    const arch = instC.findById('arch-merge') as { subtitle?: string } | undefined;
    expect(arch?.subtitle).toBe('backup subtitle');                    // reversal worked
    expect(instC.getWallPosts('arch-merge').map(p => p.id)).toContain('post-after-backup'); // new entry preserved
    expect(instC.findById('arch-new')).toBeTruthy();                   // new archive preserved
    expect(instC.findById('arch-del')).toBeUndefined(); // deleted archives stay hidden from listings
    const idxRow = JSON.parse(String((await mraw.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: [INDEX] })).rows[0].data));
    const delEntry = (idxRow.archives as [string, { deletedAt?: string }][]).find(([entryId]) => entryId === 'arch-del');
    expect(delEntry?.[1].deletedAt).toBeTruthy(); // tombstone preserved, NOT resurrected by the reversal
    const revisions = (instC as unknown as { revisions: Map<string, { id: string; summary: string }[]> }).revisions.get('arch-merge') || [];
    const summaries = revisions.map(r => r.summary);
    expect(summaries).toContain('Archive workspace initialized');      // backup-era history kept
    expect(summaries).toContain('Updated archive settings & details'); // intervening history kept (union, never shrunk)
    const snapC = await decodeTenant('tenant-arch-merge');
    expect(JSON.stringify(snapC.sessions)).toContain('tok-intervening'); // session preserved (nobody logged out)
  });

  it('aborts the whole merge when any row changed after inventory (nothing half-restored)', async () => {
    const backupRows = await restore.inventoryRows(mraw, ['tenant-arch-merge', INDEX]);
    const inv = await restore.inventoryRows(mraw, ['tenant-arch-merge', INDEX]);
    // concurrent writer lands between inventory and restore (barrier-passing shape)
    const row = (await mraw.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: ['tenant-arch-merge'] })).rows[0];
    const env = JSON.parse(String(row.data));
    const snap = decodeSnapshot(env.chunks, env.sha256, env.compression) as Record<string, unknown>;
    (snap.archive as Record<string, unknown>).subtitle = 'concurrent winner';
    const enc = encodeSnapshot(snap);
    await mraw.execute({
      sql: 'UPDATE oncehere_state SET data = ?, updated_at = ? WHERE id = ?',
      args: [JSON.stringify({ format: 1, ...enc, rowVersion: freshVersion() }), new Date().toISOString(), 'tenant-arch-merge']
    });
    const merged = restore.buildMergedRestoreRows(backupRows, inv);
    await expect(restore.restoreMergedRows(mraw, merged, inv)).rejects.toThrow(/changed since inventory/);
    const instD = new MemoryDatabase();
    await instD.ensureLoaded();
    await instD.ensureArchiveLoaded('arch-merge'); // the concurrent winner lives in the tenant row
    expect((instD.findById('arch-merge') as { subtitle?: string })?.subtitle).toBe('concurrent winner');
  });

  it('hard removal is impossible under the barrier, and a missing row restores via row-absent', async () => {
    const instE = new MemoryDatabase();
    await instE.ensureLoaded();
    instE.createArchive(minArchive('arch-gone'));
    await instE.persistArchive('arch-gone');
    const goneBackup = await restore.inventoryRows(mraw, ['tenant-arch-gone']);
    // The barrier REJECTS deleting a stamped row: an intervening hard removal
    // cannot happen while the guards stand (so merge never needs to guess).
    await expect(mraw.execute({ sql: 'DELETE FROM oncehere_state WHERE id = ?', args: ['tenant-arch-gone'] }))
      .rejects.toThrow(/rowVersion barrier/);
    // The row-absent path (row missing from inventory: pre-barrier or external
    // removal) restores the backup content merged against nothing. Simulated
    // with a never-persisted id reusing arch-gone's backup envelope.
    const missingBackup = goneBackup.map((r: { id: string; data: unknown; updated_at: string }) => ({ ...r, id: 'tenant-arch-missing' }));
    const merged = restore.buildMergedRestoreRows(missingBackup, []);
    expect(merged.rows[0].precondition).toBe('row-absent');
    await restore.restoreMergedRows(mraw, merged, []);
    const rowBack = (await mraw.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: ['tenant-arch-missing'] })).rows[0];
    expect(rowBack).toBeTruthy();
    const instF = new MemoryDatabase();
    await instF.ensureLoaded();
    expect(instF.findById('arch-gone')).toBeTruthy(); // the blocked DELETE never landed
  });

  it('refuses to merge a legacy (format 0) index row with a clear error', async () => {
    const legacyIndex = JSON.stringify({ format: 0, archives: [['legacy-one', { id: 'legacy-one' }]], rowVersion: freshVersion() });
    const currentIndex = JSON.stringify({ format: 0, archives: [['legacy-one', { id: 'legacy-one' }], ['new-one', { id: 'new-one' }]], rowVersion: freshVersion() });
    expect(() => restore.buildMergedRestoreRows(
      [{ id: INDEX, data: JSON.parse(legacyIndex), updated_at: 'x' }],
      [{ id: INDEX, data: currentIndex, updated_at: 'y' }]
    )).toThrow(/platform index envelopes only/);
  });
});
