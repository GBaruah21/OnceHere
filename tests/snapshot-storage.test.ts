import { describe, expect, it } from 'vitest';
import { decodeSnapshot, encodeSnapshot } from '../server/db';

describe('chunked durable snapshots', () => {
  it('round-trips Unicode archive data across multiple chunks', () => {
    const snapshot = {
      archives: [['archive-1', { title: 'The Years We’ll Carry 🎓', notes: 'नमस्ते'.repeat(30_000) }]],
      sessions: []
    };

    const encoded = encodeSnapshot(snapshot);

    expect(encoded.chunks.length).toBeGreaterThan(1);
    expect(decodeSnapshot(encoded.chunks, encoded.sha256)).toEqual(snapshot);
  });

  it('rejects an incomplete or modified snapshot generation', () => {
    const encoded = encodeSnapshot({ archives: [['archive-1', { title: 'OnceHere' }]] });
    const damaged = [...encoded.chunks];
    damaged[0] = `${damaged[0][0] === 'A' ? 'B' : 'A'}${damaged[0].slice(1)}`;

    expect(() => decodeSnapshot(damaged, encoded.sha256)).toThrow(/integrity/i);
  });
});
