'use client';

import { useEffect, useState } from 'react';
import type { MatchQuiz, QuizKind } from '@/types';

/**
 * The match's quiz of `kind`, read once per kind; null until one arrives. The warm-up stays
 * up while the result quiz is generated, so the tab doesn't blink out at the finish.
 */
export function useMatchQuiz(matchId: string, kind: QuizKind | null): MatchQuiz | null {
  const [quiz, setQuiz] = useState<MatchQuiz | null>(null);

  useEffect(() => {
    if (!kind) return;
    const controller = new AbortController();
    fetch(`/api/quiz?match=${encodeURIComponent(matchId)}`, { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<MatchQuiz>) : null))
      .then((next) => next?.questions?.length && setQuiz(next))
      .catch(() => {});
    return () => controller.abort();
  }, [matchId, kind]);

  return quiz;
}
