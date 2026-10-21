# OnceHere Render secondary-host runbook

Last updated: 17 September 2026.

**Current production is Vercel, not Render.** This file is retained only for the optional/secondary Render deployment path. Do not use it to infer the current production provider or current archive limits.

The current architecture is one Vite/Express application, Turso/libSQL durable archive state, private S3-compatible object storage, and an optional Cloudflare media CDN for deployed public archives. Uploaded media is transferred directly from the browser to object storage with signed URLs.

## If using Render again

Free/low-cost host behavior, included bandwidth, sleep rules, and pricing can change. Check the current Render dashboard/documentation rather than relying on an old OnceHere assumption.

Do not run external keep-alive monitors merely to prevent a free service from sleeping. They create unnecessary traffic and can consume host allowances. If a secondary Render instance is intentionally allowed to sleep, accept the cold start rather than simulating constant user traffic.

## Required server environment

Set these values in the Render service environment; never expose them as `VITE_` variables:

```text
NODE_ENV=production
APP_URL=https://the-render-or-custom-origin
SESSION_SECRET=a-stable-random-secret-at-least-32-bytes
PLATFORM_ADMIN_KEY=a-private-platform-owner-key
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
OBJECT_STORAGE_ENDPOINT=https://...
OBJECT_STORAGE_REGION=...
OBJECT_STORAGE_ACCESS_KEY_ID=...
OBJECT_STORAGE_SECRET_ACCESS_KEY=...
OBJECT_STORAGE_BUCKET=oncehere-media
OBJECT_STORAGE_FORCE_PATH_STYLE=false
```

Cloudflare-specific `R2_*` variables may be used instead of `OBJECT_STORAGE_*`; generic `OBJECT_STORAGE_*` values take precedence when both sets are configured.

Changing `SESSION_SECRET` logs existing owner/editor/viewer sessions out. Recovery-key ownership still works as long as the archive data and recovery-key hash remain intact.

## Optional Cloudflare media CDN on Render

Render does not require the media CDN. If both variables below are omitted, Render keeps OnceHere's existing direct signed-object delivery behavior.

To make an intentionally active Render instance redirect eligible **deployed public** archive media through the same Cloudflare Worker as Vercel, set:

```text
MEDIA_CDN_BASE_URL=https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev
MEDIA_CDN_ORIGIN_SECRET=the-same-secret-configured-as-ORIGIN_SECRET-in-the-worker
```

The Worker itself has one canonical `ORIGIN_BASE_URL`. Current production uses `https://oncehere.vercel.app`, so a secondary Render host may emit Worker URLs while cache misses are still authorized/fetched through the canonical Vercel origin. If Render later becomes the canonical origin, change `ORIGIN_BASE_URL` in the Worker to the exact HTTPS Render/custom-domain origin and redeploy the Worker.

Never put `MEDIA_CDN_ORIGIN_SECRET` in client code, a `VITE_` variable, GitHub, or logs.

## CORS when adding a Render origin

If Render is used as a second live origin, add its exact HTTPS origin to object-storage CORS. Do not include a path or trailing slash. Keep the storage bucket private.

## Secondary-host acceptance checklist

1. Deploy the exact intended Git commit.
2. Require `/api/health` to report healthy, durable storage configured, database configured, session signing configured, and object storage configured.
3. Require `/api/storage-status` to report storage connected. If CDN variables were deliberately enabled on Render, also require `mediaCdn.enabled` to be `true`; otherwise require it to remain `false`.
4. Recover a disposable/test archive with its Owner Master Recovery Key.
5. Verify reveal/copy/download of the recovery-key backup after owner-key access.
6. Test contributor and private-viewer permissions.
7. Test Studio section jumps across Journey, Yearbook, Media Vault, Memory Wall, and Farewell.
8. Upload and persist one image in each image-capable section and a small video in Journey/Vault.
9. Refresh/reopen and verify protected media still loads.
10. If the CDN is enabled on Render, verify one deployed public media request redirects to the Worker and returns `X-OnceHere-Media-CDN: worker`; verify private/draft media does not use the Worker.
11. Delete temporary content and verify it stays deleted.
12. Inspect host logs after the test.

## Limits

Render hosting does not redefine OnceHere's application quotas. Use [CURRENT_LIMITS.md](CURRENT_LIMITS.md) and `server/r2.ts` for the current enforced media/storage rules.

A passing local build is not proof that a secondary host's environment variables, database network access, object-storage CORS, cookies, custom domain, or optional CDN variables are configured correctly; verify them on the actual deployment.
