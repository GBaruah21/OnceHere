import { describe, expect, it } from 'vitest';
import { directUploadTimeoutMs } from '../src/components/common/MediaUploader';

describe('media upload inactivity deadlines', () => {
  it('gives images enough time to start on a slow mobile connection', () => {
    expect(directUploadTimeoutMs({ size: 256 * 1024, type: 'image/jpeg' })).toBe(15_000);
    expect(directUploadTimeoutMs({ size: 10 * 1024 * 1024, type: 'image/jpeg' })).toBe(45_000);
  });

  it('keeps the existing bounded video deadline', () => {
    expect(directUploadTimeoutMs({ size: 1024 * 1024, type: 'video/mp4' })).toBe(30_000);
    expect(directUploadTimeoutMs({ size: 20 * 1024 * 1024, type: 'video/mp4' })).toBe(80_000);
  });
});
