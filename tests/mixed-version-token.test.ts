import { describe, it, expect } from 'vitest';
import { archiveSaveVersion, stampSaveVersion } from '../server/db.js';

// saveVersion = `<updatedAt>#<sha256-24 of content>`. A token is coherent only
// when its timestamp is the record's own updatedAt AND its hash still matches
// the record's content. Anything else fails closed to `<updatedAt>#legacy`.
describe('archiveSaveVersion mixed-version protection', () => {
  const build = (over: Record<string, unknown> = {}) => ({
    id: 'arc-1',
    title: 'Original title',
    createdAt: '2026-10-24T20:00:00.000Z',
    updatedAt: '2026-10-24T22:00:00.000Z',
    ...over
  });
  const stamped = <T extends object>(rec: T): T & { saveVersion: string } => ({ ...rec, saveVersion: stampSaveVersion(rec) });

  it('returns the stored token when it covers the current record', () => {
    const rec = stamped(build());
    expect(archiveSaveVersion(rec)).toBe(rec.saveVersion);
  });

  it('detects a content change that preserved the token (same-ms old writer)', () => {
    const rec = stamped(build());
    expect(archiveSaveVersion({ ...rec, title: 'old-code overwrite' }))
      .toBe('2026-10-24T22:00:00.000Z#legacy');
  });

  it('detects a pure updatedAt advance without restamping (old writer, clock ahead)', () => {
    const rec = stamped(build());
    expect(archiveSaveVersion({ ...rec, updatedAt: '2026-10-24T23:00:00.000Z' }))
      .toBe('2026-10-24T23:00:00.000Z#legacy');
  });

  it('legacy archives without saveVersion use the updatedAt token', () => {
    expect(archiveSaveVersion(build({ updatedAt: '2026-10-24T21:00:00.000Z' })))
      .toBe('2026-10-24T21:00:00.000Z#legacy');
  });

  it('uuid-era tokens fail closed and self-heal on the next save', () => {
    const rec = build({ saveVersion: '2026-10-24T22:00:00.000Z#550e8400-e29b-41d4-a716-446655440000' });
    expect(archiveSaveVersion(rec)).toBe('2026-10-24T22:00:00.000Z#legacy');
  });

  it('unparseable tokens fail closed', () => {
    expect(archiveSaveVersion(build({ saveVersion: 'garbage' }))).toBe('2026-10-24T22:00:00.000Z#legacy');
  });
});
