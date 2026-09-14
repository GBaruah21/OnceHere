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

  it('writes one archive tenant and the compact index in one Turso batch', async () => {
    process.env.TURSO_DATABASE_URL = 'libsql://oncehere.turso.io';
    process.env.TURSO_AUTH_TOKEN = 'test-token';
    turso.execute.mockResolvedValue({ rows: [] });
    turso.batch.mockResolvedValue([]);

    await db.persistArchive('demo-marys-2025');

    const statements = turso.batch.mock.calls[0][0];
    expect(statements).toHaveLength(2);
    expect(statements.map((statement: { args: unknown[] }) => statement.args[0]))
      .toEqual(['tenant-demo-marys-2025', 'tenant-index']);
    const tenant = JSON.parse(statements[0].args[1] as string);
    const restored = decodeSnapshot(tenant.chunks, tenant.sha256, tenant.compression);
    expect((restored.archive as { id: string }).id).toBe('demo-marys-2025');
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
