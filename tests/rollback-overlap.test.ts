import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';

const DB_PATH = '/tmp/rollback-overlap-test.db';
process.env.TURSO_DATABASE_URL = `file:${DB_PATH}`;
process.env.TURSO_AUTH_TOKEN = 'test-token';

import { createClient } from '@libsql/client';
import { MemoryDatabase, decodeSnapshot, encodeSnapshot } from '../server/db';

function barrierStatements(): string[] {
  const rawSql = fs.readFileSync(path.join(__dirname, '..', 'db', 'rowversion-barrier.sql'), 'utf8');
  const noComments = rawSql.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n');
  return noComments.split(/END;\s*/).map((s) => s.trim()).filter(Boolean).map((s) => `${s}END;`);
}

const freshVersion = () => `${new Date().toISOString()}#rb-${Math.random().toString(36).slice(2)}${Date.now()}`;

// v1 rollback shape: unconditional upsert WITH fresh rowVersion (barrier-passing
// but staleness-blind). Kept permanently: it documents why v1 was insufficient.
const v1Upsert = (id: string, data: Record<string, unknown>) => ({
  sql: 'INSERT INTO oncehere_state (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
  args: [id, JSON.stringify(data), new Date().toISOString()]
});

// EXACT write logic of the rollback branch v2 (exp/rollback-hotfix-2026-10-25
// upsertRows): one transaction, conditional per row, abort-all on any miss.
// Bound to the branch by the drift-guard test below.
async function patchedOldPersist(
  raw: ReturnType<typeof createClient>,
  rows: Array<{ id: string; data: Record<string, unknown>; expectedUpdatedAt?: string; expectedRaw?: string }>
): Promise<void> {
  const tx = await raw.transaction('write');
  try {
    for (const row of rows) {
      const data = JSON.stringify(row.data);
      const stamp = new Date().toISOString();
      if (row.expectedUpdatedAt !== undefined && row.expectedRaw === undefined) {
        throw new Error(`Save rejected: no complete base copy is held for ${row.id}. No changes were applied.`);
      }
      const res = row.expectedUpdatedAt === undefined
        ? await tx.execute({ sql: 'INSERT OR IGNORE INTO oncehere_state (id, data, updated_at) VALUES (?, ?, ?)', args: [row.id, data, stamp] })
        : await tx.execute({ sql: 'UPDATE oncehere_state SET data = ?, updated_at = ? WHERE id = ? AND updated_at = ? AND data = ?', args: [data, stamp, row.id, row.expectedUpdatedAt, row.expectedRaw] });
      if ((res.rowsAffected ?? 0) === 0) {
        throw new Error(`Save rejected: ${row.id} was written by another instance at the same time. No changes were applied.`);
      }
    }
    await tx.commit();
  } catch (error) {
    await tx.rollback().catch(() => undefined);
    throw error;
  }
}

describe('rollback build under overlapping writers', () => {
  let raw: ReturnType<typeof createClient>;
  const id = 'demo-marys-2025';
  const tenantRowId = `tenant-${id}`;

  const readRow = async (rowId: string) => (await raw.execute({
    sql: 'SELECT data, updated_at FROM oncehere_state WHERE id = ?', args: [rowId]
  })).rows[0];

  const withSubtitle = async (subtitle: string) => {
    const cur = JSON.parse(String((await readRow(tenantRowId)).data));
    const snapshot = decodeSnapshot(cur.chunks, cur.sha256, cur.compression);
    (snapshot.archive as { subtitle: string }).subtitle = subtitle;
    const encoded = encodeSnapshot(snapshot);
    return { format: cur.format, chunks: encoded.chunks, compression: encoded.compression, sha256: encoded.sha256, rowVersion: freshVersion() };
  };

  beforeAll(async () => {
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(DB_PATH + suffix, { force: true });
    raw = createClient({ url: `file:${DB_PATH}`, authToken: 'test-token' });
    const inst = new MemoryDatabase();
    await inst.ensureLoaded();
    await inst.persistArchive(id); // candidate-stamped rows; barrier installed next
    for (const stmt of barrierStatements()) await raw.execute(stmt);
  });

  it('GAP REPRO (v1 design): an unconditional fresh-rowVersion save clobbers a newer overlapping save', async () => {
    // Overlap: patched-old(v1) instance read at T0; candidate saves T1; v1 writes anyway.
    const t0 = JSON.parse(String((await readRow(tenantRowId)).data));
    const winner = await withSubtitle('candidate newer save');
    await raw.execute({ sql: 'UPDATE oncehere_state SET data = ?, updated_at = ? WHERE id = ?', args: [JSON.stringify(winner), new Date().toISOString(), tenantRowId] });
    // v1 writes its STALE-based content unconditionally - barrier accepts (fresh rowVersion).
    await raw.execute(v1Upsert(tenantRowId, { ...t0, rowVersion: freshVersion() }));
    const durable = JSON.parse(String((await readRow(tenantRowId)).data));
    const snapshot = decodeSnapshot(durable.chunks, durable.sha256, durable.compression);
    // The newer save is GONE. This is the writer-class-not-staleness hole.
    expect((snapshot.archive as { subtitle: string }).subtitle).not.toBe('candidate newer save');
  });

  it('v2: the conditional rollback build fails closed instead of clobbering', async () => {
    const t0 = JSON.parse(String((await readRow(tenantRowId)).data));
    const t0Stamp = String((await readRow(tenantRowId)).updated_at);
    const winner = await withSubtitle('candidate newer save');
    await raw.execute({ sql: 'UPDATE oncehere_state SET data = ?, updated_at = ? WHERE id = ?', args: [JSON.stringify(winner), new Date().toISOString(), tenantRowId] });
    // v3 persist based on the stale T0 copy: honest error, winner preserved.
    await expect(patchedOldPersist(raw, [{ id: tenantRowId, data: { ...t0, rowVersion: freshVersion() }, expectedUpdatedAt: t0Stamp, expectedRaw: JSON.stringify(t0) }]))
      .rejects.toThrow(/Save rejected/);
    const durable = JSON.parse(String((await readRow(tenantRowId)).data));
    const snapshot = decodeSnapshot(durable.chunks, durable.sha256, durable.compression);
    expect((snapshot.archive as { subtitle: string }).subtitle).toBe('candidate newer save');
  });

  it('v3: same-ms repro - content changed under an UNCHANGED stamp is still rejected', async () => {
    const baseRow = await readRow(tenantRowId);
    const baseData = JSON.parse(String(baseRow.data));
    const baseStamp = String(baseRow.updated_at);
    const baseRaw = String(baseRow.data);
    // Another writer changes content; stamp forced back to the base value.
    const changed = await withSubtitle('same-ms changed content');
    await raw.execute({ sql: 'UPDATE oncehere_state SET data = ?, updated_at = ? WHERE id = ?', args: [JSON.stringify(changed), baseStamp, tenantRowId] });
    expect(String((await readRow(tenantRowId)).updated_at)).toBe(baseStamp);
    await expect(patchedOldPersist(raw, [{ id: tenantRowId, data: { ...baseData, rowVersion: freshVersion() }, expectedUpdatedAt: baseStamp, expectedRaw: baseRaw }]))
      .rejects.toThrow(/Save rejected/);
    const durable = JSON.parse(String((await readRow(tenantRowId)).data));
    expect(decodeSnapshot(durable.chunks, durable.sha256, durable.compression)
      && (durable.rowVersion === changed.rowVersion)).toBe(true);
  });

  it('v3: base stamp without base content fails closed as an inconsistency', async () => {
    const stamp = String((await readRow(tenantRowId)).updated_at);
    const data = await withSubtitle('inconsistency must not land');
    await expect(patchedOldPersist(raw, [{ id: tenantRowId, data, expectedUpdatedAt: stamp }]))
      .rejects.toThrow(/no complete base copy/);
  });

  it('v3: after reloading the winner, the rollback build saves normally', async () => {
    const baseRow = await readRow(tenantRowId);
    const stamp = String(baseRow.updated_at);
    const data = await withSubtitle('rollback build retry save');
    await expect(patchedOldPersist(raw, [{ id: tenantRowId, data, expectedUpdatedAt: stamp, expectedRaw: String(baseRow.data) }])).resolves.toBeUndefined();
    const check = new MemoryDatabase();
    await check.ensureLoaded();
    await check.ensureArchiveLoaded(id);
    expect(check.findById(id)?.subtitle).toBe('rollback build retry save');
  });

  it('v2: tenant+index persist is atomic - a stale index base rolls back the tenant write too', async () => {
    const tenantBefore = String((await readRow(tenantRowId)).data);
    const tenantStamp = String((await readRow(tenantRowId)).updated_at);
    const tenantData = await withSubtitle('must not land');
    const indexData = JSON.parse(String((await readRow('tenant-index')).data));
    await expect(patchedOldPersist(raw, [
      { id: tenantRowId, data: tenantData, expectedUpdatedAt: tenantStamp, expectedRaw: tenantBefore }, // base OK
      { id: 'tenant-index', data: { ...indexData, rowVersion: freshVersion() }, expectedUpdatedAt: 'stale-base', expectedRaw: '{"stale":true}' } // base WRONG
    ])).rejects.toThrow(/Save rejected/);
    // No partial commit: the tenant write was rolled back with the index failure.
    expect(String((await readRow(tenantRowId)).data)).toBe(tenantBefore);
  });

  it('v2: seed-shaped insert fails closed when the row already exists', async () => {
    const data = await withSubtitle('must not clobber');
    await expect(patchedOldPersist(raw, [{ id: tenantRowId, data }]))
      .rejects.toThrow(/Save rejected/);
    const durable = JSON.parse(String((await readRow(tenantRowId)).data));
    expect(decodeSnapshot(durable.chunks, durable.sha256, durable.compression)
      && (JSON.parse(String((await readRow(tenantRowId)).data)).rowVersion !== data.rowVersion)).toBe(true);
  });

  it('drift guard: the committed rollback branch really contains the v3 content-guarded writes', () => {
    const branch = execSync('git show exp/rollback-hotfix-2026-10-25:server/db.ts', { encoding: 'utf8' });
    expect(branch).toContain("transaction('write')");
    expect(branch).toContain('expectedRaw');
    expect(branch).toContain('tenantStoredRaw');
    expect(branch).toContain('UPDATE oncehere_state SET data = ?, updated_at = ? WHERE id = ? AND updated_at = ? AND data = ?');
    expect(branch).toContain('INSERT OR IGNORE INTO oncehere_state');
    expect(branch).toContain('rowsAffected ?? 0');
    expect(branch).toContain('no complete base copy is held for');
    const stamps = branch.match(/rowVersion: newRowVersion\(\)/g) || [];
    expect(stamps.length).toBe(2);
    // And the unconditional batch shape is GONE from the write path.
    expect(branch).not.toContain('ON CONFLICT(id) DO UPDATE SET data = excluded.data');
  });
});
