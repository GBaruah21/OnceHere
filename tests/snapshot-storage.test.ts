import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decodeSnapshot, encodeSnapshot } from '../server/db';

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
});
