'use client';

import { useState } from 'react';
import type { MatchQuiz } from '@/types';
import { quizAnswersStore } from '@/lib/quizAnswers';
import Icon from '../ui/Icon';
import mc from './matchCenter.module.scss';
import styles from './QuizPanel.module.scss';

export default function QuizPanel({ quiz }: { quiz: MatchQuiz }) {
  const stored = quizAnswersStore.use()[quiz.matchId];
  const picks = stored?.version === quiz.generatedAt ? stored.picks : [];
  // The question just answered stays up, verdict shown, until the reader moves on.
  const [revealed, setRevealed] = useState<number | null>(null);

  const total = quiz.questions.length;
  const step = revealed ?? picks.length;
  const done = step >= total;
  const correct = picks.filter((p, i) => p === quiz.questions[i]?.answer).length;

  const save = (next: number[]) =>
    quizAnswersStore.set((all) => ({ ...all, [quiz.matchId]: { version: quiz.generatedAt, picks: next } }));

  const choose = (option: number) => {
    if (revealed !== null || picks.length !== step) return;
    save([...picks, option]);
    setRevealed(step);
  };

  const restart = () => {
    save([]);
    setRevealed(null);
  };

  const q = done ? null : quiz.questions[step];
  const pick = picks[step];
  const answered = pick !== undefined;

  return (
    <div className={mc.panel}>
      <section className={`${mc.block} ${styles.quiz}`} aria-labelledby="quiz-title">
        <div className={styles.head}>
          <h2 id="quiz-title" className={styles.title}>Match quiz</h2>
          <ol className={styles.over} aria-label={done ? `${correct} of ${total} correct` : `Question ${step + 1} of ${total}`}>
            {quiz.questions.map((question, i) => {
              const state =
                picks[i] === undefined ? (i === step ? 'current' : 'ahead') : picks[i] === question.answer ? 'right' : 'wrong';
              return <li key={i} className={`${styles.ball} ${styles[state]}`} aria-hidden="true" />;
            })}
          </ol>
        </div>

        {q ? (
          <div className={styles.card} key={step}>
            <p className={styles.question}>{q.question}</p>
            <div className={styles.options}>
              {q.options.map((option, i) => {
                const mark = !answered ? '' : i === q.answer ? styles.isAnswer : i === pick ? styles.isMiss : styles.isOther;
                return (
                  <button
                    key={i}
                    type="button"
                    className={`${styles.option} ${mark}`}
                    disabled={answered}
                    aria-pressed={answered ? i === pick : undefined}
                    onClick={() => choose(i)}
                  >
                    <span>{option}</span>
                    {answered && i === q.answer && <Icon name="check" size={18} strokeWidth={2.4} />}
                    {answered && i === pick && i !== q.answer && <Icon name="close" size={18} strokeWidth={2.4} />}
                  </button>
                );
              })}
            </div>

            <div className={styles.after} aria-live="polite">
              {answered && (
                <>
                  <p className={styles.verdict}>
                    <strong className={pick === q.answer ? styles.right : styles.wrong}>
                      {pick === q.answer ? 'Correct' : 'Not quite'}
                    </strong>{' '}
                    {q.explanation}
                  </p>
                  <button type="button" className={styles.next} onClick={() => setRevealed(null)}>
                    {step + 1 < total ? 'Next question' : 'See your score'}
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className={styles.card}>
            <p className={styles.score}>
              <span className={styles.scoreNum}>
                {correct}/{total}
              </span>
              <span className={styles.scoreLabel}>correct</span>
            </p>
            <ul className={styles.review}>
              {quiz.questions.map((question, i) => (
                <li key={i} className={styles.reviewRow}>
                  <span className={`${styles.reviewMark} ${picks[i] === question.answer ? styles.right : styles.wrong}`}>
                    <Icon name={picks[i] === question.answer ? 'check' : 'close'} size={16} strokeWidth={2.4} />
                  </span>
                  <span className={styles.reviewText}>
                    {question.question}
                    <strong>{question.options[question.answer]}</strong>
                  </span>
                </li>
              ))}
            </ul>
            <button type="button" className={styles.again} onClick={restart}>
              Play again
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
