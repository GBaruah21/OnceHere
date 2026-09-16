import { afterEach, describe, expect, it } from 'vitest';
import { isTrustedMediaCdnOrigin, mediaCdnStatus, publicMediaCdnUrl } from '../server/mediaCdn.js';

const originalBase = process.env.MEDIA_CDN_BASE_URL;
const originalSecret = process.env.MEDIA_CDN_ORIGIN_SECRET;

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore('MEDIA_CDN_BASE_URL', originalBase);
  restore('MEDIA_CDN_ORIGIN_SECRET', originalSecret);
});

describe('public media CDN routing', () => {
  it('stays disabled until both the HTTPS base URL and origin secret exist', () => {
    delete process.env.MEDIA_CDN_BASE_URL;
    delete process.env.MEDIA_CDN_ORIGIN_SECRET;
    expect(mediaCdnStatus().enabled).toBe(false);

    process.env.MEDIA_CDN_BASE_URL = 'https://oncehere-media-cdn.example.workers.dev';
    expect(mediaCdnStatus().enabled).toBe(false);
  });

  it('routes only deployed public archive media through the CDN', () => {
    process.env.MEDIA_CDN_BASE_URL = 'https://oncehere-media-cdn.example.workers.dev/';
    process.env.MEDIA_CDN_ORIGIN_SECRET = '0123456789abcdef0123456789abcdef';

    expect(publicMediaCdnUrl(
      { id: 'arc-123', visibility: 'public', deploymentStatus: 'deployed' },
      'photo.webp'
    )).toBe('https://oncehere-media-cdn.example.workers.dev/media/arc-123/photo.webp');

    expect(publicMediaCdnUrl(
      { id: 'arc-123', visibility: 'private', deploymentStatus: 'deployed' },
      'photo.webp'
    )).toBeUndefined();

    expect(publicMediaCdnUrl(
      { id: 'arc-123', visibility: 'public', deploymentStatus: 'draft' },
      'photo.webp'
    )).toBeUndefined();
  });

  it('lets the trusted Worker bypass the CDN redirect without granting private access itself', () => {
    process.env.MEDIA_CDN_BASE_URL = 'https://oncehere-media-cdn.example.workers.dev';
    process.env.MEDIA_CDN_ORIGIN_SECRET = '0123456789abcdef0123456789abcdef';

    expect(isTrustedMediaCdnOrigin('0123456789abcdef0123456789abcdef')).toBe(true);
    expect(isTrustedMediaCdnOrigin('wrong-secret')).toBe(false);
    expect(publicMediaCdnUrl(
      { id: 'arc-123', visibility: 'public', deploymentStatus: 'deployed' },
      'video.mp4',
      '0123456789abcdef0123456789abcdef'
    )).toBeUndefined();
  });

  it('rejects non-HTTPS CDN bases', () => {
    process.env.MEDIA_CDN_BASE_URL = 'http://example.com';
    process.env.MEDIA_CDN_ORIGIN_SECRET = '0123456789abcdef0123456789abcdef';
    expect(mediaCdnStatus().enabled).toBe(false);
  });
});
