# R2 mirror failover (not yet deployed)

Worker v2 adds an R2 mirror fallback: when the origin fetch ends in 403
(Backblaze daily download cap) or 5xx, media is served from the R2 bucket
binding MEDIA_MIRROR (bucket: oncehere-media-mirror) with the same cache
headers. Origin 401/404 never reach the mirror, so private-archive decisions
stay with the origin. Without the bucket binding the worker behaves exactly
like v1.

Deploy order (each step approved separately):
1. Create the R2 bucket `oncehere-media-mirror` (dashboard or wrangler r2 bucket create).
2. One-time B2 -> R2 copy + scheduled sync (rclone via GitHub Action, creds in GitHub Secrets).
3. Deploy worker v2: npx wrangler deploy --config cloudflare/wrangler.jsonc

Local test (2026-10-19): 12/12 checks pass under wrangler dev with a mock origin
and local R2 - normal passthrough, 403/500 -> mirror, mirror miss -> original
error no-store, 401 private never touches mirror, 404 no fallback, non-media
mirror objects refused, no binding -> identical to v1.
