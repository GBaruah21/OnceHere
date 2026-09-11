import './server/environment';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './server/api';
import { PLATFORM_CONFIG } from './src/config/platform';
import { db } from './server/db';

const portFlag = process.argv.indexOf('--port');
const PORT = Number(portFlag >= 0 ? process.argv[portFlag + 1] : process.env.PORT || 3000);
const hostFlag = process.argv.indexOf('--host');
const HOST = hostFlag >= 0 ? process.argv[hostFlag + 1] : '0.0.0.0';

async function startServer() {
  const app = express();

  // Files use signed object-storage URLs. API bodies contain metadata and text
  // only, so large payloads are rejected before they consume server resources.
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '256kb' }));
  app.use(cookieParser());

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'healthy',
      platform: PLATFORM_CONFIG.name,
      buildCommit: process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || process.env.COMMIT_SHA || 'local',
      durableStorage: db.hasDurableStorage() ? 'configured' : 'not-configured',
      timestamp: new Date().toISOString()
    });
  });

  // Mount API Router after health so infrastructure checks never trigger a
  // database load and cannot make a healthy server look unavailable.
  app.use('/api', apiRouter);

  // Serve public static folder (favicon, icons, etc.)
  app.use(express.static(path.join(process.cwd(), 'public'), { maxAge: '1d' }));

  // Vite development middleware or production static serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: HOST, port: PORT, strictPort: process.argv.includes('--strictPort'), allowedHosts: ['terminal.local'] },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // Vite asset names are content-hashed and safe to cache permanently. This
    // prevents repeat page loads from downloading the same JS/CSS from Render.
    app.use('/assets', express.static(path.join(distPath, 'assets'), {
      immutable: true,
      maxAge: '1y',
      index: false
    }));
    app.use(express.static(distPath, {
      maxAge: '1h',
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      }
    }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`✨ ${PLATFORM_CONFIG.name} server running on http://0.0.0.0:${PORT}`);
    // Warm the compact archive index while Render performs its normal health
    // checks. Health remains independent and storage failures remain retryable,
    // but the first visitor no longer has to initiate durable-state loading.
    void db.ensureLoaded().catch((error) => {
      console.error('Background archive-index warmup failed; the next API request will retry:', error);
    });
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
