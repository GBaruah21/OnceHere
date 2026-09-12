<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy OnceHere

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/cff0c7f3-5e44-4dbc-905a-c4c4367dfb34

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local` and fill the server-side storage and session values
3. Run the app:
   `npm run dev`

## OnceHere repair notes

Read [RETRY-QA.md](RETRY-QA.md) before deploying. It lists the implemented repairs, actual test results and unresolved release blockers, including the 150 MB video requirement.

The active application is under `src/`; server implementation is under `server/`. Configure server values from `.env.example` in `.env.local` for local development, or in your hosting environment for production. Never put Gemini, Supabase, session or admin secrets in frontend variables. The server now loads local environment files explicitly.

Run `npm run lint`, `npm test`, and `npm run build` to repeat the checked validations. Start a built Node deployment with `NODE_ENV=production npm start` only after satisfying the deployment gate in the QA notes.

### Backblaze B2 fast uploads

OnceHere first uploads files directly from the browser to the private B2 bucket.
There is deliberately no Render upload proxy fallback: a failed upload remains
selected and retryable in the browser, avoiding a second transfer and protecting
the hosting bandwidth allowance.

In the Backblaze bucket, open **CORS Rules** and add a rule for the exact deployed
OnceHere origin (for example, `https://your-service.onrender.com`) with:

- Allowed operation: `s3_put`
- Allowed origin: the exact HTTPS origin of the deployed app
- Allowed header: `content-type`
- Maximum age: `3600`

Do not include a path or trailing slash in the origin. Add each production or
preview origin explicitly. Keeping the bucket private is supported; CORS does not
make stored objects public.

### Render sleep and bandwidth

Do not use a 14-minute uptime monitor on a Free Render web service. It prevents
idle spin-down, consumes the workspace's shared free instance hours, and makes
every response count toward outbound bandwidth. See [RENDER_OPERATIONS.md](RENDER_OPERATIONS.md)
for the recovery procedure, monitoring-account checklist, environment gate, and
the honest hosting choices for removing the one-minute cold start.
