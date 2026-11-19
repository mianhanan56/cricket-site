'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FeedNote } from '@/types';
import type { BallEntry } from '@/lib/balls';
import { blockItems, blockOf, blockSignature, groupBlocks, noteId } from '@/lib/commentaryRewrite';

const PARALLEL = 2;
const RETRY_MS = 60_000;
const UNFINISHED_MS = 10_000;
// A block the server never settles stops being asked after this many unfinished answers.
const MAX_UNFINISHED = 20;

type Job = { match: string; key: string; inning: number; block: number; sig: string };

/**
 * Rewritten text by `itemKey`, for the blocks holding the `wanted` rows. The first text a key gets
 * is kept, so a line never changes under the reader; a corrected ball has a new key.
 */
export function useCommentaryRewrites(matchId: string, balls: BallEntry[], notes: FeedNote[], wanted: { balls: BallEntry[]; notes: FeedNote[] }) {
  const [texts, setTexts] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [tick, setTick] = useState(0);
  const current = useRef(matchId);
  const asked = useRef(new Map<string, string>());
  const unfinished = useRef(new Map<string, number>());
  const failedAt = useRef(new Map<string, number>());
  const due = useRef(new Set<string>());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const queue = useRef<Job[]>([]);
  const running = useRef(0);

  const blocks = useMemo(() => groupBlocks(balls, notes), [balls, notes]);
  const noteBlock = useMemo(() => {
    const out = new Map<string, string>();
    for (const [key, b] of blocks) for (const n of b.notes) out.set(noteId(n), key);
    return out;
  }, [blocks]);

  useEffect(() => {
    current.current = matchId;
    asked.current.clear();
    unfinished.current.clear();
    failedAt.current.clear();
    due.current.clear();
    queue.current = [];
    setTexts(new Map());
  }, [matchId]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      queue.current = [];
      for (const t of pending) clearTimeout(t);
      pending.clear();
    };
  }, []);

  const pump = useRef<() => void>(() => {});
  useEffect(() => {
    const later = (ms: number, fn: () => void) => {
      const t = setTimeout(() => {
        timers.current.delete(t);
        fn();
      }, ms);
      timers.current.add(t);
    };
    pump.current = () => {
      while (running.current < PARALLEL && queue.current.length) {
        const job = queue.current.shift()!;
        asked.current.set(job.key, job.sig);
        due.current.delete(job.key);
        running.current += 1;
        const qs = new URLSearchParams({ match: job.match, inning: String(job.inning), block: String(job.block), sig: job.sig });
        fetch(`/api/commentary?${qs}`)
          .then(async (res) => {
            // Not configured, not a match that gets rewritten, or a request it refuses: stop asking.
            if (res.status === 404 || res.status === 400) return;
            if (!res.ok) throw new Error(String(res.status));
            const body = (await res.json()) as { texts?: Record<string, string>; done?: boolean; failed?: boolean; closed?: boolean };
            if (job.match !== current.current) return;
            if (body.done === false && !body.closed) {
              // An outage isn't the block's fault: only unfinished answers count toward the cap.
              const n = (unfinished.current.get(job.key) ?? 0) + (body.failed ? 0 : 1);
              unfinished.current.set(job.key, n);
              if (n <= MAX_UNFINISHED) {
                later(body.failed ? RETRY_MS : UNFINISHED_MS, () => {
                  due.current.add(job.key);
                  setTick((t) => t + 1);
                });
              }
            }
            const got = Object.entries(body.texts ?? {});
            if (!got.length) return;
            setTexts((prev) => {
              const merged = new Map(prev);
              for (const [k, text] of got) if (!merged.has(k)) merged.set(k, text);
              return merged;
            });
          })
          .catch(() => {
            if (job.match !== current.current) return;
            failedAt.current.set(job.key, Date.now());
            later(RETRY_MS, () => {
              due.current.add(job.key);
              setTick((t) => t + 1);
            });
          })
          .finally(() => {
            running.current -= 1;
            pump.current();
          });
      }
    };
  }, []);

  useEffect(() => {
    const keys = new Set([
      ...wanted.balls.map((b) => `${b.inning ?? 0}:${blockOf(b.over)}`),
      ...wanted.notes.map((n) => noteBlock.get(noteId(n))),
    ]);
    queue.current = [...keys]
      .flatMap((k) => {
        const b = k ? blocks.get(k) : undefined;
        return b ? [{ key: k!, b }] : [];
      })
      .sort((x, y) => y.b.inning - x.b.inning || y.b.block - x.b.block)
      .map(({ key, b }) => ({ match: matchId, key, inning: b.inning, block: b.block, sig: blockSignature(blockItems(b)) }))
      .filter((job) => {
        const failed = failedAt.current.get(job.key);
        if (failed && Date.now() - failed < RETRY_MS) return false;
        const last = asked.current.get(job.key);
        if (last === job.sig) return due.current.has(job.key);
        // New rows in the block: a fresh question, with a fresh retry allowance.
        if (last !== undefined) unfinished.current.delete(job.key);
        return true;
      });
    pump.current();
  }, [matchId, blocks, noteBlock, wanted, tick]);

  return texts;
}
