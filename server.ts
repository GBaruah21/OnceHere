import './server/environment';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './server/api';
import { PLATFORM_CONFIG } from './src/config/platform';

const portFlag = process.argv.indexOf('--port');
const PORT = Number(portFlag >= 0 ? process.argv[portFlag + 1] : process.env.PORT || 3000);
const hostFlag = process.argv.indexOf('--host');
const HOST = hostFlag >= 0 ? process.argv[hostFlag + 1] : '0.0.0.0';

async function startServer() {
  const app = express();

  app.use(express.json({ limit: '40mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));
  app.use(cookieParser());

  // Mount API Router
  app.use('/api', apiRouter);

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'healthy',
      platform: PLATFORM_CONFIG.name,
      timestamp: new Date().toISOString()
    });
  });

  // Serve public static folder (favicon, icons, etc.)
  app.use(express.static(path.join(process.cwd(), 'public')));

  // Vite development middleware or production static serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: HOST, port: PORT, strictPort: process.argv.includes('--strictPort'), allowedHosts: ['terminal.local'] },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`✨ ${PLATFORM_CONFIG.name} server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
