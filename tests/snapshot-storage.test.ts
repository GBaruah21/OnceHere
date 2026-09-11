import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { db, decodeSnapshot, encodeSnapshot, MemoryDatabase } from '../server/db';

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
      expect(posted).toHaveLength(2);
      expect(posted.map((row) => row.id)).toEqual(['tenant-demo-marys-2025', 'tenant-index']);
      const tenantPost = (fetch as any).mock.calls
        .map((call: any[]) => JSON.parse(String(call[1]?.body || '[]')))
        .flat()
        .find((row: any) => row.id === 'tenant-demo-marys-2025');
      expect(tenantPost).toBeTruthy();
      const data = tenantPost.data;
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

  it('boots from the compact index and lazily loads only the requested tenant', async () => {
    const previousUrl = process.env.SUPABASE_URL;
    const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_URL = 'https://storage.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
    const database = new MemoryDatabase();
    const archive = database.archives.get('demo-marys-2025')!;
    const tenant = encodeSnapshot({
      archive,
      sections: [], timelineEvents: [], members: [], memberMessages: [], mediaItems: [],
      albums: [], wallPosts: [], revisions: [], accessLogs: [], shareActivity: [], sessions: []
    });
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('tenant-index')) return Response.json([{
        id: 'tenant-index',
        data: { format: 1, archives: [[archive.id, archive]], platformSettings: {} }
      }]);
      if (url.includes(`tenant-${archive.id}`)) return Response.json([{
        id: `tenant-${archive.id}`,
        data: { format: 1, chunks: tenant.chunks, compression: tenant.compression, sha256: tenant.sha256 }
      }]);
      return Response.json([]);
    }));

    try {
      await database.ensureLoaded();
      expect(calls).toHaveLength(1);
      expect(calls[0]).toContain('tenant-index');
      await database.ensureArchiveLoaded(archive.id);
      expect(calls).toHaveLength(2);
      expect(calls[1]).toContain(`tenant-${archive.id}`);
      expect(calls.some((url) => url.includes('manifest'))).toBe(false);
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
