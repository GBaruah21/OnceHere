import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const DB_PATH = '/tmp/rowversion-barrier-test.db';
process.env.TURSO_DATABASE_URL = `file:${DB_PATH}`;
process.env.TURSO_AUTH_TOKEN = 'test-token';

import { createClient } from '@libsql/client';
import { MemoryDatabase } from '../server/db';

// The barrier guards live in db/rowversion-barrier.sql; this test installs the
// exact artifact so the proof can never drift from what would be installed.
function barrierStatements(): string[] {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'db', 'rowversion-barrier.sql'), 'utf8');
  const noComments = raw.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n');
  return noComments.split(/END;\s*/).map((s) => s.trim()).filter(Boolean).map((s) => `${s}END;`);
}

// The exact write shape of pre-barrier code (main:server/db.ts persistRows):
// unconditional upsert whose envelope has no rowVersion.
const oldUpsert = (id: string, marker: string) => ({
  sql: 'INSERT INTO oncehere_state (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
  args: [id, JSON.stringify({ format: 1, chunks: ['x'], compression: 'gzip', sha256: marker }), `old-clock#${marker}`]
});

describe('rowVersion write barrier (durable, database-enforced)', () => {
  // Created inside beforeAll, after the stale file is removed: opening the
  // client at module scope would hold a handle to the replaced inode
  // (SQLITE_READONLY_DBMOVED).
  let raw: ReturnType<typeof createClient>;
  let inst: MemoryDatabase;
  const id = 'demo-marys-2025';
  const tenantRowId = `tenant-${id}`;

  beforeAll(async () => {
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(DB_PATH + suffix, { force: true });
    raw = createClient({ url: `file:${DB_PATH}`, authToken: 'test-token' });
    inst = new MemoryDatabase();
    await inst.ensureLoaded();
    await inst.persistArchive(id); // candidate-shaped tenant + index rows
    for (const stmt of barrierStatements()) await raw.execute(stmt);
  });

  it('stamps a fresh rowVersion into the tenant and index envelopes it writes', async () => {
    const tenant = (await raw.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: [tenantRowId] })).rows[0];
    const index = (await raw.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: ['tenant-index'] })).rows[0];
    expect(JSON.parse(String(tenant.data)).rowVersion).toMatch(/^.{20,}#/);
    expect(JSON.parse(String(index.data)).rowVersion).toMatch(/^.{20,}#/);
  });

  it('rejects a pre-barrier in-flight upsert to the tenant row and keeps the winner', async () => {
    const before = (await raw.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: [tenantRowId] })).rows[0].data;
    await expect(raw.execute(oldUpsert(tenantRowId, 'OLD-CLOBBER'))).rejects.toThrow(/rowVersion barrier/);
    const after = (await raw.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: [tenantRowId] })).rows[0].data;
    expect(after).toBe(before);
  });

  it('rejects a pre-barrier batched tenant+index save atomically (no partial commit)', async () => {
    const indexBefore = (await raw.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: ['tenant-index'] })).rows[0].data;
    await expect(raw.batch([oldUpsert(tenantRowId, 'BATCH-CLOBBER'), oldUpsert('tenant-index', 'IDX-CLOBBER')], 'write'))
      .rejects.toThrow(/rowVersion barrier/);
    const indexAfter = (await raw.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: ['tenant-index'] })).rows[0].data;
    expect(indexAfter).toBe(indexBefore);
  });

  it('still allows the barrier-aware writer (fresh rowVersion per save)', async () => {
    inst.updateArchive(id, { subtitle: `post-barrier edit ${Date.now()}` });
    await expect(inst.persistArchive(id)).resolves.toBeUndefined();
    const persisted = await new MemoryDatabase();
    await persisted.ensureLoaded();
    await persisted.ensureArchiveLoaded(id);
    expect(persisted.findById(id)?.subtitle).toContain('post-barrier edit');
  });

  it('blocks INSERT OR REPLACE and DELETE bypass shapes on stamped rows', async () => {
    await expect(raw.execute({
      sql: 'INSERT OR REPLACE INTO oncehere_state (id, data, updated_at) VALUES (?, ?, ?)',
      args: [tenantRowId, JSON.stringify({ format: 1, chunks: ['x'], sha256: 'REPLACE-CLOBBER' }), 't']
    })).rejects.toThrow(/rowVersion barrier/);
    await expect(raw.execute({ sql: 'DELETE FROM oncehere_state WHERE id = ?', args: [tenantRowId] }))
      .rejects.toThrow(/rowVersion barrier/);
    const still = (await raw.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: [tenantRowId] })).rows[0];
    expect(still).toBeTruthy();
  });

  it('stays inert on unstamped rows (pre-cutover production rows, rate-limit rows)', async () => {
    await raw.execute(oldUpsert('tenant-legacy-unstamped', 'legacy0'));
    // Pre-barrier writer keeps working on rows no barrier-aware writer has touched:
    await expect(raw.execute(oldUpsert('tenant-legacy-unstamped', 'legacy1'))).resolves.toBeTruthy();
    // ...including its DELETE shapes (rate-limit rows use CAS delete):
    await expect(raw.execute({ sql: 'DELETE FROM oncehere_state WHERE id = ?', args: ['tenant-legacy-unstamped'] })).resolves.toBeTruthy();
  });
});
