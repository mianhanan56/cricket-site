// The live socket's wire format, and the pure rules for applying it. Kept free
// of the socket itself so ordering and idempotence can be tested offline.

export interface LiveFrame {
  type: string;
  topic: string;
  /** Changes when the Worker's hub restarts; seq numbering starts over with it. */
  epoch: string;
  /** Rises across every topic, so it survives a topic being dropped and re-added. */
  seq: number;
  /** A diff's predecessor on its topic; any other value held means one was missed. */
  prev?: number;
  /** When the hub fetched this from crex. */
  ts: number;
  matchId?: string;
  data?: unknown;
  changed?: Record<string, unknown>;
  removed?: string[];
}

/** apply: newer than anything held. gap: newer, but a diff was missed in between. */
export type FrameVerdict = 'apply' | 'gap' | 'skip';

export type SeqBook = Map<string, { epoch: string; seq: number }>;

export function isLiveFrame(value: unknown): value is LiveFrame {
  if (!value || typeof value !== 'object') return false;
  const f = value as Partial<LiveFrame>;
  return (
    typeof f.type === 'string' &&
    typeof f.topic === 'string' &&
    typeof f.epoch === 'string' &&
    typeof f.seq === 'number' &&
    Number.isFinite(f.seq)
  );
}

/**
 * Decide whether a frame may be applied, and record it if so.
 *
 * Whole-body frames (the list snapshot, every card and feed frame) may repeat
 * the seq already held — re-applying the same body is harmless. A list diff has
 * to be strictly newer, and one whose `prev` isn't the seq held means a diff
 * went missing.
 */
export function acceptFrame(book: SeqBook, frame: LiveFrame): FrameVerdict {
  const whole = frame.type !== 'matches:update';
  const last = book.get(frame.topic);
  let verdict: FrameVerdict = 'apply';

  if (last && last.epoch === frame.epoch) {
    if (whole ? frame.seq < last.seq : frame.seq <= last.seq) return 'skip';
    if (!whole && frame.prev !== last.seq) verdict = 'gap';
  } else if (!whole) {
    // A diff from a hub we hold no snapshot from can't be trusted to be complete.
    verdict = 'gap';
  }

  book.set(frame.topic, { epoch: frame.epoch, seq: frame.seq });
  return verdict;
}

/** The raw /matches/live body after a snapshot or diff frame. */
export function applyMatchesFrame<T>(raw: Record<string, T> | null, frame: LiveFrame): Record<string, T> | null {
  if (frame.type === 'matches:snapshot') {
    return frame.data && typeof frame.data === 'object' ? (frame.data as Record<string, T>) : raw;
  }
  if (frame.type !== 'matches:update' || !raw) return raw;
  const next: Record<string, T> = { ...raw, ...((frame.changed ?? {}) as Record<string, T>) };
  for (const id of frame.removed ?? []) delete next[id];
  return next;
}

/**
 * Feed items from two sources as one list, newest first, capped.
 *
 * Merged by id rather than replaced, so a poll that lands a few seconds behind
 * the socket can't take its newest balls back off the screen, and a frame that
 * arrives twice adds nothing.
 */
export function mergeFeedItems<T extends { id: string }>(prev: T[], next: T[], cap: number): T[] {
  const byId = new Map<string, T>();
  for (const item of prev) byId.set(item.id, item);
  for (const item of next) byId.set(item.id, item);
  const order = (item: T) => {
    const n = Number(item.id);
    return Number.isFinite(n) ? n : Number.MIN_SAFE_INTEGER;
  };
  return [...byId.values()].sort((a, b) => order(b) - order(a)).slice(0, cap);
}
