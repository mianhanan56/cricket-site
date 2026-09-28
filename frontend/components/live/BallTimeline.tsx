'use client';

import { useEffect, useRef } from 'react';
import {
  ballKind,
  ballTitle,
  overGroupLabel,
  shortLabel,
  type BallGroup,
} from '@/lib/balls';
import styles from './BallTimeline.module.scss';

/**
 * Deliveries as a live event stream, one over per segment. A delivery that
 * arrives after the strip first rendered plays its kind's entrance — a six
 * pulses, a four sweeps, a wicket lands with an impact.
 */
export default function BallTimeline({
  groups,
  perOver,
  compact = false,
  label = 'Recent balls',
}: {
  groups: BallGroup[];
  perOver: number;
  compact?: boolean;
  label?: string;
}) {
  const seen = useRef<Set<string> | null>(null);
  if (seen.current === null) seen.current = new Set(groups.flatMap((g) => g.balls.map((b) => b.id)));
  const fresh = new Set(groups.flatMap((g) => g.balls.map((b) => b.id)).filter((id) => !seen.current?.has(id)));

  useEffect(() => {
    fresh.forEach((id) => seen.current?.add(id));
  });

  const stripRef = useRef<HTMLDivElement | null>(null);
  const newest = groups[groups.length - 1]?.balls.slice(-1)[0]?.id;
  useEffect(() => {
    const el = stripRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [newest]);

  if (!groups.length) return null;

  return (
    <div className={`${styles.strip} ${compact ? styles.compact : ''}`} ref={stripRef} aria-label={label} role="group">
      {groups.map((g) => (
        <section key={`${g.over}-${g.balls[0].id}`} className={styles.over}>
          <header className={styles.head}>
            <h3 className={styles.overLabel}>{g.truncated ? '···' : overGroupLabel(g.over, perOver)}</h3>
            <span className={styles.total}>
              <span aria-hidden="true">{g.runs}</span>
              <span className={styles.sr}>{g.runs} runs off the over</span>
            </span>
          </header>
          <ol className={styles.balls}>
            {g.balls.map((b) => {
              const kind = ballKind(b);
              return (
                <li
                  key={b.id}
                  className={`${styles.ball} ${styles[kind]} ${fresh.has(b.id) ? styles.fresh : ''}`}
                  title={ballTitle(b)}
                >
                  <span className={styles.token} aria-hidden="true">
                    {shortLabel(b)}
                  </span>
                  <span className={styles.sr}>{ballTitle(b)}</span>
                </li>
              );
            })}
            {Array.from({ length: g.pending }, (_, i) => (
              <li key={`p-${i}`} className={`${styles.ball} ${styles.pending}`} aria-hidden="true">
                <span className={styles.token} />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
