import { describe, it, expect } from 'vitest';
import { archiveSaveVersion } from '../server/db.js';

describe('archiveSaveVersion mixed-version protection', () => {
  const base = { id: 'arc-1', createdAt: '2026-10-24T20:00:00.000Z' };
  it('returns saveVersion when it covers the newest write', () => {
    expect(archiveSaveVersion({ ...base, updatedAt: '2026-10-24T22:00:00.000Z', saveVersion: '2026-10-24T22:00:00.000Z#abc' }))
      .toBe('2026-10-24T22:00:00.000Z#abc');
  });
  it('falls back to updatedAt token when an older writer advanced updatedAt past saveVersion', () => {
    expect(archiveSaveVersion({ ...base, updatedAt: '2026-10-24T23:00:00.000Z', saveVersion: '2026-10-24T22:00:00.000Z#abc' }))
      .toBe('2026-10-24T23:00:00.000Z#legacy');
  });
  it('legacy archives without saveVersion use the updatedAt token', () => {
    expect(archiveSaveVersion({ ...base, updatedAt: '2026-10-24T21:00:00.000Z' }))
      .toBe('2026-10-24T21:00:00.000Z#legacy');
  });
  it('keeps an unparseable saveVersion as-is', () => {
    expect(archiveSaveVersion({ ...base, updatedAt: '2026-10-24T23:00:00.000Z', saveVersion: 'garbage' })).toBe('garbage');
  });
});
