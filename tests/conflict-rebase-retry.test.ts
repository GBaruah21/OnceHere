import fs from 'node:fs';
import { describe, expect, it, beforeAll } from 'vitest';
const DB_PATH = '/tmp/retry-check.db';
process.env.TURSO_DATABASE_URL = `file:${DB_PATH}`;
process.env.TURSO_AUTH_TOKEN = 'test-token';
import { createClient } from '@libsql/client';
import { MemoryDatabase, encodeSnapshot, decodeSnapshot } from '../server/db';
const BARRIER_SQL = fs.readFileSync('/tmp/oncehere-scan/db/rowversion-barrier.sql', 'utf8');
const stmts = BARRIER_SQL.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
  .split(/END;\s*/).map((s) => s.trim()).filter(Boolean).map((s) => `${s}END;`);
const freshVersion = () => `${new Date().toISOString()}#${Math.random().toString(36).slice(2)}${Date.now()}`;
const minArchive = (id: string) => ({ id, slug: id, workspaceSlug: `ws-${id}`, title: id, subtitle: 's', visibility: 'public', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as never);

describe('rollback build: conflict -> refresh -> retry recovers', () => {
  beforeAll(async () => {
    for (const s of ['', '-wal', '-shm']) fs.rmSync(DB_PATH + s, { force: true });
    const raw = createClient({ url: `file:${DB_PATH}`, authToken: 'test-token' });
    await raw.execute('CREATE TABLE IF NOT EXISTS oncehere_state (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL)');
    for (const st of stmts) await raw.execute(st);
    await raw.close();
  });
  it('retry after reload saves honestly', async () => {
    const a = new MemoryDatabase(); await a.ensureLoaded();
    a.createArchive(minArchive('rc-1'));
    await a.persistArchive('rc-1');
    const b = new MemoryDatabase(); await b.ensureLoaded(); await b.ensureArchiveLoaded('rc-1');
    b.updateArchive('rc-1', { subtitle: 'b-edit' }, 'owner');
    // concurrent winner lands first
    const raw = createClient({ url: `file:${DB_PATH}`, authToken: 'test-token' });
    const row = (await raw.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: ['tenant-rc-1'] })).rows[0];
    const env = JSON.parse(String(row.data));
    const snap = decodeSnapshot(env.chunks, env.sha256, env.compression) as Record<string, unknown>;
    (snap.archive as Record<string, unknown>).subtitle = 'winner';
    await raw.execute({ sql: 'UPDATE oncehere_state SET data = ?, updated_at = ? WHERE id = ?',
      args: [JSON.stringify({ format: 1, ...encodeSnapshot(snap), rowVersion: freshVersion() }), new Date().toISOString(), 'tenant-rc-1'] });
    await expect(b.persistArchive('rc-1')).rejects.toThrow(/Save rejected/);
    // no manual reload: the conflict itself re-based b on the winner's state
    b.updateArchive('rc-1', { subtitle: 'b-edit-v2' }, 'owner');
    await b.persistArchive('rc-1');
    const c = new MemoryDatabase(); await c.ensureLoaded(); await c.ensureArchiveLoaded('rc-1');
    expect((c.findById('rc-1') as { subtitle?: string })?.subtitle).toBe('b-edit-v2');
    await raw.close();
  });
});
