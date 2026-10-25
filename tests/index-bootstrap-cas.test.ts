import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const DB_A = '/tmp/index-legacy-cas-test.db';
const DB_B = '/tmp/index-bootstrap-guard-test.db';

import { createClient } from '@libsql/client';
import { MemoryDatabase, TenantConflictError } from '../server/db';

const DDL = `CREATE TABLE IF NOT EXISTS oncehere_state (
  id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

const resetDb = (path: string) => {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(path + suffix, { force: true });
};

const legacyIndexEnvelope = (entries: [string, unknown][]) => JSON.stringify({
  // EXACTLY the pre-barrier index shape (main:server/db.ts tenantIndexSnapshot):
  // format/archives/legacyArchiveIds/platformSettings, NO sha256, and the row
  // is stamped with a bare ISO updated_at that can repeat within one millisecond.
  format: 1,
  archives: entries,
  legacyArchiveIds: [],
  platformSettings: {}
});

const legacyArchiveEntry = (id: string): [string, unknown] => [id, {
  id,
  slug: id,
  workspaceSlug: `ws-${id}`,
  title: `Legacy ${id}`,
  updatedAt: '2026-01-01T00:00:00.000Z'
}];

describe('legacy index envelope: same-stamp first candidate write', () => {
  it('never overwrites a same-ms legacy index change; merges and heals to the hash-guarded vintage', async () => {
    process.env.TURSO_DATABASE_URL = `file:${DB_A}`;
    process.env.TURSO_AUTH_TOKEN = 'test-token';
    resetDb(DB_A);
    const raw = createClient({ url: `file:${DB_A}`, authToken: 'test-token' });
    await raw.execute(DDL);
    const stamp = '2026-01-01T00:00:00.000Z'; // bare ISO, exactly what old code stamps
    await raw.execute({
      sql: 'INSERT INTO oncehere_state (id, data, updated_at) VALUES (?, ?, ?)',
      args: ['tenant-index', legacyIndexEnvelope([legacyArchiveEntry('legacy-one')]), stamp]
    });

    // Candidate instance boots on the LEGACY envelope: no sha256 to guard on.
    const instA = new MemoryDatabase();
    await instA.ensureLoaded();
    expect(instA.findById('legacy-one')).toBeTruthy();

    // A pre-barrier writer adds an archive in the same millisecond: changed
    // content, unchanged updated_at.
    await raw.execute({
      sql: 'UPDATE oncehere_state SET data = ?, updated_at = ? WHERE id = ?',
      args: [
        legacyIndexEnvelope([legacyArchiveEntry('legacy-one'), legacyArchiveEntry('old-writer-added')]),
        stamp,
        'tenant-index'
      ]
    });

    // instA, based on the pre-change copy, adds its own archive and persists.
    // Token-only CAS would wave this through and erase 'old-writer-added'
    // from the durable index - a lost archive in every listing and lookup.
    instA.createArchive({
      ...legacyArchiveEntry('candidate-added')[1] as object,
      id: 'candidate-added',
      slug: 'candidate-added',
      workspaceSlug: 'ws-candidate-added'
    } as never);
    await instA.persist();

    const stored = String((await raw.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: ['tenant-index'] })).rows[0].data);
    const finalIndex = JSON.parse(stored);
    const ids = (finalIndex.archives as [string, unknown][]).map(([entryId]) => entryId);
    // The old writer's archive survived the candidate write (discoverability).
    expect(ids).toContain('old-writer-added');
    expect(ids).toContain('candidate-added');
    expect(ids).toContain('legacy-one');
    // And the index healed to the hash-guarded vintage for every later write.
    expect(typeof finalIndex.sha256).toBe('string');

    // A fresh instance discovers all of them.
    const check = new MemoryDatabase();
    await check.ensureLoaded();
    expect(check.findById('old-writer-added')).toBeTruthy();
    expect(check.findById('candidate-added')).toBeTruthy();
    await raw.close();
  });
});

describe('existing but unreadable index: fail closed, never seed over it', () => {
  const bootOn = async (rows: { data: string; updated_at?: string }[]) => {
    process.env.TURSO_DATABASE_URL = `file:${DB_B}`;
    process.env.TURSO_AUTH_TOKEN = 'test-token';
    resetDb(DB_B);
    const raw = createClient({ url: `file:${DB_B}`, authToken: 'test-token' });
    await raw.execute(DDL);
    for (const row of rows) {
      await raw.execute({
        sql: 'INSERT INTO oncehere_state (id, data, updated_at) VALUES (?, ?, ?)',
        args: ['tenant-index', row.data, row.updated_at || '2026-01-01T00:00:00.000Z']
      });
    }
    return raw;
  };

  it('rejects boot on a corrupt (unparseable) index row and leaves the row untouched', async () => {
    const raw = await bootOn([{ data: '{corrupt-not-json' }]);
    const inst = new MemoryDatabase();
    await expect(inst.ensureLoaded()).rejects.toThrow(/unreadable/i);
    // Still failing closed on retry - no cached half-state.
    await expect(inst.ensureLoaded()).rejects.toThrow(/unreadable/i);
    const stored = String((await raw.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: ['tenant-index'] })).rows[0].data);
    expect(stored).toBe('{corrupt-not-json');
    await raw.close();
  });

  it('rejects boot on a valid-JSON but wrong-format index row and leaves the row untouched', async () => {
    const wrongFormat = JSON.stringify({ format: 999, archives: [] });
    const raw = await bootOn([{ data: wrongFormat }]);
    const inst = new MemoryDatabase();
    await expect(inst.ensureLoaded()).rejects.toThrow(/unreadable/i);
    const stored = String((await raw.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: ['tenant-index'] })).rows[0].data);
    expect(stored).toBe(wrongFormat);
    await raw.close();
  });

  it('bootstraps only a truly empty database (no index row at all)', async () => {
    const raw = await bootOn([]);
    const inst = new MemoryDatabase();
    await expect(inst.ensureLoaded()).resolves.toBeUndefined();
    const stored = (await raw.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: ['tenant-index'] })).rows[0];
    expect(stored).toBeTruthy();
    expect(JSON.parse(String(stored.data)).format).toBe(1);
    expect(inst.findById('demo-marys-2025')).toBeTruthy();
    await raw.close();
  });

  it('recovers without a code change once the index row is deliberately repaired', async () => {
    const raw = await bootOn([{ data: '{corrupt-not-json' }]);
    await expect(new MemoryDatabase().ensureLoaded()).rejects.toThrow(/unreadable/i);
    await raw.execute({
      sql: 'UPDATE oncehere_state SET data = ? WHERE id = ?',
      args: [legacyIndexEnvelope([legacyArchiveEntry('repaired-one')]), 'tenant-index']
    });
    const healed = new MemoryDatabase();
    await expect(healed.ensureLoaded()).resolves.toBeUndefined();
    expect(healed.findById('repaired-one')).toBeTruthy();
    await raw.close();
  });
});

// TenantConflictError is referenced by the merge path this file exercises.
void TenantConflictError;
