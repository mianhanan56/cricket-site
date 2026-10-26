import { NextResponse, type NextRequest } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getApiMatch, getApiScorecard } from '@/lib/api';
import { geminiConfigured, geminiJson } from '@/lib/gemini';
import { QUIZ_SCHEMA, QUIZ_SYSTEM, checkQuiz, matchSheet, quizPrompt, quizzable, toQuiz } from '@/lib/quiz';

export const maxDuration = 60;

// A finished card never changes, so each match costs one model call. A failed generation
// throws, and unstable_cache keeps nothing — the next reader tries again.
const QUIZ_TTL = 60 * 60 * 24 * 30;

const quizFor = unstable_cache(
  async (id: string) => {
    const match = await getApiMatch(id, { revalidate: 300 });
    if (!match) throw new Error('match not found');
    const innings = await getApiScorecard(id, { status: match.status, ballsPerOver: match.ballsPerOver, revalidate: 300 });
    if (!quizzable(match, innings)) throw new Error('match not quizzable');
    const sheet = matchSheet(match, innings);
    const raw = await geminiJson({ system: QUIZ_SYSTEM, prompt: quizPrompt(sheet), schema: QUIZ_SCHEMA });
    return toQuiz(id, checkQuiz(raw, sheet));
  },
  ['match-quiz-v1'],
  { revalidate: QUIZ_TTL }
);

const nothing = (status: number) =>
  new NextResponse(null, { status, headers: { 'cache-control': 'no-store' } });

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('match') ?? '';
  if (!/^[A-Za-z0-9]{1,16}$/.test(id)) return nothing(400);
  if (!geminiConfigured()) return nothing(404);

  // Checked outside the cache so a live match never stores a miss for a month.
  const match = await getApiMatch(id, { revalidate: 60 }).catch(() => null);
  if (!match || match.status !== 'COMPLETED' || !match.result) return nothing(404);

  try {
    return NextResponse.json(await quizFor(id), {
      headers: { 'cache-control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
    });
  } catch (err) {
    console.warn('quiz', id, err instanceof Error ? err.message : err);
    return nothing(503);
  }
}
