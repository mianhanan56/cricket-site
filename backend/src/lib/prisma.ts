import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { Pool, neonConfig } from '@neondatabase/serverless';

// The Workers runtime has no TCP sockets, so Prisma reaches Neon through a
// driver adapter. Two constraints shape the setup below:
//
//  1. `poolQueryViaFetch` sends each `pool.query()` over HTTP instead of a
//     WebSocket. Without it a socket opened during one request is reused by
//     the next, which Workers rejects ("Cannot perform I/O on behalf of a
//     different request") — fatal for a module-level client like this one.
//  2. We keep the pg-compatible `PrismaNeon` adapter rather than
//     `PrismaNeonHTTP`: the HTTP adapter skips Prisma's column type parsers,
//     so timestamps come back as objects and every query fails with P2023.
//
// Trade-off: interactive transactions need a real socket. This app uses none.
neonConfig.poolQueryViaFetch = true;

// Single shared Prisma instance across the app (avoids exhausting connections
// during hot reloads).
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const pool = new Pool({ connectionString });
  return new PrismaClient({
    adapter: new PrismaNeon(pool),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma = global.__prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}
