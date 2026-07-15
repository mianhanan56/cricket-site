import { config as loadEnv } from 'dotenv';
import path from 'path';
// Single source of truth: the repo-root .env, loaded regardless of cwd.
loadEnv({ path: path.resolve(__dirname, '../../.env') });

import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';

import matchesRouter from './routes/matches';
import seriesRouter from './routes/series';
import playersRouter from './routes/players';
import fixturesRouter from './routes/fixtures';
import rankingsRouter from './routes/rankings';
import searchRouter from './routes/search';
import usageRouter from './routes/usage';
import adminRouter from './routes/admin';

import { initSocket } from './socket';
import { startSyncJob } from './jobs/syncData';

const PORT = parseInt(process.env.PORT || '5000', 10);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';

const app = express();

// --- Global middleware ------------------------------------------------------
app.use(helmet());
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(compression());
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// --- Root + health check ----------------------------------------------------
app.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'Cricket API running' });
});
app.get('/api/health', (_req, res) => res.status(200).json({ status: 'healthy' }));
app.get('/health', (_req, res) => res.status(200).json({ status: 'healthy', uptime: process.uptime() }));

// --- API routes -------------------------------------------------------------
app.use('/api/matches', matchesRouter);
app.use('/api/series', seriesRouter);
app.use('/api/players', playersRouter);
app.use('/api/fixtures', fixturesRouter);
app.use('/api/rankings', rankingsRouter);
app.use('/api/search', searchRouter);
app.use('/api/usage', usageRouter);
app.use('/api/admin', adminRouter);

// --- 404 + error handlers ---------------------------------------------------
app.use((_req, res) => {
  res.status(404).json({ success: false, data: null, error: 'Not found' });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[error]', err.message);
  res.status(500).json({ success: false, data: null, error: 'Internal server error' });
});

// --- Boot HTTP + Socket.io --------------------------------------------------
// Socket.io binds to the HTTP server (not the Express app directly) so REST
// and WebSocket share the same port.
const httpServer = createServer(app);

async function main() {
  try {
    initSocket(httpServer, CLIENT_ORIGIN, PORT);
    startSyncJob();

    // Bind to 0.0.0.0 so Railway (and other container hosts) can route to the
    // service; PORT is injected by the platform at runtime.
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Startup error:', error);
    process.exit(1);
  }
}

main();

export { app };
