import { afterEach, describe, expect, it, vi } from 'vitest';
import mediaCdnWorker from '../cloudflare/media-cdn-worker.js';

const env = {
  ORIGIN_BASE_URL: 'https://oncehere.vercel.app',
  ORIGIN_SECRET: '0123456789abcdef0123456789abcdef'
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Cloudflare media CDN Worker', () => {
  it('rejects unsupported methods and malformed paths without hitting origin', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const postResponse = await mediaCdnWorker.fetch(
      new Request('https://oncehere-media-cdn.example.workers.dev/media/arc-123/photo.webp', { method: 'POST' }),
      env
    );
    expect(postResponse.status).toBe(405);
    expect(postResponse.headers.get('cache-control')).toBe('no-store');

    const badPathResponse = await mediaCdnWorker.fetch(
      new Request('https://oncehere-media-cdn.example.workers.dev/not-media/arc-123/photo.webp'),
      env
    );
    expect(badPathResponse.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires a secure origin and sufficiently long shared secret', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await mediaCdnWorker.fetch(
      new Request('https://oncehere-media-cdn.example.workers.dev/media/arc-123/photo.webp'),
      { ORIGIN_BASE_URL: 'http://oncehere.vercel.app', ORIGIN_SECRET: 'too-short' }
    );

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('follows the signed storage redirect without forwarding the origin secret', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: 'https://storage.example.com/signed/photo.webp?token=abc' }
      }))
      .mockResolvedValueOnce(new Response('image-bytes', {
        status: 200,
        headers: {
          'content-type': 'image/webp',
          'content-length': '11',
          'set-cookie': 'should-be-removed=1'
        }
      }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await mediaCdnWorker.fetch(
      new Request('https://oncehere-media-cdn.example.workers.dev/media/arc-123/photo.webp'),
      env
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [originUrl, originInit] = fetchMock.mock.calls[0];
    expect(originUrl).toBe('https://oncehere.vercel.app/api/archives/arc-123/media-object/photo.webp');
    expect(originInit.redirect).toBe('manual');
    expect(new Headers(originInit.headers).get('x-oncehere-cdn-origin')).toBe(env.ORIGIN_SECRET);

    const [storageUrl, storageInit] = fetchMock.mock.calls[1];
    expect(storageUrl).toBe('https://storage.example.com/signed/photo.webp?token=abc');
    expect(new Headers(storageInit.headers).get('x-oncehere-cdn-origin')).toBeNull();
    expect(new Headers(storageInit.headers).get('accept-encoding')).toBe('identity');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=300');
    expect(response.headers.get('cloudflare-cdn-cache-control')).toBe('public, max-age=300');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('x-oncehere-media-cdn')).toBe('worker');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('refuses unsafe redirects and non-media upstream responses', async () => {
    const unsafeRedirectFetch = vi.fn().mockResolvedValueOnce(new Response(null, {
      status: 302,
      headers: { location: 'http://storage.example.com/photo.webp' }
    }));
    vi.stubGlobal('fetch', unsafeRedirectFetch);

    const unsafeRedirectResponse = await mediaCdnWorker.fetch(
      new Request('https://oncehere-media-cdn.example.workers.dev/media/arc-123/photo.webp'),
      env
    );
    expect(unsafeRedirectResponse.status).toBe(502);
    expect(unsafeRedirectFetch).toHaveBeenCalledTimes(1);

    const nonMediaFetch = vi.fn().mockResolvedValueOnce(new Response('not media', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' }
    }));
    vi.stubGlobal('fetch', nonMediaFetch);

    const nonMediaResponse = await mediaCdnWorker.fetch(
      new Request('https://oncehere-media-cdn.example.workers.dev/media/arc-123/photo.webp'),
      env
    );
    expect(nonMediaResponse.status).toBe(502);
    expect(nonMediaResponse.headers.get('cache-control')).toBe('no-store');
  });
});
