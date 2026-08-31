import express, { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';

import { apiRouter } from '../server/api';
import { PLATFORM_CONFIG } from '../src/config/platform';

// Vercel invokes this exported app for every /api/* request (see vercel.json).
// The existing router remains the single source of truth for all API behavior.
const app = express();

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'healthy',
    platform: PLATFORM_CONFIG.name,
    timestamp: new Date().toISOString()
  });
});

app.use('/api', apiRouter);

// API failures must stay JSON so the browser never receives Vercel's HTML error
// page for an application exception.
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled API error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
