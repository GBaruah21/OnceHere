import express, { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';

import { apiRouter } from '../server/api.js';
import { PLATFORM_CONFIG } from '../src/config/platform.js';
import { db } from '../server/db.js';
import { getRuntimeReadiness } from '../server/runtime-config.js';
import { renderArchiveSharePage } from '../server/sharePage.js';
import { enforceArchiveVideoLimit } from '../server/videoPolicy.js';

// Vercel invokes this exported app for every /api/* request (see vercel.json).
// The existing router remains the single source of truth for all API behavior.
const app = express();

// Media bytes are uploaded directly to private object storage. Keeping the API
// body limit small prevents stale clients from relaying base64 files through a
// serverless function and unexpectedly consuming memory or transfer allowance.
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  const readiness = getRuntimeReadiness();
  res.status(readiness.ready ? 200 : 503).json({
    status: readiness.ready ? 'healthy' : 'degraded',
    platform: PLATFORM_CONFIG.name,
    provider: readiness.provider,
    services: readiness.services,
    buildCommit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || 'local',
    durableStorage: db.hasDurableStorage() ? 'configured' : 'not-configured',
    timestamp: new Date().toISOString()
  });
});

// Crawler-friendly share bridge. Vercel rewrites /share/:slug here while the
// archive itself continues to render at /s/:slug through the existing SPA.
app.get('/api/share', renderArchiveSharePage);

app.use('/api', enforceArchiveVideoLimit, apiRouter);

// API failures must stay JSON so the browser never receives Vercel's HTML error
// page for an application exception.
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled API error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
