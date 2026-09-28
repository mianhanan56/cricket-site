import Link from 'next/link';
import type { InningsScore, Match, Team } from '@/types';
import { battedInnings, formatInnings, inningsFor, isClosed } from '@/lib/innings';
import { formatProgressShort } from '@/lib/overs';
import { matchStateOf } from '@/lib/matchState';
import { equationSentence, inningsProgress, liveEquation } from '@/lib/telemetry';
import { attributeResult } from '@/lib/crex';
import TeamBadge from '../ui/TeamBadge';
import Icon from '../ui/Icon';
import CreaseLine from '../live/CreaseLine';
import StateChip from '../live/StateChip';
import Ticker from '../live/Ticker';
import LocalTime from '../ui/LocalTime';
import Countdown from '../live/Countdown';
import styles from './MatchTile.module.scss';

function scoreText(innings: InningsScore[], multi: boolean): { earlier: string[]; latest: string } | null {
  if (!innings.length) return null;
  const latest = innings[innings.length - 1];
  return {
    earlier: innings.slice(0, -1).map(formatInnings),
    latest: multi && isClosed(latest) ? formatInnings(latest) : `${latest.runs}/${latest.wickets}`,
  };
}

function Row({
  match,
  team,
  batting,
  won,
  dim,
}: {
  match: Match;
  team: Team;
  batting: boolean;
  won: boolean;
  dim: boolean;
}) {
  const innings = battedInnings(inningsFor(match, team));
  const score = scoreText(innings, match.format === 'TEST');
  const latest = innings[innings.length - 1];

  return (
    <div className={`${styles.row} ${batting ? styles.batting : ''} ${won ? styles.won : ''} ${dim ? styles.dim : ''}`}>
      <TeamBadge name={team.name} shortName={team.shortName} logo={team.logo} size="sm" />
      <span className={styles.names}>
        <span className={styles.code}>
          {team.shortName}
          {won && <Icon name="check" size={14} strokeWidth={2.6} className={styles.wonMark} />}
        </span>
        <span className={styles.name}>{team.name}</span>
      </span>
      {score ? (
        <span className={styles.scoreBlock}>
          <span className={styles.score}>
            {score.earlier.map((s, i) => (
              <span key={i} className={styles.prior}>
                {s} &amp;{' '}
              </span>
            ))}
            <Ticker value={score.latest} />
          </span>
          {latest && <span className={styles.overs}>{formatProgressShort(latest.overs, match.ballsPerOver)}</span>}
        </span>
      ) : (
        <span className={styles.noScore}>{match.status === 'UPCOMING' ? '' : 'Yet to bat'}</span>
      )}
    </div>
  );
}

/** A match in whatever state it is in, as a compact tile. */
export default function MatchTile({ match, showSeries = true }: { match: Match; showSeries?: boolean }) {
  const state = matchStateOf(match);
  const eq = liveEquation(match);
  const winner =
    match.status === 'COMPLETED' ? attributeResult(match.result, match.homeTeam, match.awayTeam).winnerKey : null;
  const battingId = state.alive ? eq?.battingTeam.id : undefined;

  const footer =
    match.status === 'UPCOMING' ? null : match.status === 'COMPLETED' ? match.result : eq && state.alive
      ? equationSentence(eq) ?? (eq.crr !== null ? `CRR ${eq.crr.toFixed(2)}` : null)
      : state.key !== 'LIVE'
        ? state.label
        : null;

  return (
    <Link href={`/matches/${match.id}`} className={`${styles.tile} ${styles[state.family]}`}>
      <div className={styles.head}>
        <span className={styles.meta}>
          <span className={styles.format}>{match.format}</span>
          {showSeries && <span className={styles.series}>{match.series.name}</span>}
        </span>
        <StateChip state={state} />
      </div>

      <div className={styles.rows}>
        {[match.homeTeam, match.awayTeam].map((t) => (
          <Row
            key={t.id || t.shortName}
            match={match}
            team={t}
            batting={battingId === t.id}
            won={winner === t.id}
            dim={Boolean(winner) && winner !== t.id}
          />
        ))}
      </div>

      <CreaseLine family={state.family} progress={state.alive ? inningsProgress(match) : null} />

      <div className={styles.foot}>
        {match.status === 'UPCOMING' ? (
          <>
            <LocalTime iso={match.startTime} format="dayTime" className={styles.when} />
            <Countdown iso={match.startTime} className={styles.countdown} soonClassName={styles.soon} />
          </>
        ) : (
          <span className={`${styles.note} ${eq?.rrr && eq.crr && eq.rrr > eq.crr ? styles.tight : ''}`}>
            {footer ?? match.venue}
          </span>
        )}
      </div>
    </Link>
  );
}
