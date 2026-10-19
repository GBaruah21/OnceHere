import { afterEach, describe, expect, it } from 'vitest';
import { isTrustedMediaCdnOrigin, mediaCdnStatus, publicMediaCdnUrl, rewritePublicMediaUrls } from '../server/mediaCdn.js';

const originalBase = process.env.MEDIA_CDN_BASE_URL;
const originalSecret = process.env.MEDIA_CDN_ORIGIN_SECRET;
const originalDirect = process.env.MEDIA_CDN_DIRECT_LINKS;

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore('MEDIA_CDN_BASE_URL', originalBase);
  restore('MEDIA_CDN_ORIGIN_SECRET', originalSecret);
  restore('MEDIA_CDN_DIRECT_LINKS', originalDirect);
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

describe('direct CDN links for anonymous public views', () => {
  const pub = { id: 'arc-1', visibility: 'public', deploymentStatus: 'deployed' };
  const body = () => ({
    archive: { id: 'arc-1', title: 'Keep /api/archives/arc-1/media-object text only if not exact' },
    media: [{ url: '/api/archives/arc-1/media-object/a-1.jpg', thumbnailUrl: '/api/archives/arc-1/media-object/a-1_t.webp', storageKey: 'archives/arc-1/a-1.jpg' }],
    members: [{ imageUrl: '/api/archives/arc-1/media-object/m.webp' }, { imageUrl: null }],
    timeline: [{ mediaUrl: 'https://example.com/x.jpg' }, { mediaUrl: '/api/archives/OTHER/media-object/z.jpg' }],
    wall: [{ imageUrl: '/api/archives/arc-1/media-object/bad%20name.jpg' }]
  });
  const enable = () => {
    process.env.MEDIA_CDN_BASE_URL = 'https://cdn.example.workers.dev';
    process.env.MEDIA_CDN_ORIGIN_SECRET = '0123456789abcdef0123456789abcdef';
    process.env.MEDIA_CDN_DIRECT_LINKS = '1';
  };

  it('changes nothing unless MEDIA_CDN_DIRECT_LINKS=1', () => {
    enable();
    delete process.env.MEDIA_CDN_DIRECT_LINKS;
    expect(rewritePublicMediaUrls(pub, body())).toEqual(body());
  });

  it('changes nothing when the CDN is not configured', () => {
    enable();
    delete process.env.MEDIA_CDN_BASE_URL;
    expect(rewritePublicMediaUrls(pub, body())).toEqual(body());
  });

  it('rewrites only this archive\'s exact media-object URLs and leaves the input untouched', () => {
    enable();
    const input = body();
    const out = rewritePublicMediaUrls(pub, input) as ReturnType<typeof body>;
    expect(input).toEqual(body());
    expect(out.media[0].url).toBe('https://cdn.example.workers.dev/media/arc-1/a-1.jpg');
    expect(out.media[0].thumbnailUrl).toBe('https://cdn.example.workers.dev/media/arc-1/a-1_t.webp');
    expect(out.media[0].storageKey).toBe('archives/arc-1/a-1.jpg');
    expect(out.members[0].imageUrl).toBe('https://cdn.example.workers.dev/media/arc-1/m.webp');
    expect(out.members[1].imageUrl).toBeNull();
    expect(out.timeline[0].mediaUrl).toBe('https://example.com/x.jpg');
    expect(out.timeline[1].mediaUrl).toBe('/api/archives/OTHER/media-object/z.jpg');
    expect(out.wall[0].imageUrl).toBe('/api/archives/arc-1/media-object/bad%20name.jpg');
    expect(out.archive.title).toBe(input.archive.title);
  });

  it('never rewrites private or undeployed archives', () => {
    enable();
    expect(rewritePublicMediaUrls({ ...pub, visibility: 'private' }, body())).toEqual(body());
    expect(rewritePublicMediaUrls({ ...pub, deploymentStatus: 'draft' }, body())).toEqual(body());
  });
});
