'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { InningsScore, Match, MatchEvent, OverSummary, PlayerOfMatch, Team } from '@/types';
import { inningsUnderway, type MatchStateView } from '@/lib/matchState';
import type { Crease } from '@/lib/crease';
import type { BallEntry, BallGroup } from '@/lib/balls';
import { PULSE_WINDOW, matchPulse, pulseTrace, recentInningsBalls } from '@/lib/pulse';
import { axisMoments, inningsWorms } from '@/lib/momentum';
import { keyMoments } from '@/lib/keyMoments';
import { SCHEDULED_OVERS, inningsBallLimit } from '@/lib/overs';
import MatchPulse from '../live/MatchPulse';
import PulseTrace from '../live/PulseTrace';
import BallTimeline from '../live/BallTimeline';
import MatchEvents from './MatchEvents';
import { PlayerSituations } from './MatchState';
import WinProbability from './WinProbability';
import MomentumGraph from './MomentumGraph';
import PlayerLink from './PlayerLink';
import PreStart from './PreStart';
import Skeleton from '../ui/Skeleton';
import { fmtOvers } from './ScorecardPanel';
import mc from './matchCenter.module.scss';
import styles from './LivePanel.module.scss';

const GRAPH_WALK_BUDGET = 8;

function initialsOf(name: string): string {
  const words = name.split(/[\s-]+/).filter(Boolean);
  if (!words.length) return '?';
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}

function PlayerOfMatchCard({ award, teams }: { award: PlayerOfMatch; teams: Team[] }) {
  const team = teams.find((t) => t.id === award.teamId);
  return (
    <div className={styles.potm}>
      <span className={styles.potmAvatar} aria-hidden="true">
        {initialsOf(award.name)}
      </span>
      <div className={styles.potmBody}>
        <span className={styles.potmLabel}>Player of the match</span>
        <PlayerLink id={award.id} name={award.name} className={styles.potmName} />
        <span className={styles.potmTeam}>{team?.name ?? award.teamShortName}</span>
      </div>
      <dl className={styles.potmFigs}>
        {award.batting && (
          <div>
            <dt>Bat</dt>
            <dd>{award.batting}</dd>
          </div>
        )}
        {award.bowling && (
          <div>
            <dt>Bowl</dt>
            <dd>{award.bowling}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

export default function LivePanel({
  match,
  state,
  perOver,
  innings,
  balls,
  overs,
  events,
  groups,
  crease,
  pending,
  history,
}: {
  match: Match;
  state: MatchStateView;
  perOver: number;
  /** The fetched card, innings order. */
  innings: InningsScore[];
  /** Deliveries, newest first. */
  balls: BallEntry[];
  overs: OverSummary[];
  events: MatchEvent[];
  groups: BallGroup[];
  crease: Crease | null;
  pending: boolean;
  history: { loadMore: () => void; loading: boolean; exhausted: boolean };
}) {
  const live = match.status === 'LIVE';
  const window = useMemo(() => recentInningsBalls(balls), [balls]);
  const pulseOn = inningsUnderway(state);
  const readings = useMemo(() => (pulseOn ? matchPulse(window, match.format, perOver) : null), [pulseOn, window, match.format, perOver]);
  const trace = useMemo(() => pulseTrace(window), [window]);
  const worms = useMemo(() => inningsWorms(innings, overs, balls, perOver), [innings, overs, balls, perOver]);
  const moments = useMemo(() => axisMoments(events), [events]);
  const keyEvents = useMemo(() => keyMoments(events, innings), [events, innings]);

  const batted = innings.filter((i) => !i.notStarted);
  const ballLimit =
    match.format === 'TEST'
      ? null
      : batted.length >= 1
        ? match.ballsLimit ?? (batted.length > 1 ? inningsBallLimit(batted[0], match, perOver) : null) ?? (SCHEDULED_OVERS[match.format] ?? 20) * perOver
        : null;

  // Walk the feed back to the start of the latest innings so the per-over bars fill in.
  const walks = useRef(0);
  const latestInning = batted.length - 1;
  const reachedStart = useMemo(() => {
    const own = balls.filter((b) => (b.inning ?? 0) === latestInning);
    return balls.some((b) => (b.inning ?? 0) < latestInning) || (own.length > 0 && Math.min(...own.map((b) => b.over)) === 0);
  }, [balls, latestInning]);
  const shouldWalk =
    match.format !== 'TEST' && !history.exhausted && !reachedStart && balls.length > 0 && walks.current < GRAPH_WALK_BUDGET;

  useEffect(() => {
    if (!shouldWalk || history.loading) return;
    walks.current += 1;
    history.loadMore();
  }, [shouldWalk, history]);

  const showLive = live && state.family !== 'upcoming';
  // Nothing on the board and nothing in the feed: the grid would be two empty panels.
  const preStart =
    (match.status === 'UPCOMING' || live) &&
    !balls.length &&
    !batted.some((i) => i.overs > 0 || i.runs > 0 || i.wickets > 0);

  return (
    <div className={mc.panel}>
      {match.status === 'COMPLETED' && match.playerOfMatch && (
        <section className={mc.block}>
          <PlayerOfMatchCard award={match.playerOfMatch} teams={[match.homeTeam, match.awayTeam]} />
        </section>
      )}

      {preStart && !pending && <PreStart match={match} state={state} />}

      {showLive && !(preStart && !pending) && (
        <div className={styles.liveGrid}>
          <section className={`${mc.block} ${styles.cellOver}`}>
            <div className={mc.blockHead}>
              <h2 className={mc.blockTitle}>Current over</h2>
            </div>
            <div className={mc.surface}>
              {groups.length ? (
                <BallTimeline groups={groups} perOver={perOver} />
              ) : (
                pending ? (
                  <div className={styles.loadingBalls} aria-busy="true" aria-label="Loading the current over">
                    {Array.from({ length: 6 }, (_, i) => (
                      <Skeleton key={i} variant="circle" size="26" />
                    ))}
                  </div>
                ) : (
                  <p className={styles.muted}>No deliveries yet</p>
                )
              )}
            </div>
          </section>

          {crease && (
            <section className={`${mc.block} ${styles.cellCrease}`}>
              <div className={mc.blockHead}>
                <h2 className={mc.blockTitle}>At the crease</h2>
              </div>
              <div className={styles.crease}>
                {crease.batsmen.map(({ line, onStrike }) => (
                  <div key={line.playerId} className={`${styles.person} ${onStrike ? styles.onStrike : ''}`}>
                    <span className={styles.role}>{onStrike ? 'On strike' : 'Batting'} · {crease.battingTeam}</span>
                    <PlayerLink id={line.playerId} name={line.name} className={styles.personName} />
                    <span className={styles.personFig}>
                      <strong>{line.runs}</strong>
                      <span>({line.balls})</span>
                    </span>
                    <dl className={styles.personStats}>
                      <div>
                        <dt>4s</dt>
                        <dd>{line.fours}</dd>
                      </div>
                      <div>
                        <dt>6s</dt>
                        <dd>{line.sixes}</dd>
                      </div>
                      <div>
                        <dt>SR</dt>
                        <dd>{line.strikeRate.toFixed(1)}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
                {crease.bowler && (
                  <div className={`${styles.person} ${styles.bowler}`}>
                    <span className={styles.role}>Bowling · {crease.fieldingTeam}</span>
                    <PlayerLink id={crease.bowler.playerId} name={crease.bowler.name} className={styles.personName} />
                    <span className={styles.personFig}>
                      <strong>
                        {crease.bowler.wickets}-{crease.bowler.runs}
                      </strong>
                      <span>({fmtOvers(crease.bowler.overs, perOver)})</span>
                    </span>
                    <dl className={styles.personStats}>
                      <div>
                        <dt>M</dt>
                        <dd>{crease.bowler.maidens}</dd>
                      </div>
                      <div>
                        <dt>Econ</dt>
                        <dd>{crease.bowler.economy.toFixed(2)}</dd>
                      </div>
                    </dl>
                  </div>
                )}
              </div>
            </section>
          )}

          <section className={`${mc.block} ${styles.cellPulse}`}>
            <div className={mc.blockHead}>
              <h2 className={mc.blockTitle}>Live pulse</h2>
            </div>
            <div className={mc.surface}>
              {readings ? (
                <>
                  <PulseTrace points={trace} label={`Last ${window.length} deliveries`} still={!state.alive} />
                  <MatchPulse readings={readings} window={Math.min(window.length, PULSE_WINDOW)} />
                </>
              ) : (
                pending ? (
                  <div className={styles.loadingPulse} aria-busy="true" aria-label="Loading the pulse">
                    <Skeleton variant="block" />
                    <Skeleton variant="body" width="80" />
                    <Skeleton variant="body" width="60" />
                  </div>
                ) : (
                  <p className={styles.muted}>Waiting for deliveries</p>
                )
              )}
            </div>
          </section>
        </div>
      )}

      {showLive && <WinProbability match={match} innings={innings} />}

      {worms.length > 0 && (
        <section className={mc.block}>
          <div className={mc.blockHead}>
            <h2 className={mc.blockTitle}>Match graph</h2>
          </div>
          <div className={mc.surface}>
            <MomentumGraph worms={worms} perOver={perOver} format={match.format} moments={moments} ballLimit={ballLimit} />
          </div>
        </section>
      )}

      <section className={mc.block}>
        <div className={mc.blockHead}>
          <h2 className={mc.blockTitle}>Key moments</h2>
        </div>
        <MatchEvents events={keyEvents} pending={pending} limit={10} />
        <PlayerSituations innings={innings} />
      </section>
    </div>
  );
}
