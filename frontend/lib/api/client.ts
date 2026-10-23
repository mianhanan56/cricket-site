// Transport to the Cloudflare Worker that fronts the upstream (see /worker).
import { withTimeout } from '../timeout';

// Falls back to the deployed Worker, not '': with no other data source an unset
// var would mean no matches at all. Point it at `wrangler dev` to work locally.
const DEFAULT_WORKER_URL = 'https://pulsecrease-api.pulse-cricket.workers.dev';

export const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL ?? DEFAULT_WORKER_URL;

export interface FetchOpts {
  /** Next.js revalidate window, in seconds. Ignored in the browser. */
  revalidate?: number;
  signal?: AbortSignal;
}

// The upstream's live list has been seen to hang rather than fail; without a ceiling a
// server render waits on it indefinitely and a client poll never retries.
const API_TIMEOUT_MS = 15_000;

export async function apiGet<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const res = await fetch(`${WORKER_URL.replace(/\/$/, '')}${path}`, {
    headers: { Accept: 'application/json' },
    signal: withTimeout(API_TIMEOUT_MS, opts.signal),
    next: opts.revalidate !== undefined ? { revalidate: opts.revalidate } : undefined,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    // The Worker reports the upstream's own status inside its 502 body.
    let upstreamStatus: number | undefined;
    try {
      const parsed = JSON.parse(detail) as { status?: unknown };
      if (typeof parsed.status === 'number') upstreamStatus = parsed.status;
    } catch {
      // Not JSON — no upstream status to read.
    }
    throw Object.assign(new Error(`api ${path} failed: ${res.status} ${detail.slice(0, 200)}`), {
      status: res.status,
      upstreamStatus,
    });
  }

  return (await res.json()) as T;
}

/**
 * The request was refused (bad params, or the upstream answered 4xx), so the thing asked
 * for doesn't exist. A timeout, 5xx or 429 is an outage and must not read as a 404.
 */
export function isRejectedRequest(err: unknown): boolean {
  const { status, upstreamStatus } = (err ?? {}) as { status?: number; upstreamStatus?: number };
  if (status === 400 || status === 404) return true;
  return status === 502 && upstreamStatus !== undefined && upstreamStatus >= 400 && upstreamStatus < 500 && upstreamStatus !== 429;
}

/** Map with at most `width` calls in flight: all at once floods the Worker, one at a time is a round trip each. */
export async function inWidth<T, R>(items: T[], width: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, worker));
  return out;
}
