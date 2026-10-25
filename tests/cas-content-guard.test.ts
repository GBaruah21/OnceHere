import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

const DB_PATH = '/tmp/cas-content-guard-test.db';
process.env.TURSO_DATABASE_URL = `file:${DB_PATH}`;
process.env.TURSO_AUTH_TOKEN = 'test-token';

import { createClient } from '@libsql/client';
import { MemoryDatabase, TenantConflictError } from '../server/db';

// Pre-barrier code stamps tenant rows with a bare ISO updated_at
// (main:server/db.ts tenantStorageRow). Two of its writes in the same
// millisecond carry the SAME updated_at with DIFFERENT content. A CAS on
// id+updated_at alone cannot see that change; the CAS must also compare the
// stored content hash or the later candidate save silently overwrites it.
describe('durable CAS content guard (same-ms stamp, changed content)', () => {
  let raw: ReturnType<typeof createClient>;
  let instA: MemoryDatabase;
  let instB: MemoryDatabase;
  const id = 'demo-marys-2025';
  const rowId = `tenant-${id}`;
  let knownStamp = '';

  beforeAll(async () => {
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(DB_PATH + suffix, { force: true });
    raw = createClient({ url: `file:${DB_PATH}`, authToken: 'test-token' });
    instA = new MemoryDatabase();
    instB = new MemoryDatabase();
    await instA.ensureLoaded();
    await instB.ensureLoaded();
    await instA.persistArchive(id);
    await instB.ensureArchiveLoaded(id);
    knownStamp = String((await raw.execute({ sql: 'SELECT updated_at FROM oncehere_state WHERE id = ?', args: [rowId] })).rows[0].updated_at);
  });

  it('rejects the candidate save when the durable row changed content under an unchanged updated_at', async () => {
    // Another writer saves a real change (fresh stamp)...
    instB.updateArchive(id, { subtitle: 'old-writer change' });
    await instB.persistArchive(id);
    // ...and the durable row ends up with the stamp instA last saw - exactly
    // what a same-millisecond pre-barrier write produces.
    await raw.execute({ sql: 'UPDATE oncehere_state SET updated_at = ? WHERE id = ?', args: [knownStamp, rowId] });
    // instA, working from its stale copy, saves. Token-only CAS would wave
    // this through and silently erase instB's change.
    instA.updateArchive(id, { subtitle: 'candidate stale edit' });
    await expect(instA.persistArchive(id)).rejects.toBeInstanceOf(TenantConflictError);
    // The winner's change survived the rejected save.
    const stored = String((await raw.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: [rowId] })).rows[0].data);
    const winner = new MemoryDatabase();
    await winner.ensureLoaded();
    await winner.ensureArchiveLoaded(id);
    expect(winner.findById(id)?.subtitle).toBe('old-writer change');
    expect(stored.length).toBeGreaterThan(0);
    // And instA converged to the winning copy.
    expect(instA.findById(id)?.subtitle).toBe('old-writer change');
  });

  it('still accepts a fresh save after reloading the winner', async () => {
    instA.updateArchive(id, { subtitle: 'candidate retry edit' });
    await expect(instA.persistArchive(id)).resolves.toBeUndefined();
    const check = new MemoryDatabase();
    await check.ensureLoaded();
    await check.ensureArchiveLoaded(id);
    expect(check.findById(id)?.subtitle).toBe('candidate retry edit');
  });
});
