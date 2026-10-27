import type { Match, QuizKind } from '@/types';

/** How long before the start the warm-up quiz opens. */
const WARMUP_WINDOW_MS = 6 * 60 * 60 * 1000;

/**
 * Which quiz a match offers now: its own once the result is in; a warm-up from six hours
 * before the start until then, live play included; none earlier. Shared by the page and
 * the route — generation itself lives server-side in `quizGen`.
 */
export function quizKind(match: Match, now: number): QuizKind | null {
  if (match.status === 'COMPLETED' && match.result) return 'result';
  if (match.status === 'LIVE' || match.status === 'COMPLETED') return 'warmup';
  if (match.status === 'UPCOMING' && +new Date(match.startTime) - now <= WARMUP_WINDOW_MS) return 'warmup';
  return null;
}
