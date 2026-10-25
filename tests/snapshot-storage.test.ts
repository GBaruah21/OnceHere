import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

const turso = vi.hoisted(() => {
  const tx = { execute: vi.fn(), commit: vi.fn(async () => undefined), rollback: vi.fn(async () => undefined) };
  return {
    execute: vi.fn(),
    batch: vi.fn(),
    tx,
    // The write path is ONE interactive transaction of conditional statements.
    transaction: vi.fn(async () => tx)
  };
});

vi.mock('@libsql/client', () => ({
  createClient: vi.fn(() => ({ execute: turso.execute, batch: turso.batch, transaction: turso.transaction }))
}));
import { db, decodeSnapshot, encodeSnapshot, MemoryDatabase } from '../server/db';

describe('chunked durable snapshots', () => {
  afterEach(() => {
    turso.execute.mockReset();
    turso.batch.mockReset();
    turso.tx.execute.mockReset();
    turso.tx.commit.mockClear();
    turso.tx.rollback.mockClear();
    turso.transaction.mockClear();
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

  it('writes one archive tenant and the compact index in one Turso batch', async () => {
    process.env.TURSO_DATABASE_URL = 'libsql://oncehere.turso.io';
    process.env.TURSO_AUTH_TOKEN = 'test-token';
    turso.execute.mockResolvedValue({ rows: [] });
    turso.tx.execute.mockResolvedValue({ rows: [], rowsAffected: 1 });

    await db.persistArchive('demo-marys-2025');

    // tenant row + index row written as conditional statements in ONE transaction
    const statements = turso.tx.execute.mock.calls.map(([statement]: [{ sql: string; args: unknown[] }]) => statement);
    expect(statements).toHaveLength(2);
    const rowIds = statements.map((statement: { sql: string; args: unknown[] }) =>
      statement.sql.startsWith('INSERT') ? statement.args[0] : statement.args[2]);
    expect(rowIds).toEqual(['tenant-demo-marys-2025', 'tenant-index']);
    expect(turso.tx.commit).toHaveBeenCalledTimes(1);
    const tenant = JSON.parse(statements[0].sql.startsWith('INSERT') ? statements[0].args[1] as string : statements[0].args[0] as string);
    const restored = decodeSnapshot(tenant.chunks, tenant.sha256, tenant.compression);
    expect((restored.archive as { id: string }).id).toBe('demo-marys-2025');
  });

  it('seeds only built-in demos into an empty Turso database', async () => {
    process.env.TURSO_DATABASE_URL = 'libsql://oncehere.turso.io';
    process.env.TURSO_AUTH_TOKEN = 'test-token';
    turso.execute.mockResolvedValue({ rows: [] });
    turso.tx.execute.mockResolvedValue({ rows: [], rowsAffected: 1 });
    const database = new MemoryDatabase();

    await database.ensureLoaded();

    expect(turso.tx.execute).toHaveBeenCalledTimes(database.archives.size + 1);
    const ids = turso.tx.execute.mock.calls.map(([statement]: [{ sql: string; args: unknown[] }]) =>
      statement.sql.startsWith('INSERT') ? statement.args[0] : statement.args[2]);
    expect(ids).toContain('tenant-index');
    expect(ids.every((id: string) => id === 'tenant-index' || id.startsWith('tenant-demo-'))).toBe(true);
  });
});
