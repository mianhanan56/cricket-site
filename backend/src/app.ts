import express, {
  Request,
  Response,
  NextFunction,
} from 'express';
import cors from 'cors';
import helmet from 'helmet';
// import compression from 'compression';
// import morgan from 'morgan';

import matchesRouter from './routes/matches';
import seriesRouter from './routes/series';
import playersRouter from './routes/players';
import fixturesRouter from './routes/fixtures';
import rankingsRouter from './routes/rankings';
import searchRouter from './routes/search';
import usageRouter from './routes/usage';
import adminRouter from './routes/admin';

import {
  rateLimiter,
  strictRateLimiter,
  searchRateLimiter,
} from './middleware/rateLimit';

import { requireAuth } from './middleware/auth';

const app = express();

/**
 * Environment variables
 *
 * These will eventually come from Cloudflare Worker bindings/secrets.
 *
 * For local development, Wrangler can provide them through
 * .dev.vars / environment configuration.
 */
const CLIENT_ORIGIN =
  process.env.CLIENT_ORIGIN || 'http://localhost:3000';

const NODE_ENV =
  process.env.NODE_ENV || 'development';

// -----------------------------------------------------------------------------
// Security middleware
// -----------------------------------------------------------------------------

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],

        scriptSrc: ["'self'"],

        styleSrc: [
          "'self'",
          "'unsafe-inline'",
        ],

        imgSrc: [
          "'self'",
          'data:',
          'https:',
        ],

        connectSrc: [
          "'self'",
          CLIENT_ORIGIN,
        ],

        fontSrc: ["'self'"],

        objectSrc: ["'none'"],

        mediaSrc: ["'self'"],

        frameSrc: ["'none'"],
      },
    },

    crossOriginEmbedderPolicy: false,

    crossOriginOpenerPolicy: {
      policy: 'same-origin',
    },

    crossOriginResourcePolicy: {
      policy: 'same-origin',
    },

    dnsPrefetchControl: {
      allow: false,
    },

    frameguard: {
      action: 'deny',
    },

    hidePoweredBy: true,

    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },

    ieNoOpen: true,

    noSniff: true,

    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin',
    },

    xssFilter: true,
  })
);

// -----------------------------------------------------------------------------
// CORS
// -----------------------------------------------------------------------------

app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  })
);

// -----------------------------------------------------------------------------
// Body parsing
// -----------------------------------------------------------------------------

// app.use(
//   express.json({
//     limit: '100kb',
//   })
// );

// app.use(
//   express.urlencoded({
//     extended: true,
//     limit: '100kb',
//   })
// );

// -----------------------------------------------------------------------------
// Compression + logging
// -----------------------------------------------------------------------------
//
// These may be removed later if Workers compatibility causes issues.
// Cloudflare can handle compression at the edge.
//
// -----------------------------------------------------------------------------

// app.use(compression());

// app.use(
//   morgan(
//     NODE_ENV === 'production'
//       ? 'combined'
//       : 'dev'
//   )
// );

// -----------------------------------------------------------------------------
// Global API rate limiting
// -----------------------------------------------------------------------------

app.use(
  '/api/',
  rateLimiter
);

// -----------------------------------------------------------------------------
// Root endpoint
// -----------------------------------------------------------------------------

app.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Cricket API running',
  });
});

// -----------------------------------------------------------------------------
// Health checks
// -----------------------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'healthy',
  });
});

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'healthy',
  });
});

// -----------------------------------------------------------------------------
// API routes
// -----------------------------------------------------------------------------

app.use(
  '/api/matches',
  matchesRouter
);

app.use(
  '/api/series',
  seriesRouter
);

app.use(
  '/api/players',
  playersRouter
);

app.use(
  '/api/fixtures',
  fixturesRouter
);

app.use(
  '/api/rankings',
  rankingsRouter
);

app.use(
  '/api/search',
  searchRateLimiter,
  searchRouter
);

app.use(
  '/api/usage',
  strictRateLimiter,
  usageRouter
);

app.use(
  '/api/admin',
  strictRateLimiter,
  requireAuth,
  adminRouter
);

// -----------------------------------------------------------------------------
// 404 handler
// -----------------------------------------------------------------------------

app.use(
  (_req, res) => {
    res.status(404).json({
      success: false,
      data: null,
      error: 'Not found',
    });
  }
);

// -----------------------------------------------------------------------------
// Global error handler
// -----------------------------------------------------------------------------

app.use(
  (
    err: Error,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    console.error(
      '[error]',
      err.message
    );

    res.status(500).json({
      success: false,
      data: null,
      error: 'Internal server error',
    });
  }
);

export default app;

export { app };
