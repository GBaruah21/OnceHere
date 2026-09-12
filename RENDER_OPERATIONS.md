# OnceHere Render operations runbook

This runbook is designed for the current architecture: one Express/Vite service,
Supabase-backed durable archive snapshots, and private Backblaze B2 media.

## What happens after a bandwidth suspension

Render documents that a Hobby workspace without a payment method is spun down
after its included outbound bandwidth is exhausted and is restored at the start
of the next month. No code or redeploy is required for that monthly reset. Check
the dashboard on the first day because an unrelated configuration or build error
can still prevent a healthy restart.

Any external 14-minute monitors will also resume reaching the service after the
reset. Stop them before the reset so the new allowance is not consumed again.

## Stop every keep-alive monitor

1. Disable the Google/Gemini scheduled task now.
2. Search every email inbox and password manager for the exact Render hostname,
   `UptimeRobot`, `Better Stack`, `Freshping`, `cron-job.org`, `HetrixTools`, and
   `Uptime Kuma`.
3. Use password reset with each likely email address. If the account cannot be
   recovered, ask that provider's support team to delete the monitor for the
   exact URL.
4. After Render restores the service, open its request logs. A request arriving
   at the same interval reveals the path, user agent, and often the monitor name.
5. If ownership cannot be recovered, changing the Render service hostname stops
   requests to the old hostname, but breaks every old link. Treat this as the
   last resort and verify the custom domain, B2 CORS origins, and `APP_URL` first.

Returning `204`, blocking a user agent, or serving a tiny health response does
not solve Free Render sleep: the inbound request still wakes the instance and it
continues consuming free instance hours. Those measures reduce response bytes
only.

## The three honest hosting choices

### 1. Free Render, allow sleep

Cost: zero. Cold start: about one minute after 15 idle minutes. Stop all external
keep-alives. This is suitable for testing, not a production promise.

### 2. Paid Render compute

This is the simplest way to keep the current URL and remove Free-instance idle
spin-down. Changing only the workspace plan is not sufficient; the web service's
compute plan itself must be paid. Adding a payment method for bandwidth overage
does not by itself remove Free compute sleep.

### 3. Move the whole app to Vercel

The repository includes `vercel.json` and `api/index.ts`, and the Vite client is
served from the delivery network while API requests run as functions. Copy every
required environment variable and add the new exact Vercel/custom origin to the
Backblaze CORS rule before testing uploads. Do not split the current frontend and
API across unrelated origins without redesigning cookie/CSRF handling.

Vercel is not an unlimited guarantee. Its Hobby plan has usage and function
limits. The current snapshot persistence also uses process-local mutation locks,
so concurrent multi-instance production traffic needs a transactional database
redesign before a high-traffic launch. For a small preview, test it on a separate
deployment without changing the working Render service.

## Required production environment gate

Set these in the host dashboard; never put their values in Git or in a `VITE_`
variable:

- `NODE_ENV=production`
- `APP_URL` equal to the final HTTPS origin
- `SESSION_SECRET` stable and at least 32 random bytes
- `PLATFORM_ADMIN_KEY` stable and private
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
- `OBJECT_STORAGE_ENDPOINT`
- `OBJECT_STORAGE_REGION`
- `OBJECT_STORAGE_ACCESS_KEY_ID`
- `OBJECT_STORAGE_SECRET_ACCESS_KEY`
- `OBJECT_STORAGE_BUCKET`
- `OBJECT_STORAGE_FORCE_PATH_STYLE=false`

The app now refuses to start in production without a stable session-signing
secret. This is intentional: silently generating a new secret would invalidate
all browser sessions after a sleep, restart, or redeploy.

## First-day recovery checklist

1. Confirm the Render workspace is active and outbound usage has reset.
2. Confirm all keep-alive tasks are disabled.
3. Open `/api/health`; require `status: healthy` and
   `durableStorage: configured`.
4. Confirm the reported build commit is the intended GitHub commit.
5. Open the landing page and all demo archives.
6. Recover one owner workspace with its recovery-key file.
7. Create a temporary draft archive.
8. Upload one JPG to the vault, one timeline image, one profile portrait, one
   wall image, and one small MP4. Refresh after each save and confirm it remains.
9. Delete the temporary media and archive; confirm deleted items do not return.
10. Test a wrong contributor PIN and confirm it reveals no attempt count.
11. Test the correct PIN, private viewer PIN, owner-only restrictions, deploy,
    unpublish, and slug-conflict handling.
12. Inspect browser console, failed network requests, Render logs, Supabase state,
    Backblaze object count, and Render bandwidth after the test.

Production cannot be certified while the service is suspended. A successful
local build and mocked automated tests do not replace the live storage/restart,
DNS, browser, accessibility, and mobile acceptance checks above.
