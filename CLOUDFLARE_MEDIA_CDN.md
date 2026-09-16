# OnceHere Cloudflare Media CDN

This is an optional free traffic-protection layer for **deployed public archives**.
OnceHere keeps Backblaze B2 (or another S3-compatible bucket) as the private source of truth, while a Cloudflare Worker becomes the stable public media URL and caches responses at Cloudflare's edge.

Private archives, drafts and non-public archives keep using OnceHere's existing authenticated signed-object path and are never intentionally routed through the public CDN.

## Why this helps

- Browser -> Cloudflare for public archive media.
- Cloudflare -> OnceHere only on a cache miss.
- OnceHere authorizes the archive and returns a short-lived private object-storage URL.
- Cloudflare follows that URL and returns the media.
- Repeated public views can be served from Cloudflare's cache instead of repeatedly invoking OnceHere/B2.
- Backblaze documents free transfer to Cloudflare through the Bandwidth Alliance.

The CDN response is intentionally cached for only **5 minutes**. This keeps the viral-traffic benefit while limiting the time an already-cached public object could remain reachable after an archive is changed from public to private. If immediate purge-on-privacy-change is added later, this TTL can safely be increased.

## Files

- `cloudflare/media-cdn-worker.js` - Worker source.
- `cloudflare/wrangler.jsonc` - Worker configuration with Workers Caching enabled.
- `server/mediaCdn.ts` - server-side feature flag, URL construction and trusted-origin check.

## One-time setup

### 1. Generate one shared origin secret

Generate a random value of at least 32 bytes. Do not commit it to GitHub and do not send it in chat.

Use the same secret in both places:

- Vercel environment variable: `MEDIA_CDN_ORIGIN_SECRET`
- Cloudflare Worker secret: `ORIGIN_SECRET`

The secret is used to stop the Worker from being redirected back to itself. It does **not** replace OnceHere's private/draft archive authorization.

### 2. Deploy the Worker

From the repository root, with a Cloudflare account authenticated in Wrangler:

```bash
npx wrangler@latest secret put ORIGIN_SECRET --config cloudflare/wrangler.jsonc
npx wrangler@latest deploy --config cloudflare/wrangler.jsonc
```

The config already sets:

```text
ORIGIN_BASE_URL=https://oncehere.vercel.app
```

A free `workers.dev` address is enough; a custom domain is optional.

### 3. Enable it in Vercel

Set these production variables in the OnceHere Vercel project:

```text
MEDIA_CDN_BASE_URL=https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev
MEDIA_CDN_ORIGIN_SECRET=the-same-secret-used-by-the-worker
```

Redeploy OnceHere after adding the variables.

### 4. Verify

1. Open `/api/storage-status` and confirm `mediaCdn.enabled` is `true`.
2. Open one deployed **public** archive and inspect a media request.
3. `/api/archives/<archive-id>/media-object/<file>` should redirect to the Worker URL.
4. The Worker URL should return the image/video successfully.
5. Repeat the request and confirm Cloudflare reports a cache hit after warming.
6. Open a private/draft archive with valid access and confirm its media continues through the original protected OnceHere path rather than the public Worker.

## Safe rollback

Remove `MEDIA_CDN_BASE_URL` (or `MEDIA_CDN_ORIGIN_SECRET`) from Vercel and redeploy. OnceHere automatically falls back to its existing signed object-storage delivery path; no media records or object keys need to be migrated.
