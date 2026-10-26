import { NextResponse, type NextRequest } from 'next/server';
import { unstable_cache } from 'next/cache';
import type { Match, MatchQuiz } from '@/types';
import { getApiFixtureRange, getApiMatch, getApiScorecard } from '@/lib/api';
import { geminiConfigured, geminiJson } from '@/lib/gemini';
import {
  QUIZ_SCHEMA,
  QUIZ_SYSTEM,
  checkQuiz,
  lastMatches,
  matchSheet,
  quizCast,
  quizKind,
  quizPrompt,
  quizzable,
  toQuiz,
  warmupQuiz,
} from '@/lib/quiz';

export const maxDuration = 60;

// A finished card never changes, so each match costs one model call — whether its quiz is
// asked on its own page or as another fixture's warm-up. A failed generation throws, and
// unstable_cache keeps nothing — the next reader tries again.
const QUIZ_TTL = 60 * 60 * 24 * 30;

const quizFor = unstable_cache(
  async (id: string) => {
    const match = await getApiMatch(id, { revalidate: 300 });
    if (!match) throw new Error('match not found');
    const innings = await getApiScorecard(id, { status: match.status, ballsPerOver: match.ballsPerOver, revalidate: 300 });
    if (!quizzable(match, innings)) throw new Error('match not quizzable');
    const sheet = matchSheet(match, innings);
    const raw = await geminiJson({ system: QUIZ_SYSTEM, prompt: quizPrompt(sheet), schema: QUIZ_SCHEMA });
    return toQuiz(id, checkQuiz(raw, sheet, quizCast(match, innings)));
  },
  // v3: options fitted to the question (2–4) — earlier quizzes could offer grounds as teams.
  ['match-quiz-v3'],
  { revalidate: QUIZ_TTL }
);

async function warmupFor(match: Match): Promise<MatchQuiz | null> {
  const corpus = await getApiFixtureRange();
  const sources = lastMatches(match, corpus);
  const settled = await Promise.allSettled(sources.map((s) => quizFor(s.matchKey as string)));
  const parts = sources.flatMap((source, i) => {
    const r = settled[i];
    if (r.status === 'rejected') console.warn('quiz', source.matchKey, r.reason instanceof Error ? r.reason.message : r.reason);
    return r.status === 'fulfilled' ? [{ source, quiz: r.value }] : [];
  });
  return parts.length ? warmupQuiz(match, parts) : null;
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
    console.warn('quiz', id, err instanceof Error ? err.message : err);
    return nothing(503);
  }
}
