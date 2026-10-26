import { createPersisted, isRecord } from './persisted';

export interface QuizAttempt {
  /** The quiz generation these picks belong to (`MatchQuiz.generatedAt`). */
  version: string;
  /** Option picked per question, in question order. */
  picks: number[];
}

export const quizAnswersStore = createPersisted<Record<string, QuizAttempt>>('pc.quiz', {}, (raw) => {
  if (!isRecord(raw)) return null;
  const out: Record<string, QuizAttempt> = {};
  for (const [matchId, v] of Object.entries(raw)) {
    if (!isRecord(v) || typeof v.version !== 'string' || !Array.isArray(v.picks)) continue;
    if (!v.picks.every((p) => Number.isInteger(p))) continue;
    out[matchId] = { version: v.version, picks: v.picks as number[] };
  }
  return out;
});
