'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { FallOfWicket } from '@/types';
import { usePlayerBalls } from '@/hooks/usePlayerBalls';
import { ballKind, ballTitle, overGroupLabel, shortLabel } from '@/lib/balls';
import { countedBalls, oversOf, type BallRole } from '@/lib/playerBalls';
import Icon from '../ui/Icon';
import strip from '../live/BallTimeline.module.scss';
import styles from './PlayerBalls.module.scss';

interface PlayerBallsProps {
  matchKey: string;
  inning: number;
  playerId: string;
  name: string;
  role: BallRole;
  /** Balls faced, or legal balls bowled, per the scorecard. */
  expected: number;
  /** The scorecard line, as the header of the popup. */
  summary: string;
  /** Player keys to names, for the other end of each over. */
  names: Record<string, string>;
  fallOfWickets: FallOfWicket[];
  perOver: number;
  /** The innings is in play. */
  live: boolean;
}

export default function PlayerBallsButton(props: PlayerBallsProps) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  // The dialog unmounts on close, so the browser can't hand focus back by itself.
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`${props.role === 'batter' ? 'Balls faced' : 'Balls bowled'} by ${props.name}`}
        title={props.role === 'batter' ? 'Balls faced' : 'Balls bowled'}
      >
        <Icon name="ball" size={16} />
      </button>
      {open && <PlayerBallsDialog {...props} onClose={close} />}
    </>
  );
}

function PlayerBallsDialog({
  matchKey,
  inning,
  playerId,
  name,
  role,
  expected,
  summary,
  names,
  fallOfWickets,
  perOver,
  live,
  onClose,
}: PlayerBallsProps & { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const { balls, loading, error, retry } = usePlayerBalls(
    matchKey,
    { inning, playerId, role, expected, fallOfWickets, live },
    true
  );

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // Closed natively first: while it is modal the page behind is inert and can't take focus back.
  const dismiss = () => {
    ref.current?.close();
    onClose();
  };

  const overs = oversOf(balls, role);
  const found = countedBalls(balls, role);
  const opponents = (ids: string[]) =>
    ids
      .map((k) => names[k])
      .filter(Boolean)
      .join(', ');

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault();
        dismiss();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div className={styles.panel}>
        <header className={styles.head}>
          <div className={styles.heading}>
            <h2 id={`${id}-title`} className={styles.name}>
              {name}
            </h2>
            <p className={styles.summary}>{summary}</p>
          </div>
          <button type="button" className={styles.close} onClick={dismiss} aria-label="Close" autoFocus>
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className={styles.body}>
          {overs.length > 0 && (
            <ol className={styles.overs}>
              {overs.map((o) => {
                const other = opponents(o.opponents);
                return (
                  <li key={`${o.over}-${o.balls[0].id}`} className={styles.over}>
                    <div className={styles.overHead}>
                      <span className={styles.overLabel}>{overGroupLabel(o.over, perOver)}</span>
                      {other && (
                        <span className={styles.opponent}>
                          {role === 'batter' ? 'v' : 'to'} {other}
                        </span>
                      )}
                      <span className={styles.overRuns}>
                        {o.runs}
                        <span className={strip.sr}> runs</span>
                      </span>
                    </div>
                    <ol className={`${strip.balls} ${styles.balls}`}>
                      {o.balls.map((b) => (
                        <li key={b.id} className={`${strip.ball} ${strip[ballKind(b)] ?? ''}`} title={ballTitle(b)}>
                          <span className={strip.token} aria-hidden="true">
                            {shortLabel(b)}
                          </span>
                          <span className={strip.sr}>{ballTitle(b)}</span>
                        </li>
                      ))}
                    </ol>
                  </li>
                );
              })}
            </ol>
          )}

          {loading && (
            <p className={styles.status} role="status">
              <span className={styles.spinner} aria-hidden="true" />
              {overs.length ? `${found} of ${expected} balls` : 'Loading balls'}
            </p>
          )}

          {!loading && error && (
            <div className={styles.status} role="alert">
              Couldn’t load the balls.
              <button type="button" className={styles.action} onClick={retry}>
                Try again
              </button>
            </div>
          )}

          {!loading && !error && !overs.length && (
            <p className={styles.status}>No ball-by-ball for this innings.</p>
          )}
        </div>
      </div>
    </dialog>
  );
}
