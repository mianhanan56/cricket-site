'use client';

import { useEffect, useState } from 'react';
import type { MatchQuiz } from '@/types';

/** The match's quiz, read once; null until it arrives, and for good if there is none. */
export function useMatchQuiz(matchId: string, enabled: boolean): MatchQuiz | null {
  const [quiz, setQuiz] = useState<MatchQuiz | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch(`/api/quiz?match=${encodeURIComponent(matchId)}`, { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<MatchQuiz>) : null))
      .then((next) => next?.questions?.length && setQuiz(next))
      .catch(() => {});
    return () => controller.abort();
  }, [matchId, enabled]);

  return quiz;
}
