import { NextResponse, type NextRequest } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getApiInningsFeed, getApiMatch } from '@/lib/api';
import { geminiConfigured, geminiJson } from '@/lib/gemini';
import { createBudget } from '@/lib/quizGuard';
import { dedupeDeliveries } from '@/lib/balls';
import {
  PRE_BLOCK,
  REWRITE_SCHEMA,
  REWRITE_SYSTEM,
  blockItems,
  blockSignature,
  checkRewrites,
  groupBlocks,
  itemKey,
  rewritePrompt,
  type RewriteItem,
} from '@/lib/commentaryRewrite';

export const maxDuration = 60;

const TTL = 60 * 60 * 24 * 365;
// Only matches a reader is following get new rewrites; older ones keep what is stored.
const RECENT_MS = 14 * 24 * 60 * 60_000;
const MAX_ITEMS = 40;
// An item the model won't answer in this many calls, spaced apart, is given up on for the day.
const MAX_TRIES = 2;
const TRY_GAP_MS = 2 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
// Calls one instance may start in an hour: a live ball is one call, an older block one more.
const budget = createBudget(200, 60 * 60_000);
const HOLD_MS = 60_000;
let heldUntil = 0;

// One shared entry per item and wording, so a line never changes once written. A read returns only
// what a write put there: the function throws unless `writing` holds the value (quiz route's memo).
const writing = new Map<string, string>();
const stored = unstable_cache(
  async (match: string, key: string): Promise<string> => {
    const text = writing.get(`${match}:${key}`);
    if (text === undefined) throw new Error('not rewritten');
    return text;
  },
  ['commentary-rewrite-v2'],
  { revalidate: TTL }
);

// Items given up on, keyed by day so a bad hour of the model is retried tomorrow.
const givingUp = new Set<string>();
const gaveUp = unstable_cache(
  async (match: string, key: string, day: number): Promise<true> => {
    if (!givingUp.has(`${match}:${key}:${day}`)) throw new Error('not given up');
    return true;
  },
  ['commentary-gave-up-v1'],
  { revalidate: DAY_MS / 1000 }
);
const today = () => Math.floor(Date.now() / DAY_MS);

const local = new Map<string, string>();
const remember = (key: string, text: string) => {
  if (local.size > 50_000) local.clear();
  local.set(key, text);
};

/** The stored rewrite, "" for an item given up on today, null for one not tried. */
async function read(match: string, key: string): Promise<string | null> {
  const hit = local.get(`${match}:${key}`);
  if (hit !== undefined) return hit;
  const text = await stored(match, key).catch(() => null);
  if (text !== null) {
    remember(`${match}:${key}`, text);
    return text;
  }
  return (await gaveUp(match, key, today()).catch(() => false)) ? '' : null;
}

async function giveUp(match: string, key: string): Promise<void> {
  const k = `${match}:${key}:${today()}`;
  givingUp.add(k);
  await gaveUp(match, key, today())
    .catch(() => undefined)
    .finally(() => givingUp.delete(k));
}

/** Stores a rewrite and returns what the store holds — another instance's, if it wrote first. */
async function write(match: string, key: string, text: string): Promise<string> {
  const k = `${match}:${key}`;
  writing.set(k, text);
  const kept = await stored(match, key)
    .catch(() => text)
    .finally(() => writing.delete(k));
  remember(k, kept);
  return kept;
}

const tries = new Map<string, { n: number; at: number }>();

const inFlight = new Map<string, Promise<Map<string, string>>>();

/** Rewrites by item key; an item given up on comes back as "". */
function rewrite(match: string, items: RewriteItem[]): Promise<Map<string, string>> {
  const flightKey = `${match}:${items.map(itemKey).join(',')}`;
  let pending = inFlight.get(flightKey);
  if (!pending) {
    pending = (async () => {
      const now = Date.now();
      if (now < heldUntil) throw new Error('rewrites held');
      if (!budget.spend(now)) {
        heldUntil = now + HOLD_MS;
        throw new Error('rewrite budget spent');
      }
      const raw = await geminiJson({ system: REWRITE_SYSTEM, prompt: rewritePrompt(items), schema: REWRITE_SCHEMA, lite: true }).catch(
        (err: unknown) => {
          heldUntil = Date.now() + HOLD_MS;
          throw err;
        }
      );
      const answers = checkRewrites(raw, items);
      const out = new Map<string, string>();
      await Promise.all(
        items.map(async (item) => {
          const key = itemKey(item);
          const text = answers.get(item.id);
          const tryKey = `${match}:${key}`;
          if (text === undefined) {
            const last = tries.get(tryKey);
            const n = !last ? 1 : Date.now() - last.at >= TRY_GAP_MS ? last.n + 1 : last.n;
            if (tries.size > 10_000) tries.clear();
            if (n !== last?.n) tries.set(tryKey, { n, at: Date.now() });
            if (n < MAX_TRIES) return;
            tries.delete(tryKey);
            await giveUp(match, key);
            out.set(key, '');
            return;
          }
          tries.delete(tryKey);
          out.set(key, await write(match, key, text));
        })
      );
      return out;
    })().finally(() => inFlight.delete(flightKey));
    inFlight.set(flightKey, pending);
  }
  return pending;
}

const nothing = (status: number) => new NextResponse(null, { status, headers: { 'cache-control': 'no-store' } });

const int = (v: string | null, min: number, max: number): number | null => {
  if (!v || !/^-?\d{1,4}$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? n : null;
};

type Outcome = 'done' | 'unfinished' | 'failed' | 'closed';
// 'closed': nothing more will be written for now — too old a match, or items given up on today.

const CACHE: Record<Outcome, string> = {
  done: 'public, s-maxage=86400, stale-while-revalidate=604800',
  unfinished: 'public, s-maxage=5',
  failed: 'no-store',
  closed: 'public, s-maxage=3600',
};

const answer = (texts: Record<string, string>, outcome: Outcome) =>
  NextResponse.json(
    { texts, done: outcome === 'done', ...(outcome === 'failed' || outcome === 'closed' ? { [outcome]: true } : null) },
    { headers: { 'cache-control': CACHE[outcome] } }
  );

/**
 * `GET /api/commentary?match&inning&block&sig` → `{ texts: { [itemKey]: text }, done }`. `sig` is the
 * page's `blockSignature`; the answer is final only once the server's block matches it.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const id = q.get('match') ?? '';
  const inning = int(q.get('inning'), 0, 3);
  const block = int(q.get('block'), PRE_BLOCK, 200);
  const sig = q.get('sig') ?? '';
  if (!/^[A-Za-z0-9]{1,16}$/.test(id) || inning === null || block === null || !/^[0-9a-z]{1,8}$/.test(sig)) return nothing(400);
  if (!geminiConfigured()) return nothing(404);

  const feed = await getApiInningsFeed(id, inning).catch(() => null);
  if (!feed) return nothing(502);
  // Deduped as the page does, so both sides' blocks hold the same balls.
  const found = groupBlocks(dedupeDeliveries(feed.balls), feed.notes).get(`${inning}:${block}`);
  // The page saw rows the server's feed doesn't hold yet: ask again shortly.
  if (!found) return answer({}, 'unfinished');

  const items = blockItems(found);
  const texts: Record<string, string> = {};
  const settled = new Set<string>();
  const keys = items.map(itemKey);
  const reads = await Promise.all(keys.map((k) => read(id, k)));
  let gaveUpOn = false;
  const now = Date.now();
  // An item the model skipped waits out the gap rather than go back on every poll.
  const waiting = (i: number) => {
    const t = tries.get(`${id}:${keys[i]}`);
    return t !== undefined && now - t.at < TRY_GAP_MS;
  };
  const misses = items.filter((_, i) => {
    const text = reads[i];
    if (text === null) return !waiting(i);
    settled.add(keys[i]);
    if (text) texts[keys[i]] = text;
    else gaveUpOn = true;
    return false;
  });

  // Stored rewrites are always served; only new model calls need a recent match. Status alone
  // won't do: the upstream can leave an old match "live" for good.
  let open = false;
  if (misses.length) {
    let match;
    try {
      match = await getApiMatch(id, { revalidate: 300 });
    } catch (err) {
      console.warn('commentary rewrite', id, 'match lookup', err instanceof Error ? err.message : err);
      return answer(texts, 'failed');
    }
    // The feed above found this match, so not finding it here is a lookup blip, not an unknown id.
    if (!match) return answer(texts, 'failed');
    open = now - Date.parse(match.startTime) < RECENT_MS;
  }

  let failed = false;
  if (misses.length && open) {
    try {
      for (const [k, v] of await rewrite(id, misses.slice(0, MAX_ITEMS))) {
        settled.add(k);
        if (v) texts[k] = v;
        else gaveUpOn = true;
      }
    } catch (err) {
      failed = true;
      console.warn('commentary rewrite', id, inning, block, err instanceof Error ? err.message : err);
    }
  }

  if (misses.length && !open) return answer(texts, 'closed');
  if (failed) return answer(texts, 'failed');
  if (settled.size < items.length || blockSignature(items) !== sig) return answer(texts, 'unfinished');
  // A give-up lasts a day; don't let the CDN hold it for longer.
  return answer(texts, gaveUpOn ? 'closed' : 'done');
}
