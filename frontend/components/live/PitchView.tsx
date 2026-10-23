'use client';

import { useEffect, useRef, useState } from 'react';
import { ballKind, runsLabel, type BallEntry } from '@/lib/balls';
import styles from './PitchView.module.scss';

// How the ball travels: boundaries and wickets have their own, runs roll into the field, the rest stop at the bat.
type Moment = 'six' | 'four' | 'wicket' | 'runs' | 'ball';

const HOLD_MS = 3200;
const MOMENT_CLASS: Record<Moment, string | undefined> = {
  six: styles.six,
  four: styles.four,
  wicket: styles.wicket,
  runs: styles.runs,
  ball: styles.delivery,
};

// By position, not id: the upstream re-publishes a delivery under a new id.
const keyOf = (b: BallEntry) => `${b.inning ?? 0}:${b.over}.${b.ball}:${b.extra ?? ''}`;

function momentOf(b: BallEntry): Moment {
  const kind = ballKind(b);
  if (kind === 'six' || kind === 'four' || kind === 'wicket') return kind;
  return kind === 'run' || kind === 'extra' ? 'runs' : 'ball';
}

function labelOf(b: BallEntry): string {
  const kind = ballKind(b);
  if (kind === 'wicket') return 'Wicket';
  if (kind === 'six') return 'Six';
  if (kind === 'four') return 'Four';
  if (kind === 'dot') return 'Dot ball';
  return runsLabel(b);
}

/** A side-on pitch that plays each delivery that lands while it is on screen. */
export default function PitchView({ latest, className }: { latest: BallEntry | null; className?: string }) {
  const seen = useRef<string | null>(null);
  const [moment, setMoment] = useState<{ kind: Moment; key: string; label: string } | null>(null);
  const key = latest ? keyOf(latest) : null;
  const kind = latest ? momentOf(latest) : null;
  const label = latest ? labelOf(latest) : '';

  useEffect(() => {
    if (!key || !kind) return;
    // The ball already on the board when the pitch appears is history, not news.
    if (seen.current === null || seen.current === key) {
      seen.current = key;
      return;
    }
    seen.current = key;
    setMoment({ kind, key, label });
    const t = setTimeout(() => setMoment((m) => (m?.key === key ? null : m)), HOLD_MS);
    return () => clearTimeout(t);
  }, [key, kind, label]);

  return (
    <div className={`${styles.pitch} ${moment ? MOMENT_CLASS[moment.kind] ?? '' : ''} ${className ?? ''}`} aria-hidden="true">
      {/* Keyed by the delivery so every one replays from the bowler's hand. */}
      <svg key={moment?.key ?? 'idle'} viewBox="0 0 320 110" className={styles.svg}>
        <polygon className={styles.strip} points="18,90 302,90 286,72 34,72" />
        <line className={styles.crease} x1="58" y1="73" x2="52" y2="89" />
        <line className={styles.crease} x1="262" y1="73" x2="268" y2="89" />

        <g className={styles.stumps}>
          <line x1="38" y1="80" x2="38" y2="52" />
          <line x1="42" y1="80" x2="42" y2="52" />
          <line x1="46" y1="80" x2="46" y2="52" />
          <line className={styles.bail} x1="37" y1="51" x2="47" y2="51" />
        </g>

        <g className={`${styles.stumps} ${styles.striker}`}>
          <line className={styles.stumpL} x1="274" y1="82" x2="274" y2="48" />
          <line className={styles.stumpM} x1="279" y1="82" x2="279" y2="48" />
          <line className={styles.stumpR} x1="284" y1="82" x2="284" y2="48" />
          <line className={`${styles.bail} ${styles.bailL}`} x1="273" y1="47" x2="279" y2="47" />
          <line className={`${styles.bail} ${styles.bailR}`} x1="279" y1="47" x2="285" y2="47" />
        </g>

        {moment?.kind === 'six' && <circle className={styles.burst} cx="250" cy="40" r="10" />}
        {moment?.kind === 'four' && <line className={styles.streak} x1="262" y1="84" x2="60" y2="98" />}
        {moment && <circle className={styles.ball} cx="56" cy="50" r="4.5" />}
      </svg>
      {moment && <span className={styles.badge}>{moment.label}</span>}
    </div>
  );
}
