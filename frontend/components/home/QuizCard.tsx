'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import type { Match } from '@/types';
import { useMatchQuiz } from '@/hooks/useMatchQuiz';
import { quizAnswersStore } from '@/lib/quizAnswers';
import { topSides } from '@/lib/matchType';
import { matchOrdinal } from '@/lib/seriesFormat';
import Icon from '../ui/Icon';
import styles from './QuizCard.module.scss';

// A quiz on a result older than this is stale news.
const RECENT_MS = 3 * 24 * 60 * 60 * 1000;

/** The finished match most worth quizzing: a followed side's first, then the biggest fixture, then the newest. */
function pickMatch(matches: Match[], followed: Set<string>): Match | null {
  const now = Date.now();
  const rank = (m: Match) => [
    Number(followed.has(m.homeTeam.id) || followed.has(m.awayTeam.id)),
    topSides(m),
    +new Date(m.startTime),
  ];
  return (
    matches
      .filter((m) => m.status === 'COMPLETED' && m.result && now - +new Date(m.startTime) <= RECENT_MS)
      .sort((a, b) => {
        const [x, y] = [rank(a), rank(b)];
        return y[0] - x[0] || y[1] - x[1] || y[2] - x[2];
      })[0] ?? null
  );
}

/** Home's way into the match quiz; absent until the quiz exists (no quiz model, nothing finished). */
export default function QuizCard({ matches, followed }: { matches: Match[]; followed: Set<string> }) {
  const match = useMemo(() => pickMatch(matches, followed), [matches, followed]);
  const quiz = useMatchQuiz(match?.id ?? '', match ? 'result' : null);
  const stored = quizAnswersStore.use()[match?.id ?? ''];

  if (!match || !quiz || quiz.matchId !== match.id) return null;

  const total = quiz.questions.length;
  const picks = stored?.version === quiz.generatedAt ? stored.picks : [];
  const correct = picks.filter((p, i) => p === quiz.questions[i]?.answer).length;
  const done = picks.length >= total;
  const cta = done ? 'See your answers' : picks.length ? `Carry on · ${picks.length} of ${total}` : 'Take the quiz';

  return (
    <section className={styles.card} aria-labelledby="quiz-card-title">
      <div className={styles.body}>
        <p className={styles.eyebrow}>Match quiz</p>
        <h2 id="quiz-card-title" className={styles.title}>
          How closely did you follow {match.homeTeam.shortName} v {match.awayTeam.shortName}?
        </h2>
        <p className={styles.meta}>
          {matchOrdinal(match)} · {match.series.name}
        </p>
      </div>

      <div className={styles.side}>
        <ol className={styles.dots} aria-label={done ? `${correct} of ${total} right` : `${picks.length} of ${total} answered`}>
          {quiz.questions.map((q, i) => (
            <li
              key={i}
              className={`${styles.dot} ${picks[i] === undefined ? '' : picks[i] === q.answer ? styles.right : styles.wrong}`}
            />
          ))}
        </ol>
        {done && (
          <p className={styles.score}>
            <strong>{correct}</strong>/{total}
          </p>
        )}
        <Link href={`/matches/${match.id}?tab=quiz`} className={styles.cta}>
          {cta}
          <Icon name="arrowRight" size={16} />
        </Link>
      </div>
    </section>
  );
}
