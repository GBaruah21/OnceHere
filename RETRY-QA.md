# OnceHere current QA and release status

Last updated: 16 September 2026.

This document is the current QA summary. Earlier commits of this file contain the historical Supabase/Render repair notes; those older architecture notes are not the current production source of truth.

## Current production architecture

- Frontend/API hosting: Vercel.
- Durable archive state: Turso/libSQL configuration.
- Uploaded media: private S3-compatible object storage through browser-to-storage signed uploads.
- Server-side session signing: stable production `SESSION_SECRET`.
- Media bytes do not travel through API JSON.

The current product/upload limits are documented in [CURRENT_LIMITS.md](CURRENT_LIMITS.md) and enforced by `server/r2.ts`.

## Latest verified automated gate

For the owner-recovery and section-navigation repair on 16 September 2026, CI completed successfully with:

- clean `npm ci` install;
- TypeScript (`npm run lint`) pass;
- 5 test files / 60 tests passed;
- production Vite client build passed;
- production Express/server bundle passed;
- dependency audit reported 0 vulnerabilities during the clean install.

Some storage tests intentionally use fake S3 credentials and therefore print expected credential/CORS errors while testing URL-generation behavior. Persistence-failure tests intentionally log simulated failures. Those test logs are not production incidents.

## Latest production verification

After the same repair was merged to `main`, the Vercel production deployment reached READY. The production `/api/health` endpoint reported:

- `status: healthy`;
- Turso configured;
- session signing configured;
- object storage configured;
- durable storage configured;
- build commit matching the intended GitHub `main` commit.

`/api/storage-status` also reported the object store connected, and the immediate post-deploy production error/fatal log check was clean.

## Owner recovery behavior

The server stores only a bcrypt hash of the Owner Master Recovery Key. It cannot derive the original plaintext key from that hash.

When an owner successfully enters the recovery key through Key Access, OnceHere now keeps that exact entered key in the current tab's session storage. Access & Privacy can then reveal, copy, and download the same permanent recovery key. Contributor/editor PIN sessions do not receive it. The recovery-key replacement endpoint remains disabled.

## Section-navigation behavior

Studio quick-jump and archive navigation now use explicit scrolling inside the correct preview/window scroller after layout settles, instead of relying on a one-shot `scrollIntoView()` call. This is intended to cover direct Journey → Yearbook / Media Vault / Memory Wall / Farewell jumps and nested Studio preview scrolling.

## What automated validation does not certify

Passing TypeScript, unit/API tests, build, health, and runtime-log checks does not prove every browser interaction on every real device. Before a broad public launch, run a small live acceptance pass on expendable/test data covering:

1. owner recovery-key unlock followed by reveal/copy/download;
2. contributor PIN and private viewer PIN permissions;
3. Studio quick-jump between every visible section;
4. one image upload in Vault, Journey, Yearbook portrait, and Memory Wall;
5. one small video upload in Vault and Journey;
6. refresh/reopen after saves;
7. deletion of temporary media;
8. mobile and desktop public archive navigation;
9. all six themes and the main share controls;
10. production console/network/runtime logs after the test.

Do not use a real archive containing irreplaceable media as the acceptance-test target.

## Known design/operational limits

- Current videos are intentionally limited to 20 MB and are not transcoded or resumable. The older 59 MB/150 MB requirements in historical notes are not implemented current limits.
- Vercel, Turso, and the object-storage provider each have independent plan quotas. There is no hard-coded global archive-count limit in OnceHere itself.
- A permanent recovery key is simple for ownership continuity but has an unavoidable trade-off: if the plaintext key is stolen, it cannot currently be rotated. Store backups carefully.
- The application currently relies on browser/session-based owner/editor workflows rather than an account system. This matches the product's account-free design but makes possession of owner credentials especially important.
- Real high-concurrency/load capacity has not been benchmarked. Capacity estimates should be expressed in terms of media storage, provider quotas, and traffic rather than as a guaranteed number of archives.
- GitHub Actions currently validates with Node 20; current builds pass, but the Actions/AWS SDK ecosystem is moving toward Node 22+, so upgrading the CI/runtime baseline is a future maintenance task.

## Deployment rule

A release may be merged only after the clean install, TypeScript, tests, and production build pass. After Vercel deploys it, verify the exact build commit, `/api/health`, `/api/storage-status`, and runtime errors before calling the deployment healthy.
