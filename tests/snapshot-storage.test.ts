import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

const turso = vi.hoisted(() => ({
  execute: vi.fn(),
  batch: vi.fn()
}));

vi.mock('@libsql/client', () => ({
  createClient: vi.fn(() => ({ execute: turso.execute, batch: turso.batch }))
}));
import { db, decodeSnapshot, encodeSnapshot, MemoryDatabase } from '../server/db';

describe('chunked durable snapshots', () => {
  afterEach(() => {
    turso.execute.mockReset();
    turso.batch.mockReset();
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
  });
  it('compresses and round-trips Unicode archive data', () => {
    const snapshot = {
      archives: [['archive-1', { title: 'The Years We’ll Carry 🎓', notes: 'नमस्ते'.repeat(30_000) }]],
      sessions: []
    };

    const encoded = encodeSnapshot(snapshot);

    expect(encoded.chunks.join('').length).toBeLessThan(JSON.stringify(snapshot).length);
    expect(decodeSnapshot(encoded.chunks, encoded.sha256, encoded.compression)).toEqual(snapshot);
  });

  it('rejects an incomplete or modified snapshot generation', () => {
    const encoded = encodeSnapshot({ archives: [['archive-1', { title: 'OnceHere' }]] });
    const damaged = [...encoded.chunks];
    damaged[0] = `${damaged[0][0] === 'A' ? 'B' : 'A'}${damaged[0].slice(1)}`;

    expect(() => decodeSnapshot(damaged, encoded.sha256, encoded.compression)).toThrow();
  });

  it('still reads the uncompressed format already deployed in production', () => {
    const snapshot = { archives: [['archive-legacy', { title: 'Keep this archive' }]] };
    const json = JSON.stringify(snapshot);
    const legacyChunk = Buffer.from(json, 'utf8').toString('base64');
    const hash = createHash('sha256').update(json).digest('hex');

    expect(decodeSnapshot([legacyChunk], hash)).toEqual(snapshot);
  });

  it('writes one archive tenant with a compare-and-swap guard, then the compact index', async () => {
    process.env.TURSO_DATABASE_URL = 'libsql://oncehere.turso.io';
    process.env.TURSO_AUTH_TOKEN = 'test-token';
    turso.execute.mockResolvedValue({ rows: [], rowsAffected: 1 });
    turso.batch.mockResolvedValue([]);

    await db.persistArchive('demo-marys-2025');

    // Tenant row: a guarded write (INSERT OR IGNORE on first save, conditional
    // UPDATE ... WHERE updated_at = last-known afterwards) so a concurrent
    // instance's newer copy is never silently overwritten.
    const tenantCall = turso.execute.mock.calls.find(([statement]: [{ sql: string }]) =>
      /INSERT OR IGNORE INTO oncehere_state|UPDATE oncehere_state SET data/.test(statement.sql));
    expect(tenantCall).toBeDefined();
    expect(tenantCall![0].args[0]).toBe('tenant-demo-marys-2025');
    const tenant = JSON.parse(tenantCall![0].args[1] as string);
    const restored = decodeSnapshot(tenant.chunks, tenant.sha256, tenant.compression);
    expect((restored.archive as { id: string }).id).toBe('demo-marys-2025');
    // Index row still written alongside (guarded write path uses execute).
    const executeIds = turso.execute.mock.calls
      .map(([statement]: [{ sql: string; args: unknown[] }]) => statement?.args?.[0])
      .filter(Boolean);
    expect(executeIds).toContain('tenant-index');
  });

  it('seeds only built-in demos into an empty Turso database', async () => {
    process.env.TURSO_DATABASE_URL = 'libsql://oncehere.turso.io';
    process.env.TURSO_AUTH_TOKEN = 'test-token';
    turso.execute.mockResolvedValue({ rows: [] });
    turso.batch.mockResolvedValue([]);
    const database = new MemoryDatabase();

    await database.ensureLoaded();

    expect(turso.batch).toHaveBeenCalledTimes(database.archives.size + 1);
    const ids = turso.batch.mock.calls.flatMap(([statements]: any[]) =>
      statements.map((statement: { args: unknown[] }) => statement.args[0])
    );
    expect(ids).toContain('tenant-index');
    expect(ids.every((id: string) => id === 'tenant-index' || id.startsWith('tenant-demo-'))).toBe(true);
  });
});
