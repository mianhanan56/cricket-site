'use client';

import { useEffect, useRef, useState } from 'react';
import type { MatchQuiz } from '@/types';
import { quizAnswersStore } from '@/lib/quizAnswers';
import Icon from '../ui/Icon';
import mc from './matchCenter.module.scss';
import styles from './QuizPanel.module.scss';

// Each piece's place and timing comes from an nth-of-type rule — keep in step with
// $confetti / $balloons in QuizPanel.module.scss.
const CONFETTI = 32;
const BALLOONS = 7;
// From this share of right answers up, the end screen celebrates.
const WELL_PLAYED = 0.6;
const KEYS = ['a', 'b', 'c', 'd'];

function headline(correct: number, total: number): string {
  if (correct === total) return 'Perfect innings!';
  if (correct / total >= WELL_PLAYED) return 'Well played!';
  return correct ? 'Have another go' : 'Out for a duck';
}

function Celebration() {
  return (
    <div className={styles.party} aria-hidden="true">
      {Array.from({ length: CONFETTI }, (_, i) => (
        <i key={i} className={styles.confetti} />
      ))}
      {Array.from({ length: BALLOONS }, (_, i) => (
        <b key={i} className={styles.balloon} />
      ))}
    </div>
  );
}

export default function QuizPanel({ quiz }: { quiz: MatchQuiz }) {
  const stored = quizAnswersStore.use()[quiz.matchId];
  const picks = stored?.version === quiz.generatedAt ? stored.picks : [];
  // The question just answered stays up, verdict shown, until the reader moves on.
  const [revealed, setRevealed] = useState<number | null>(null);
  // Only a finish seen live celebrates — not a score reopened later.
  const [justFinished, setJustFinished] = useState(false);

  const total = quiz.questions.length;
  const step = revealed ?? picks.length;
  const done = step >= total;
  const correct = picks.filter((p, i) => p === quiz.questions[i]?.answer).length;
  const perfect = correct === total;
  const celebrate = done && justFinished && correct / total >= WELL_PLAYED;

  const save = (next: number[]) =>
    quizAnswersStore.set((all) => ({ ...all, [quiz.matchId]: { version: quiz.generatedAt, picks: next } }));

  const q = done ? null : quiz.questions[step];
  const pick = picks[step];
  const answered = pick !== undefined;

  const choose = (option: number) => {
    if (answered) return;
    save([...picks, option]);
    setRevealed(step);
  };

  const advance = () => {
    if (step + 1 >= total) setJustFinished(true);
    setRevealed(null);
  };

  const restart = () => {
    save([]);
    setRevealed(null);
    setJustFinished(false);
  };

  // A–D or 1–4 answers, Enter moves on. The handler is refreshed each render and bound once.
  const onKey = useRef<(e: KeyboardEvent) => void>();
  onKey.current = (e) => {
    const target = e.target as HTMLElement | null;
    if (!q || e.metaKey || e.ctrlKey || e.altKey || target?.closest('input, textarea, select, [contenteditable]')) return;
    const key = e.key.toLowerCase();
    const index = /^[1-4]$/.test(key) ? Number(key) - 1 : KEYS.indexOf(key);
    if (!answered && index >= 0 && index < q.options.length) {
      e.preventDefault();
      choose(index);
    } else if (answered && key === 'enter' && target?.tagName !== 'BUTTON') {
      e.preventDefault();
      advance();
    }
  };
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey.current?.(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  return (
    <div className={mc.panel}>
      <section className={styles.quiz} aria-labelledby="quiz-title">
        <aside className={styles.board}>
          <span className={styles.mow} aria-hidden="true" />
          <h2 id="quiz-title" className={styles.title}>
            Quiz
          </h2>
          <p className={styles.count}>
            <span className={styles.countNum}>
              {done ? correct : step + 1}
              <span className={styles.countOf}>/{total}</span>
            </span>
            <span className={styles.countLabel}>{done ? 'correct' : 'question'}</span>
          </p>
          <div className={styles.progress}>
            <ol className={styles.over}>
              {quiz.questions.map((question, i) => {
                const state =
                  picks[i] === undefined ? (i === step ? 'current' : 'ahead') : picks[i] === question.answer ? 'right' : 'wrong';
                return (
                  <li key={i} className={`${styles.ball} ${styles[state] ?? ''}`}>
                    {i + 1}
                  </li>
                );
              })}
            </ol>
            <p className={styles.tally}>
              {correct} right · {picks.length - correct} wrong
            </p>
          </div>
        </aside>

        <div className={styles.stage}>
          {q ? (
            <div className={styles.card} key={step}>
              {q.about && <p className={styles.about}>{q.about}</p>}
              <p className={styles.question}>{q.question}</p>
              <div className={styles.options}>
                {q.options.map((option, i) => {
                  const isAnswer = answered && i === q.answer;
                  const isMiss = answered && i === pick && !isAnswer;
                  const mark = isAnswer ? styles.isAnswer : isMiss ? styles.isMiss : answered ? styles.isOther : '';
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`${styles.option} ${mark} ${answered && i === pick ? styles.isPick : ''}`}
                      disabled={answered}
                      aria-pressed={answered ? i === pick : undefined}
                      onClick={() => choose(i)}
                    >
                      <span className={styles.ring} aria-hidden="true">
                        {isAnswer ? (
                          <Icon name="check" size={14} strokeWidth={3} />
                        ) : isMiss ? (
                          <Icon name="close" size={14} strokeWidth={3} />
                        ) : (
                          KEYS[i].toUpperCase()
                        )}
                      </span>
                      <span>{option}</span>
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
                    <button type="button" className={styles.primary} onClick={advance}>
                      {step + 1 < total ? 'Next question' : 'See your score'}
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className={styles.card}>
              <p className={`${styles.headline} ${justFinished ? styles.headlineIn : ''}`} aria-live="polite">
                {headline(correct, total)}
              </p>
              <ul className={styles.review}>
                {quiz.questions.map((question, i) => {
                  const right = picks[i] === question.answer;
                  return (
                    <li key={i} className={styles.reviewRow}>
                      <span className={`${styles.reviewMark} ${right ? styles.right : styles.wrong}`}>
                        <Icon name={right ? 'check' : 'close'} size={14} strokeWidth={3} />
                      </span>
                      <span className={styles.reviewText}>
                        {question.about && <span className={styles.reviewAbout}>{question.about}</span>}
                        {question.question}
                        <strong>{question.options[question.answer]}</strong>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <button type="button" className={perfect ? styles.secondary : styles.primary} onClick={restart}>
                {perfect ? 'Play again' : 'Try again'}
              </button>
            </div>
          )}
        </div>

        {celebrate && <Celebration />}
      </section>
    </div>
  );
}
