import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDownloadUrl,
  createUploadUrl,
  OBJECT_STORAGE_BROWSER_ORIGINS,
  R2_LIMITS,
  validateUpload
} from '../server/r2';

describe('S3-compatible object storage uploads', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('creates a Backblaze-compatible browser PUT URL without an empty-body checksum', async () => {
    vi.stubEnv('OBJECT_STORAGE_ENDPOINT', 'https://s3.us-east-005.backblazeb2.com');
    vi.stubEnv('OBJECT_STORAGE_REGION', 'us-east-005');
    vi.stubEnv('OBJECT_STORAGE_ACCESS_KEY_ID', 'example-access-key');
    vi.stubEnv('OBJECT_STORAGE_SECRET_ACCESS_KEY', 'example-secret-key');
    vi.stubEnv('OBJECT_STORAGE_BUCKET', 'oncehere-media');

    const signedUrl = new URL(await createUploadUrl(
      'archives/archive-123/photo.jpg',
      'image/jpeg',
      1024
    ));

    expect(signedUrl.hostname).toBe('oncehere-media.s3.us-east-005.backblazeb2.com');
    expect(signedUrl.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(signedUrl.searchParams.has('x-amz-checksum-crc32')).toBe(false);
    expect(signedUrl.searchParams.has('x-amz-sdk-checksum-algorithm')).toBe(false);
    expect(signedUrl.searchParams.has('x-amz-meta-expectedsize')).toBe(false);
  });

  it('normalizes a Backblaze endpoint entered without https in hosting settings', async () => {
    vi.stubEnv('OBJECT_STORAGE_ENDPOINT', 's3.us-east-005.backblazeb2.com');
    vi.stubEnv('OBJECT_STORAGE_REGION', 'us-east-005');
    vi.stubEnv('OBJECT_STORAGE_ACCESS_KEY_ID', 'example-access-key');
    vi.stubEnv('OBJECT_STORAGE_SECRET_ACCESS_KEY', 'example-secret-key');
    vi.stubEnv('OBJECT_STORAGE_BUCKET', 'oncehere-media');

    const signedUrl = new URL(await createUploadUrl('archives/archive-123/photo.jpg', 'image/jpeg', 1024));
    expect(signedUrl.protocol).toBe('https:');
    expect(signedUrl.hostname).toBe('oncehere-media.s3.us-east-005.backblazeb2.com');
  });

  it('creates a direct browser download URL so media bytes bypass the app server', async () => {
    vi.stubEnv('OBJECT_STORAGE_ENDPOINT', 'https://s3.us-east-005.backblazeb2.com');
    vi.stubEnv('OBJECT_STORAGE_REGION', 'us-east-005');
    vi.stubEnv('OBJECT_STORAGE_ACCESS_KEY_ID', 'example-access-key');
    vi.stubEnv('OBJECT_STORAGE_SECRET_ACCESS_KEY', 'example-secret-key');
    vi.stubEnv('OBJECT_STORAGE_BUCKET', 'oncehere-media');

    const signedUrl = new URL(await createDownloadUrl('archives/archive-123/photo.jpg'));
    expect(signedUrl.hostname).toBe('oncehere-media.s3.us-east-005.backblazeb2.com');
    expect(signedUrl.pathname).toBe('/archives/archive-123/photo.jpg');
    expect(signedUrl.searchParams.get('X-Amz-Expires')).toBe('300');
  });

  it('creates a stable, cacheable download URL for public archives only', async () => {
    vi.stubEnv('OBJECT_STORAGE_ENDPOINT', 'https://s3.us-east-005.backblazeb2.com');
    vi.stubEnv('OBJECT_STORAGE_REGION', 'us-east-005');
    vi.stubEnv('OBJECT_STORAGE_ACCESS_KEY_ID', 'example-access-key');
    vi.stubEnv('OBJECT_STORAGE_SECRET_ACCESS_KEY', 'example-secret-key');
    vi.stubEnv('OBJECT_STORAGE_BUCKET', 'oncehere-media');

    const key = 'archives/archive-123/photo.jpg';
    const first = new URL(await createDownloadUrl(key, { longLived: true }));
    const second = new URL(await createDownloadUrl(key, { longLived: true }));
    expect(first.href).toBe(second.href);
    expect(first.searchParams.get('X-Amz-Expires')).toBe('10800');
    expect(first.searchParams.get('response-cache-control')).toBe('public, max-age=86400');
    expect(first.searchParams.get('X-Amz-Date')).toMatch(/^\d{8}T\d{2}0000Z$/);

    // Default (private) URLs are unchanged: 5 minutes, no long cache header.
    const privateUrl = new URL(await createDownloadUrl(key));
    expect(privateUrl.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(privateUrl.searchParams.has('response-cache-control')).toBe(false);
  });

  it('enforces storage-saving source and per-archive limits', () => {
    expect(R2_LIMITS.imageBytes).toBe(10 * 1024 * 1024);
    expect(R2_LIMITS.videoBytes).toBe(20 * 1024 * 1024);
    expect(R2_LIMITS.maxArchiveVideos).toBe(8);
    expect(R2_LIMITS.maxTotalBytesPerArchive).toBe(500 * 1024 * 1024);
    expect(validateUpload('image/jpeg', R2_LIMITS.imageBytes)).toBe('image');
    expect(validateUpload('video/mp4', R2_LIMITS.videoBytes)).toBe('video');
    expect(() => validateUpload('image/jpeg', R2_LIMITS.imageBytes + 1)).toThrow('10 MB');
    expect(() => validateUpload('video/mp4', R2_LIMITS.videoBytes + 1)).toThrow('20 MB');
  });

  it('allows signed direct uploads from production and Vercel preview hosts', () => {
    expect(OBJECT_STORAGE_BROWSER_ORIGINS).toContain('https://oncehere.vercel.app');
    expect(OBJECT_STORAGE_BROWSER_ORIGINS).toContain('https://*.vercel.app');
  });
});
