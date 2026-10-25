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
    // Protected restore of the backup (fresh mint inside buildRestoreRow).
    const result = await restore.restoreRows(raw, [{ id: tenantRowId, data: backupData, updated_at: String(backup.updated_at) }]);
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

  it('keeps all three guards installed after every operation above', async () => {
    const triggers = await raw.execute(
      "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'rv_guard_%' ORDER BY name"
    );
    expect(triggers.rows.map((r) => r.name)).toEqual(['rv_guard_delete', 'rv_guard_insert', 'rv_guard_update']);
  });
});
