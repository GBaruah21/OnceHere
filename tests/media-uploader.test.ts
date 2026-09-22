import { describe, expect, it } from 'vitest';
import { directUploadTimeoutMs } from '../src/components/common/MediaUploader';
import { canUploadOriginalImage } from '../src/lib/imageCompression';

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

describe('image optimization fallback', () => {
  it('keeps browser-supported archive formats uploadable when optimization is unavailable', () => {
    expect(canUploadOriginalImage({ type: 'image/jpeg' })).toBe(true);
    expect(canUploadOriginalImage({ type: 'image/png' })).toBe(true);
    expect(canUploadOriginalImage({ type: 'image/webp' })).toBe(true);
    expect(canUploadOriginalImage({ type: 'image/avif' })).toBe(true);
    expect(canUploadOriginalImage({ type: 'image/gif' })).toBe(true);
  });

  it('does not bypass server validation for unsupported image formats', () => {
    expect(canUploadOriginalImage({ type: 'image/heic' })).toBe(false);
    expect(canUploadOriginalImage({ type: 'image/svg+xml' })).toBe(false);
  });
});
