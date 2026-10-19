import { describe, expect, it } from 'vitest';
import { needsThumbnail, thumbnailKeyFor } from '../scripts/backfill-thumbnails';
import type { MediaItem } from '../src/types';

const base: MediaItem = {
  id: 'm1', archiveId: 'a1', type: 'image', url: 'https://x/a1/f.jpg',
  storageKey: 'archives/a1/f.jpg', tags: [], createdAt: '2026-01-01T00:00:00Z'
};

describe('needsThumbnail', () => {
  it('flags images whose thumbnail is the full file', () => {
    expect(needsThumbnail({ ...base, thumbnailStorageKey: base.storageKey, thumbnailUrl: base.url })).toBe(true);
    expect(needsThumbnail({ ...base })).toBe(true);
  });
  it('skips images that already have a real thumbnail', () => {
    expect(needsThumbnail({ ...base, thumbnailStorageKey: 'archives/a1/t.webp', thumbnailUrl: 'https://x/a1/t.webp' })).toBe(false);
  });
  it('skips videos and items without a storage key', () => {
    expect(needsThumbnail({ ...base, type: 'video' as const })).toBe(false);
    expect(needsThumbnail({ ...base, storageKey: undefined })).toBe(false);
  });
});

describe('thumbnailKeyFor', () => {
  it('builds keys inside the archive prefix as .webp', () => {
    const key = thumbnailKeyFor('a1', 123, 'u-1');
    expect(key).toBe('archives/a1/123-u-1.webp');
    expect(key.startsWith('archives/a1/')).toBe(true); // required by the upload validation
  });
});
