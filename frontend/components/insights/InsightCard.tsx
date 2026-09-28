'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Match } from '@/types';
import { useCrexMatchExtras } from '@/hooks/useCrexMatches';
import { matchStateOf } from '@/lib/matchState';
import { PHASE_LABEL, equationSentence, inningsProgress, liveEquation } from '@/lib/telemetry';
import { formatProgressShort } from '@/lib/overs';
import { toBallEntry } from '@/lib/balls';
import { matchPulse, pulseTrace, recentInningsBalls } from '@/lib/pulse';
import TeamBadge from '../ui/TeamBadge';
import StateChip from '../live/StateChip';
import CreaseLine from '../live/CreaseLine';
import MatchPulse from '../live/MatchPulse';
import PulseTrace from '../live/PulseTrace';
import Ticker from '../live/Ticker';
import styles from './InsightCard.module.scss';

const CARD_INTERVAL_MS = 15_000;

/** One live match's telemetry. Polls its own feed only while on screen. */
export default function InsightCard({ match }: { match: Match }) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '200px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const state = matchStateOf(match);
  const extras = useCrexMatchExtras(match.id, {
    enabled: visible && match.status === 'LIVE',
    intervalMs: CARD_INTERVAL_MS,
    ballsPerOver: match.ballsPerOver,
    status: match.status,
  });

  const perOver = match.ballsPerOver || 6;
  const eq = liveEquation(match);
  const window = useMemo(() => recentInningsBalls(extras.commentary.map(toBallEntry)), [extras.commentary]);
  const readings = useMemo(() => (state.alive ? matchPulse(window, match.format, perOver) : null), [state.alive, window, match.format, perOver]);
  const trace = useMemo(() => pulseTrace(window), [window]);
  const sentence = eq ? equationSentence(eq) : null;
  const tight = eq?.rrr != null && eq.crr != null && eq.rrr > eq.crr;

  return (
    <article ref={ref} className={`${styles.card} ${styles[state.family] ?? ''}`}>
      <header className={styles.head}>
        <span className={styles.series}>
          <span className={styles.format}>{match.format}</span>
          {match.series.name}
        </span>
        <StateChip state={state} />
      </header>

      <Link href={`/matches/${match.id}`} className={styles.main}>
        <span className={styles.teams}>
          {eq ? (
            <>
              <TeamBadge name={eq.battingTeam.name} shortName={eq.battingTeam.shortName} logo={eq.battingTeam.logo} size="sm" />
              <span className={styles.code}>{eq.battingTeam.shortName}</span>
              <span className={styles.vs}>v {eq.bowlingTeam.shortName}</span>
            </>
          ) : (
            <span className={styles.code}>
              {match.homeTeam.shortName} v {match.awayTeam.shortName}
            </span>
          )}
        </span>
        {eq && (
          <span className={styles.score}>
            <Ticker value={`${eq.innings.runs}/${eq.innings.wickets}`} />
            <small>{formatProgressShort(eq.innings.overs, perOver)}</small>
          </span>
        )}
      </Link>

      {sentence ? (
        <p className={`${styles.equation} ${tight ? styles.tight : ''}`}>{sentence}</p>
      ) : (
        !state.alive && <p className={styles.equation}>{state.label}</p>
      )}

      {eq && (
        <dl className={styles.figs}>
          <div>
            <dt>CRR</dt>
            <dd>{eq.crr != null ? eq.crr.toFixed(2) : '—'}</dd>
          </div>
          {eq.rrr != null && (
            <div className={tight ? styles.figTight : undefined}>
              <dt>RRR</dt>
              <dd>{eq.rrr.toFixed(2)}</dd>
            </div>
          )}
          {eq.target && (
            <div>
              <dt>Target</dt>
              <dd>{eq.target}</dd>
            </div>
          )}
          {eq.phase && (
            <div>
              <dt>Phase</dt>
              <dd className={styles.word}>{PHASE_LABEL[eq.phase]}</dd>
            </div>
          )}
          {match.format === 'TEST' && match.day && (
            <div>
              <dt>Day</dt>
              <dd>{match.day}</dd>
            </div>
          )}
        </dl>
      )}

      {readings ? (
        <div className={styles.pulse}>
          <PulseTrace points={trace} />
          <MatchPulse readings={readings} compact />
        </div>
      ) : (
        <div className={styles.pulseEmpty} />
      )}

      <CreaseLine family={state.family} progress={state.alive ? inningsProgress(match) : null} />
    </article>
  );
}
