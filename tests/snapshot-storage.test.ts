import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { db, decodeSnapshot, encodeSnapshot } from '../server/db';

describe('chunked durable snapshots', () => {
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

  it('persists an edit as one tenant row instead of a global snapshot', async () => {
    const previousUrl = process.env.SUPABASE_URL;
    const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_URL = 'https://storage.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
    let posted: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      posted = JSON.parse(String(init?.body || '[]'));
      return new Response(null, { status: 201 });
    }));

    try {
      await db.persistArchive('demo-marys-2025');
      expect(posted).toHaveLength(1);
      expect(posted[0].id).toBe('tenant-demo-marys-2025');
      expect(posted[0].id).not.toBe('manifest');
      const data = posted[0].data;
      const restored = decodeSnapshot(data.chunks, data.sha256, data.compression);
      expect((restored.archive as { id: string }).id).toBe('demo-marys-2025');
    } finally {
      vi.unstubAllGlobals();
      if (previousUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = previousUrl;
      if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    }
  });

  it('loads tenant snapshots independently and skips an unreadable row', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const snapshot = encodeSnapshot({ archive: { id: 'archive-good' } });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('select=id&')) {
        return Response.json([{ id: 'tenant-good' }, { id: 'tenant-broken' }]);
      }
      if (url.includes('tenant-good')) {
        return Response.json([{
          id: 'tenant-good',
          data: {
            format: 1,
            chunks: snapshot.chunks,
            compression: snapshot.compression,
            sha256: snapshot.sha256
          }
        }]);
      }
      return new Response('temporary storage failure', { status: 503 });
    }));

    try {
      const rows = await (db as unknown as {
        fetchTenantRows(config: { url: string; key: string }): Promise<Array<{ id: string }>>;
      }).fetchTenantRows({ url: 'https://storage.test', key: 'test-service-role' });

      expect(rows.map((row) => row.id)).toEqual(['tenant-good']);
      expect(consoleError).toHaveBeenCalledOnce();
    } finally {
      consoleError.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
