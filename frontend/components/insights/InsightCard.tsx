'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Match } from '@/types';
import { useCrexMatchExtras, useCrexMatchSquads } from '@/hooks/useCrexMatches';
import { feedCheckedNote } from '@/lib/crex';
import { inningsUnderway, matchStateOf } from '@/lib/matchState';
import { PHASE_LABEL, equationSentence, inningsProgress, inningsStarted, liveEquation } from '@/lib/telemetry';
import { formatProgressShort } from '@/lib/overs';
import { toBallEntry } from '@/lib/balls';
import { matchPulse, pulseTrace, recentInningsBalls } from '@/lib/pulse';
import TeamBadge from '../ui/TeamBadge';
import StateChip from '../live/StateChip';
import CreaseLine from '../live/CreaseLine';
import MatchPulse from '../live/MatchPulse';
import PulseTrace from '../live/PulseTrace';
import Ticker from '../live/Ticker';
import LocalTime from '../ui/LocalTime';
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

  const extras = useCrexMatchExtras(match.id, {
    enabled: visible && match.status === 'LIVE',
    intervalMs: CARD_INTERVAL_MS,
    ballsPerOver: match.ballsPerOver,
    status: match.status,
  });
  const state = matchStateOf(
    match,
    feedCheckedNote(match, { innings: extras.innings, lastBallAt: extras.commentary[0]?.timestamp ?? null, now: extras.fetchedAt })
  );

  const perOver = match.ballsPerOver || 6;
  const eq = liveEquation(match);
  const started = inningsStarted(eq);
  // Before the first ball the card is the fixture: toss, conditions, and how the ground plays.
  const { conditions } = useCrexMatchSquads(match.id, { enabled: visible && !started });
  const weather = conditions?.weather;
  const ground = conditions?.venue;

  const pulseOn = started && inningsUnderway(state);
  const window = useMemo(() => recentInningsBalls(extras.commentary.map(toBallEntry)), [extras.commentary]);
  const readings = useMemo(() => (pulseOn ? matchPulse(window, match.format, perOver) : null), [pulseOn, window, match.format, perOver]);
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
          {started ? (
            <>
              <TeamBadge name={eq.battingTeam.name} shortName={eq.battingTeam.shortName} logo={eq.battingTeam.logo} size="sm" />
              <span className={styles.code}>{eq.battingTeam.shortName}</span>
              <span className={styles.vs}>v {eq.bowlingTeam.shortName}</span>
            </>
          ) : (
            [match.homeTeam, match.awayTeam].map((t, i) => (
              <span key={t.id} className={styles.side}>
                {i > 0 && <span className={styles.vs}>v</span>}
                <TeamBadge name={t.name} shortName={t.shortName} logo={t.logo} size="sm" />
                <span className={styles.code}>{t.shortName}</span>
              </span>
            ))
          )}
        </span>
        {started && (
          <span className={styles.score}>
            <Ticker value={`${eq.innings.runs}/${eq.innings.wickets}`} />
            <small>{formatProgressShort(eq.innings.overs, perOver)}</small>
          </span>
        )}
      </Link>

      {sentence && started && state.alive ? (
        <p className={`${styles.equation} ${tight ? styles.tight : ''}`}>{sentence}</p>
      ) : !state.alive ? (
        <p className={`${styles.equation} ${styles.stateLine}`}>{state.label}</p>
      ) : (
        !started && <p className={styles.equation}>{match.note?.label ?? 'Waiting for the first ball'}</p>
      )}

      {!started && (
        <>
          <p className={styles.where}>
            <LocalTime iso={match.startTime} format="dayTime" />
            {match.venue && <span className={styles.venue}>{match.venue}</span>}
          </p>
          {(weather?.temperature || weather?.rainChance || ground?.averages[0] != null || ground?.wonBattingFirst != null) && (
            <dl className={styles.figs}>
              {weather?.temperature && (
                <div>
                  <dt>Weather</dt>
                  <dd>
                    {weather.temperature}
                    {weather.condition && <small>{weather.condition}</small>}
                  </dd>
                </div>
              )}
              {weather?.rainChance && (
                <div>
                  <dt>Rain</dt>
                  <dd>{weather.rainChance}</dd>
                </div>
              )}
              {ground?.averages[0] != null && (
                <div>
                  <dt>Avg 1st inns</dt>
                  <dd>{ground.averages[0]}</dd>
                </div>
              )}
              {ground?.wonBattingFirst != null && ground.wonBowlingFirst != null && (
                <div>
                  <dt>Bat first · chase</dt>
                  <dd>
                    {ground.wonBattingFirst}–{ground.wonBowlingFirst}
                    {ground.matches != null && <small>of {ground.matches}</small>}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </>
      )}

      {started && (
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

      {readings && (
        <div className={styles.pulse}>
          <PulseTrace points={trace} still={!state.alive} />
          <MatchPulse readings={readings} compact />
        </div>
      )}

      <CreaseLine family={state.family} progress={state.alive ? inningsProgress(match) : null} className={styles.foot} />
    </article>
  );
}
