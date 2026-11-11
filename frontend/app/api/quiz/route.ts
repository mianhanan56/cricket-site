import { NextResponse, type NextRequest } from 'next/server';
import { unstable_cache } from 'next/cache';
import type { Match, MatchQuiz } from '@/types';
import { getApiFixtureRange, getApiMatch, getApiScorecard } from '@/lib/api';
import { geminiConfigured, geminiJson } from '@/lib/gemini';
import { quizKind } from '@/lib/quiz';
import { createBudget, retryWindow } from '@/lib/quizGuard';
import { QUIZ_SCHEMA, QUIZ_SYSTEM, checkQuiz, lastMatches, matchSheet, quizCast, quizPrompt, quizzable, toQuiz, warmupQuiz } from '@/lib/quizGen';

export const maxDuration = 60;

// A finished card never changes, so each match costs one model call — whether its quiz is
// asked on its own page or as another fixture's warm-up. A failed generation throws, and
// unstable_cache keeps nothing — the next reader tries again.
const QUIZ_TTL = 60 * 60 * 24 * 30;

// Generations one instance may start in an hour. A day's results need a handful; the hard
// ceiling is the quota on the key itself.
const budget = createBudget(40, 60 * 60_000);

/** No model call was made: the match failed earlier this window, or the budget is spent. */
class QuizHeld extends Error {}

const cachedQuiz = unstable_cache(
  async (id: string): Promise<MatchQuiz> => {
    if (!budget.spend(Date.now())) throw new QuizHeld('generation budget spent');
    const match = await getApiMatch(id, { revalidate: 300 });
    if (!match) throw new Error('match not found');
    const innings = await getApiScorecard(id, { status: match.status, ballsPerOver: match.ballsPerOver, revalidate: 300 });
    if (!quizzable(match, innings)) throw new Error('match not quizzable');
    const sheet = matchSheet(match, innings);
    const raw = await geminiJson({ system: QUIZ_SYSTEM, prompt: quizPrompt(sheet), schema: QUIZ_SCHEMA });
    return toQuiz(match, checkQuiz(raw, sheet, quizCast(match, innings)));
  },
  // v4: quizzes carry their match label. v3: options fitted to the question (2–4).
  ['match-quiz-v4'],
  { revalidate: QUIZ_TTL }
);

// A failure is remembered for the rest of its window, shared by every instance, so a match that
// can't be quizzed costs one attempt a window, not one a request. unstable_cache keeps nothing
// when its function throws, so a read never writes: it only returns while a failure is recorded.
const recording = new Set<string>();
const failure = unstable_cache(
  async (id: string, window: number): Promise<true> => {
    if (!recording.has(`${id}:${window}`)) throw new Error('no failure held');
    return true;
  },
  ['match-quiz-failed-v1'],
  { revalidate: QUIZ_TTL }
);

const failedThisWindow = (id: string, window: number): Promise<boolean> => failure(id, window).catch(() => false);

async function holdFailure(id: string, window: number): Promise<void> {
  const key = `${id}:${window}`;
  recording.add(key);
  await failure(id, window)
    .catch(() => undefined)
    .finally(() => recording.delete(key));
}

const warn = (id: string, err: unknown) => console.warn('quiz', id, err instanceof Error ? err.message : err);

async function generate(id: string): Promise<MatchQuiz> {
  const window = retryWindow(Date.now());
  if (await failedThisWindow(id, window)) throw new QuizHeld('failed earlier this window');
  try {
    return await cachedQuiz(id);
  } catch (err) {
    if (err instanceof QuizHeld) throw err;
    warn(id, err);
    await holdFailure(id, window);
    throw new QuizHeld('generation failed');
  }
}

// unstable_cache doesn't merge concurrent misses: when a result lands, every open page asks at
// once. One generation per match per instance.
const inFlight = new Map<string, Promise<MatchQuiz>>();
function quizFor(id: string): Promise<MatchQuiz> {
  let pending = inFlight.get(id);
  if (!pending) {
    pending = generate(id).finally(() => inFlight.delete(id));
    inFlight.set(id, pending);
  }
  return pending;
}

async function warmupFor(match: Match): Promise<MatchQuiz | null> {
  // Only finished games before this one count, so the corpus's forward pages are never needed.
  const sources = lastMatches(match, await getApiFixtureRange({ forward: 0 }));
  const quizzes = await Promise.all(sources.map((s) => quizFor(s.matchKey).catch(() => null)));
  const found = quizzes.filter((q): q is MatchQuiz => Boolean(q));
  return found.length ? warmupQuiz(match.id, found) : null;
}

const nothing = (status: number) =>
  new NextResponse(null, { status, headers: { 'cache-control': 'no-store' } });

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('match') ?? '';
  if (!/^[A-Za-z0-9]{1,16}$/.test(id)) return nothing(400);
  if (!geminiConfigured()) return nothing(404);

  // Decided outside the cache so a match that isn't ready never stores a miss for a month.
  const match = await getApiMatch(id, { revalidate: 60 }).catch(() => null);
  const kind = match ? quizKind(match, Date.now()) : null;
  if (!match || !kind) return nothing(404);

  try {
    const quiz = kind === 'result' ? await quizFor(id) : await warmupFor(match);
    if (!quiz) return nothing(404);
    // A warm-up gives way to the match's own quiz at the result, so it is only held briefly.
    const maxAge = kind === 'result' ? 'public, s-maxage=86400, stale-while-revalidate=604800' : 'public, s-maxage=300';
    return NextResponse.json(quiz, { headers: { 'cache-control': maxAge } });
  } catch (err) {
    if (!(err instanceof QuizHeld)) warn(id, err);
    return nothing(503);
  }
}
