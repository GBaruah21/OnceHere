const ARCHIVE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const FILE_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;
const MEDIA_TYPE_PATTERN = /^(image|video)\//i;

function noStore(status, body) {
  return new Response(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

// Serve from the R2 mirror. Only ever called AFTER the origin (Vercel) has
// authorized the request (it redirected to storage) and storage then failed
// with 403 (Backblaze daily cap) or 5xx. Never called for origin 401/404, so
// private-archive and not-found decisions stay with the origin.
async function fromMirror(request, env, archiveId, fileName) {
  const bucket = env.MEDIA_MIRROR;
  if (!bucket) return null;
  const key = `archives/${archiveId}/${fileName}`;
  let object;
  try {
    object = request.method === 'HEAD'
      ? await bucket.head(key)
      : await bucket.get(key);
  } catch {
    return null; // mirror error: fall through to the original upstream error
  }
  if (!object) return null;
  const contentType = (object.httpMetadata && object.httpMetadata.contentType) || '';
  if (!MEDIA_TYPE_PATTERN.test(contentType)) return null;
  const headers = new Headers();
  headers.set('Content-Type', contentType);
  if (object.size != null) headers.set('Content-Length', String(object.size));
  headers.set('Cache-Control', 'public, max-age=300, s-maxage=300');
  headers.set('Cloudflare-CDN-Cache-Control', 'public, max-age=300');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('X-Media-Source', 'r2-mirror');
  return new Response(request.method === 'HEAD' ? null : object.body, {
    status: 200,
    headers
  });
}

export default {
  async fetch(request, env) {
    if (!['GET', 'HEAD'].includes(request.method)) {
      return noStore(405, 'Method not allowed');
    }

    const requestUrl = new URL(request.url);
    const match = requestUrl.pathname.match(/^\/media\/([^/]+)\/([^/]+)$/);
    if (!match) return noStore(404, 'Not found');

    let archiveId;
    let fileName;
    try {
      archiveId = decodeURIComponent(match[1]);
      fileName = decodeURIComponent(match[2]);
    } catch {
      return noStore(400, 'Invalid media path');
    }

    if (!ARCHIVE_ID_PATTERN.test(archiveId) || !FILE_NAME_PATTERN.test(fileName)) {
      return noStore(400, 'Invalid media path');
    }

    const originBase = String(env.ORIGIN_BASE_URL || '').replace(/\/$/, '');
    const originSecret = String(env.ORIGIN_SECRET || '');
    if (!/^https:\/\//i.test(originBase) || originSecret.length < 24) {
      return noStore(503, 'Media CDN is not configured');
    }

    const originUrl = `${originBase}/api/archives/${encodeURIComponent(archiveId)}/media-object/${encodeURIComponent(fileName)}`;
    const originHeaders = new Headers();
    originHeaders.set('x-oncehere-cdn-origin', originSecret);
    // Fetch the complete immutable object. Cloudflare can then satisfy browser
    // range requests from its cached full response instead of repeatedly
    // reaching the origin for video segments.
    originHeaders.set('Accept-Encoding', 'identity');

    let upstream;
    try {
      upstream = await fetch(originUrl, {
        method: request.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: originHeaders,
        redirect: 'follow'
      });
    } catch {
      return noStore(502, 'Media origin unavailable');
    }

    if (!upstream.ok) {
      // Storage-cap (403) or upstream 5xx: try the R2 mirror. Origin 401/404
      // (private or missing media) never reach the mirror.
      if (upstream.status === 403 || upstream.status >= 500) {
        const mirrored = await fromMirror(request, env, archiveId, fileName);
        if (mirrored) return mirrored;
      }
      const headers = new Headers(upstream.headers);
      headers.set('Cache-Control', 'no-store');
      headers.set('X-Content-Type-Options', 'nosniff');
      return new Response(request.method === 'HEAD' ? null : upstream.body, {
        status: upstream.status,
        headers
      });
    }

    const contentType = upstream.headers.get('content-type') || '';
    if (!MEDIA_TYPE_PATTERN.test(contentType)) {
      return noStore(502, 'Unexpected media response');
    }

    const headers = new Headers(upstream.headers);
    headers.delete('set-cookie');
    headers.delete('www-authenticate');
    headers.set('Cache-Control', 'public, max-age=300, s-maxage=300');
    headers.set('Cloudflare-CDN-Cache-Control', 'public, max-age=300');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: 200,
      headers
    });
  }
};
