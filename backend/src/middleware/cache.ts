import { Request, Response, NextFunction } from 'express';
import { redis } from '../lib/redis';

/**
 * Redis cache middleware for GET endpoints.
 *
 * Default TTL is 60s; pass `10` for live match data per project rules.
 * Degrades to a no-op if Redis is unavailable.
 */
export function cache(ttlSeconds = 60) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' || !redis) return next();

    const key = `cache:${req.originalUrl}`;

    try {
      const hit = await redis.get(key);
      if (hit) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('Content-Type', 'application/json');
        return res.send(hit);
      }
    } catch {
      // Cache read failed — fall through to handler.
      return next();
    }

    res.setHeader('X-Cache', 'MISS');

    // Intercept res.json to store the payload before sending.
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      // Only cache successful responses.
      if (res.statusCode >= 200 && res.statusCode < 300) {
        redis
          ?.set(key, JSON.stringify(body), 'EX', ttlSeconds)
          .catch(() => undefined);
      }
      return originalJson(body);
    };

    next();
  };
}
