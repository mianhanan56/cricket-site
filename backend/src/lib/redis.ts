import Redis from 'ioredis';

// Lazy-connecting Redis client. Caching is OPTIONAL — if REDIS_URL is absent or
// the server is unreachable, the app still runs and the cache middleware just
// degrades to a no-op (see middleware/cache.ts). We never spam logs or retry
// forever against a dead server.
const redisUrl = process.env.REDIS_URL;

let warned = false;

export const redis: Redis | null = redisUrl
  ? new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      // Give up reconnecting after a few tries so a missing Redis doesn't loop.
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
    })
  : null;

if (redis) {
  redis.on('error', (err) => {
    // Log the first failure only, then stay silent — cache is best-effort.
    if (!warned) {
      console.warn(`[redis] unavailable (${err.message}) — caching disabled`);
      warned = true;
    }
  });
  redis.on('connect', () => {
    warned = false;
    console.log('[redis] connected');
  });
} else {
  console.warn('[redis] REDIS_URL not set — caching disabled');
}
