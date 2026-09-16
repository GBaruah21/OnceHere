# OnceHere

OnceHere is a multi-tenant digital memory/archive platform for school batches, college classes, teams, trips, reunions, and communities. The active Vite application lives under `src/`; the Express/API implementation lives under `server/`.

Production currently runs on Vercel. Durable archive state uses the configured Turso/libSQL database, while uploaded media is stored separately in private S3-compatible object storage through signed browser-to-storage transfers.

## Run locally

**Prerequisite:** Node.js.

1. Install dependencies with `npm install` (or `npm ci` for a lockfile-clean install).
2. Copy `.env.example` to your local environment file and fill the required server-side values.
3. Run `npm run dev`.

Never expose session, database, object-storage, or platform-admin secrets through `VITE_` variables.

## Production validation

Before merging a release, run:

```bash
npm ci
npm run lint
npm test
npm run build
```

After deployment, verify `/api/health`, `/api/storage-status`, the exact deployed Git commit, and production runtime logs. Automated unit/API/build checks do not replace a real browser acceptance pass for owner recovery, uploads, private archive access, responsive layout, and the public archive experience.

The current enforced product limits are documented in [CURRENT_LIMITS.md](CURRENT_LIMITS.md). Server-side media enforcement is defined in `server/r2.ts`.

## Recovery-key security

The Owner Master Recovery Key is an owner credential, not a contributor credential. The server persists only its hash. When an owner successfully enters the recovery key through Key Access, the exact key is kept in that browser tab's session storage so Access & Privacy can reveal/copy/download a backup. A key that is truly lost everywhere cannot be reconstructed from the server hash.

## Object storage

OnceHere uploads media directly from the browser to private S3-compatible object storage using short-lived signed PUT URLs. This avoids relaying large media bodies through the Vercel API function and keeps API JSON small.

- For Backblaze B2-compatible configuration, see [BACKBLAZE_B2_SETUP.md](BACKBLAZE_B2_SETUP.md).
- For Cloudflare R2 configuration, see [R2_SETUP.md](R2_SETUP.md).

## Historical/secondary hosting

[RENDER_OPERATIONS.md](RENDER_OPERATIONS.md) is retained only as a secondary-host/legacy runbook. It is not the description of the current production deployment.

[RETRY-QA.md](RETRY-QA.md) contains the current release-validation status plus links back to historical repair concerns. Do not treat old Supabase/Render/video-limit notes from previous commits as current production limits; use `CURRENT_LIMITS.md` and the active code.
