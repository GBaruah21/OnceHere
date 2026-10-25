import { describe, it, expect } from 'vitest';
import { archiveSaveVersion } from '../server/db.js';

// Mixed-version window: a new-code instance stamped saveVersion, then an
// OLD-code writer (previous deployment in a rollback window) saved afterward.
// Old code advances updatedAt but preserves the existing saveVersion untouched.
// The stale-base guard must reject tokens that no longer describe the record,
// no matter what the writers' clocks said.
describe('archiveSaveVersion detects old-writer overwrites under any clock skew', () => {
  const base = { id: 'arc-1', title: 'content', createdAt: '2026-10-24T20:00:00.000Z' };

  it('HOLE: old writer whose clock is BEHIND the last new-code save', () => {
    // New code saved at 22:00 (stamped token). Old writer's clock reads 21:00
    // and saves later in wall order: updatedAt moves BACKWARD relative to the
    // token timestamp. Timestamp-direction checks miss this entirely.
    const record = { ...base, updatedAt: '2026-10-24T21:00:00.000Z', saveVersion: '2026-10-24T22:00:00.000Z#abc' };
    expect(archiveSaveVersion(record)).toBe('2026-10-24T21:00:00.000Z#legacy');
  });

  it('HOLE: old writer in the SAME millisecond as the stamped token', () => {
    // Old writer saved with updatedAt exactly equal to the token's timestamp,
    // preserving the token. Equality is not "after", so direction checks miss it.
    const record = { ...base, updatedAt: '2026-10-24T22:00:00.000Z', saveVersion: '2026-10-24T22:00:00.000Z#abc' };
    expect(archiveSaveVersion(record)).toBe('2026-10-24T22:00:00.000Z#legacy');
  });

  it('unparseable tokens fail closed to the updatedAt-derived token', () => {
    const record = { ...base, updatedAt: '2026-10-24T23:00:00.000Z', saveVersion: 'garbage' };
    expect(archiveSaveVersion(record)).toBe('2026-10-24T23:00:00.000Z#legacy');
  });
});

// End-to-end through MemoryDatabase: a new-code save stamps coherently; a
// simulated old-code write (mutates the stored record without restamping)
// must make every previously issued base mismatch.
describe('mixed-version guard through the database layer', () => {
  it('a base issued before a clock-behind old-writer overwrite is rejected after it', async () => {
    const { MemoryDatabase } = await import('../server/db.js');
    const db = new MemoryDatabase();
    await db.ensureLoaded();
    const id = 'demo-marys-2025';
    const archive = db.findById(id)!;

    // New-code save: coherent stamp.
    const updated = db.updateArchive(id, { subtitle: 'new-code edit' })!;
    const baseIssuedToClient = archiveSaveVersion(updated);
    expect(baseIssuedToClient).toBe(updated.saveVersion);

    // Simulated old-code writer on another instance, clock BEHIND: changes
    // content, moves updatedAt backward, preserves the token (its spread does).
    const raw = (db as any).archives.get(id);
    raw.subtitle = 'old-code overwrite';
    raw.updatedAt = '2020-01-01T00:00:00.000Z'; // clock far behind, token preserved
    (db as any).archives.set(id, raw);

    // The client's stale base must no longer match.
    expect(archiveSaveVersion(db.findById(id)!)).not.toBe(baseIssuedToClient);
    expect(archiveSaveVersion(db.findById(id)!)).toBe('2020-01-01T00:00:00.000Z#legacy');

    // A fresh read gets the derived legacy token, and a save based on it
    // succeeds and restamps coherently (self-healing path).
    const freshBase = archiveSaveVersion(db.findById(id)!);
    expect(freshBase).toBe('2020-01-01T00:00:00.000Z#legacy');
    const healed = db.updateArchive(id, { subtitle: 'post-conflict save' })!;
    expect(archiveSaveVersion(healed)).toBe(healed.saveVersion);
  });
});
