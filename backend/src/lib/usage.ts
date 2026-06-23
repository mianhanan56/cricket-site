import { redis } from './redis';

// Free CricketData.org plan = 100 calls/day. We stop syncing well before that.
export const QUOTA_LIMIT = 100;
export const QUOTA_SKIP_AT = 90;

// Redis is the source of truth when available; otherwise an in-memory counter
// keeps the guard working in local dev without Redis.
const mem = new Map<string, number>();

/** Redis key for today's call count (UTC day). */
function todayKey(): string {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  return `cricapi:calls:${day}`;
}

/** Increment today's counter and return the new total. Expires after 24h. */
export async function incrementApiCall(): Promise<number> {
  const key = todayKey();
  if (redis) {
    try {
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, 24 * 60 * 60);
      return n;
    } catch {
      /* fall through to in-memory */
    }
  }
  const n = (mem.get(key) ?? 0) + 1;
  mem.set(key, n);
  return n;
}

/** Read today's call count (0 if none). */
export async function getApiCalls(): Promise<number> {
  const key = todayKey();
  if (redis) {
    try {
      const v = await redis.get(key);
      return v ? Number(v) : 0;
    } catch {
      /* fall through */
    }
  }
  return mem.get(key) ?? 0;
}

/** True when we should stop calling the upstream API for the day. */
export async function quotaNearlyExhausted(): Promise<boolean> {
  return (await getApiCalls()) >= QUOTA_SKIP_AT;
}

/** ISO timestamp of the next UTC midnight (when the daily quota resets). */
export function resetAtUTC(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0)
  ).toISOString();
}
