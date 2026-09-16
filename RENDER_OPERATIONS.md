# OnceHere Render secondary-host runbook

Last updated: 16 September 2026.

**Current production is Vercel, not Render.** This file is retained only for the optional/secondary Render deployment path. Do not use it to infer the current production provider or current archive limits.

The current architecture is one Vite/Express application, Turso/libSQL durable archive state, and private S3-compatible object storage. Uploaded media is transferred directly from the browser to object storage with signed URLs.

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

## CORS when adding a Render origin

If Render is used as a second live origin, add its exact HTTPS origin to object-storage CORS. Do not include a path or trailing slash. Keep the storage bucket private.

## Secondary-host acceptance checklist

1. Deploy the exact intended Git commit.
2. Require `/api/health` to report healthy, durable storage configured, database configured, session signing configured, and object storage configured.
3. Require `/api/storage-status` to report connected.
4. Recover a disposable/test archive with its Owner Master Recovery Key.
5. Verify reveal/copy/download of the recovery-key backup after owner-key access.
6. Test contributor and private-viewer permissions.
7. Test Studio section jumps across Journey, Yearbook, Media Vault, Memory Wall, and Farewell.
8. Upload and persist one image in each image-capable section and a small video in Journey/Vault.
9. Refresh/reopen and verify protected media still loads.
10. Delete temporary content and verify it stays deleted.
11. Inspect host logs after the test.

## Limits

Render hosting does not redefine OnceHere's application quotas. Use [CURRENT_LIMITS.md](CURRENT_LIMITS.md) and `server/r2.ts` for the current enforced media/storage rules.

A passing local build is not proof that a secondary host's environment variables, database network access, object-storage CORS, cookies, or custom domain are configured correctly; verify them on the actual deployment.
