// Transport to the Cloudflare Worker that fronts the upstream (see /worker).
import { cache } from 'react';
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

// React and Next share a render's identical fetches but skip any that carry a signal, and
// every read here carries the timeout, so the render's reads are shared here instead.
// Outside a server render `cache` hands back a fresh map each call, so nothing is shared;
// the stable React the tests run on has no `cache` at all.
const newReads = () => new Map<string, Promise<string>>();
const renderReads = typeof cache === 'function' ? cache(newReads) : newReads;

export async function apiGet<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  // A caller's own signal can abort its read, so only reads without one are shared.
  if (opts.signal) return JSON.parse(await readText(path, opts)) as T;

  const reads = renderReads();
  const key = `${opts.revalidate}|${path}`;
  let read = reads.get(key);
  if (!read) {
    read = readText(path, opts);
    reads.set(key, read);
  }
  // Parsed per caller, so no two callers hold the same object.
  return JSON.parse(await read) as T;
}

async function readText(path: string, opts: FetchOpts): Promise<string> {
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

  return res.text();
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
