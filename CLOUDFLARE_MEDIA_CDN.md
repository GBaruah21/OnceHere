# OnceHere Cloudflare Media CDN

This is an optional traffic-protection layer for **deployed public archives**.
OnceHere keeps Backblaze B2 (or another S3-compatible bucket) as the private source of truth, while a Cloudflare Worker becomes the stable public media URL and caches responses at Cloudflare's edge.

Private archives, drafts and non-public archives keep using OnceHere's existing authenticated signed-object path and are never intentionally routed through the public CDN.

## Why this helps

- Browser -> Cloudflare for public archive media.
- Cloudflare -> the canonical OnceHere origin only on a cache miss.
- OnceHere authorizes the archive and returns a short-lived private object-storage URL.
- Cloudflare follows that URL **without forwarding the shared origin secret to object storage** and returns the media.
- Repeated public views can be served from Cloudflare's cache instead of repeatedly invoking OnceHere/B2.

The CDN response is intentionally cached for only **5 minutes**. This keeps the traffic benefit while limiting the time an already-cached public object could remain reachable after an archive is changed from public to private. If immediate purge-on-privacy-change is added later, this TTL can safely be increased.

## Production topology

The Worker has one canonical `ORIGIN_BASE_URL`: the OnceHere server origin it calls on a cache miss.

The current production origin is:

```text
https://oncehere.vercel.app
```

Render may remain available as a secondary OnceHere host. A secondary Render deployment can use the same `MEDIA_CDN_BASE_URL` and `MEDIA_CDN_ORIGIN_SECRET` as Vercel and redirect eligible public media to the same Worker. The Worker still fetches misses from the single canonical `ORIGIN_BASE_URL` configured in Cloudflare.

If Render later becomes the canonical production origin, change the Worker's `ORIGIN_BASE_URL` to the exact HTTPS Render/custom-domain origin and redeploy the Worker. Do not point the Worker at a URL that itself redirects to the Worker.

## Files

- `cloudflare/media-cdn-worker.js` - Worker source.
- `cloudflare/wrangler.jsonc` - Worker configuration with Workers Caching enabled.
- `server/mediaCdn.ts` - server-side feature flag, URL construction and trusted-origin check.
- `tests/media-cdn-worker.test.ts` - Worker security/cache behavior tests.

## One-time setup

### 1. Generate one shared origin secret

Generate a random value of at least 32 bytes. Do not commit it to GitHub and do not send it in chat.

Use the exact same value in both places:

- Each active OnceHere server host that should emit CDN redirects: `MEDIA_CDN_ORIGIN_SECRET`
- Cloudflare Worker secret: `ORIGIN_SECRET`

The secret exists only so the trusted Worker can call the OnceHere media endpoint without being redirected back to itself. It does **not** replace OnceHere's private/draft archive authorization.

### 2. Deploy the hardened Worker

Deploy only a revision that includes the manual signed-storage redirect handling from `cloudflare-media-cdn-hardening`. That prevents `x-oncehere-cdn-origin` from being forwarded to B2/S3.

From the repository root, with the intended Cloudflare account authenticated in Wrangler:

```bash
npx wrangler@latest secret put ORIGIN_SECRET --config cloudflare/wrangler.jsonc
npx wrangler@latest deploy --config cloudflare/wrangler.jsonc
```

The committed config currently sets:

```text
ORIGIN_BASE_URL=https://oncehere.vercel.app
```

A `workers.dev` address is sufficient; a custom domain is optional.

### 3. Enable CDN redirects on OnceHere hosts

Set these server-only production variables on Vercel and on any intentionally active secondary Render instance that should use the CDN:

```text
MEDIA_CDN_BASE_URL=https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev
MEDIA_CDN_ORIGIN_SECRET=the-same-secret-used-by-the-worker
```

Never expose either value as a `VITE_` variable. Redeploy each host after changing its server environment.

It is valid to enable the CDN on Vercel while leaving a dormant/secondary Render instance without the CDN variables. In that case Render simply keeps the existing signed-object delivery path.

### 4. Verify before considering activation complete

1. Open `/api/health` on the active OnceHere origin and confirm the application, database/session signing and object storage are healthy.
2. Open `/api/storage-status` and confirm storage is connected and `mediaCdn.enabled` is `true` only on hosts where CDN redirects were deliberately enabled.
3. Open one deployed **public** archive and inspect a media request.
4. `/api/archives/<archive-id>/media-object/<file>` should redirect to the Worker URL.
5. The Worker URL should return the image/video successfully and include `X-OnceHere-Media-CDN: worker`.
6. Repeat the request and verify Cloudflare caching is working after warming.
7. Open a private archive and a non-deployed/draft archive with valid access and confirm their media continues through the original protected OnceHere path rather than the public Worker.
8. Confirm requests without valid private/draft access remain rejected.

## Safe rollback

Remove `MEDIA_CDN_BASE_URL` or `MEDIA_CDN_ORIGIN_SECRET` from every active OnceHere host where the CDN was enabled, then redeploy those hosts. OnceHere automatically falls back to its existing signed object-storage delivery path; no media records, database rows or object keys need to be migrated.

The Worker can remain deployed while disabled at the application hosts because OnceHere will no longer generate Worker URLs.
