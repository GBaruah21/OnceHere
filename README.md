<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/cff0c7f3-5e44-4dbc-905a-c4c4367dfb34

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## OnceHere repair notes

Read [RETRY-QA.md](RETRY-QA.md) before deploying. It lists the implemented repairs, actual test results and unresolved release blockers, including the 150 MB video requirement.

The active application is under `src/`; server implementation is under `server/`. Configure server values from `.env.example` in `.env.local` for local development, or in your hosting environment for production. Never put Gemini, Supabase, session or admin secrets in frontend variables. The server now loads local environment files explicitly.

Run `npm run lint`, `npm test`, and `npm run build` to repeat the checked validations. Start a built Node deployment with `NODE_ENV=production npm start` only after satisfying the deployment gate in the QA notes.
