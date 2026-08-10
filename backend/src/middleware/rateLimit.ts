import { Request, Response, NextFunction } from 'express';
import { redis } from '../lib/redis';

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 100;

const mem = new Map<string, { count: number; resetAt: number }>();

function getKey(req: Request): string {
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  return `ratelimit:${ip}`;
}

export function rateLimit(maxRequests = MAX_REQUESTS, windowMs = WINDOW_MS) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = getKey(req);
    const now = Date.now();

    if (redis) {
      try {
        const redisKey = `rl:${key}`;
        const current = await redis.incr(redisKey);
        if (current === 1) {
          await redis.pexpire(redisKey, windowMs);
        }
        res.setHeader('X-RateLimit-Limit', maxRequests);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - current));
        res.setHeader('X-RateLimit-Reset', Math.ceil((now + windowMs) / 1000));
        if (current > maxRequests) {
          return res.status(429).json({ success: false, data: null, error: 'Too many requests' });
        }
        return next();
      } catch {
      }
    }

    const entry = mem.get(key);
    if (!entry || now > entry.resetAt) {
      mem.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', maxRequests - 1);
      res.setHeader('X-RateLimit-Reset', Math.ceil((now + windowMs) / 1000));
      return next();
    }

    entry.count++;
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

    if (entry.count > maxRequests) {
      return res.status(429).json({ success: false, data: null, error: 'Too many requests' });
    }
    next();
  };
}

export const rateLimiter = rateLimit(100, 60_000);
export const strictRateLimiter = rateLimit(10, 60_000);
export const searchRateLimiter = rateLimit(30, 60_000);