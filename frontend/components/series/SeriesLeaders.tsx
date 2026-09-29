import Link from 'next/link';
import type { SeriesLeader, SeriesLeaders as Leaders, SeriesStatKind } from '@/types';
import PlayerPortrait from '../player/PlayerPortrait';
import TeamBadge from '../ui/TeamBadge';
import styles from './SeriesLeaders.module.scss';

/** Kept here rather than imported from the route, so a page module stays out of this component. */
export const STAT_SLUG: Record<SeriesStatKind, string> = {
  RUNS: 'most-runs',
  WICKETS: 'most-wickets',
  HIGHEST_SCORE: 'highest-score',
  BEST_FIGURES: 'best-figures',
  SIXES: 'most-sixes',
  FOURS: 'most-fours',
  FIFTIES: 'most-fifties',
  HUNDREDS: 'most-hundreds',
  STRIKE_RATE: 'best-strike-rate',
  ECONOMY: 'best-economy',
};

// Dot balls and fantasy points have no ranking page behind them, so they are left off.
const ORDER = ['RUNS', 'WICKETS', 'HIGHEST_SCORE', 'BEST_FIGURES', 'SIXES', 'FOURS', 'STRIKE_RATE', 'ECONOMY'] as const;

const UNIT: Partial<Record<SeriesLeader['kind'], string>> = {
  RUNS: 'runs',
  WICKETS: 'wkts',
  SIXES: 'sixes',
  FOURS: 'fours',
};

export function rankedLeaders(leaders: Leaders): SeriesLeader[] {
  return ORDER.map((kind) => leaders.leaders.find((l) => l.kind === kind)).filter((l): l is SeriesLeader => Boolean(l));
}

function hrefFor(seriesId: string, kind: SeriesLeader['kind']): string {
  return `/series/${seriesId}/stats/${STAT_SLUG[kind as SeriesStatKind]}`;
}

/** One honour as a compact figure — the control center's side column. */
export function LeaderFigure({ leader, seriesId }: { leader: SeriesLeader; seriesId: string }) {
  return (
    <Link href={hrefFor(seriesId, leader.kind)} className={styles.figure}>
      <span className={styles.figureLabel}>{leader.label}</span>
      <span className={styles.figureBody}>
        <PlayerPortrait name={leader.playerName} src={leader.playerImage} size="sm" />
        <span className={styles.who}>
          <span className={styles.name}>{leader.playerName}</span>
          <span className={styles.team}>
            <TeamBadge name={leader.team.name} shortName={leader.team.shortName} logo={leader.team.logo} size="xs" />
            {leader.team.shortName}
          </span>
        </span>
        <span className={styles.figureValue}>{leader.value}</span>
      </span>
    </Link>
  );
}

/** The tournament's honours board; every card opens its full ranking. */
export function SeriesLeadersBoard({
  leaders,
  seriesId,
  children,
}: {
  leaders: Leaders;
  seriesId: string;
  children?: React.ReactNode;
}) {
  const shown = rankedLeaders(leaders);
  if (!shown.length) return null;

  return (
    <div className={styles.board}>
      <div className={styles.grid}>
        {shown.map((leader) => (
          <Link
            href={hrefFor(seriesId, leader.kind)}
            className={styles.card}
            data-featured={leader.kind === 'RUNS' || leader.kind === 'WICKETS' ? '' : undefined}
            key={leader.kind}
          >
            <span className={styles.cardLabel}>{leader.label}</span>

            <span className={styles.value}>
              {leader.value}
              {UNIT[leader.kind] && <span className={styles.unit}>{UNIT[leader.kind]}</span>}
            </span>

            <span className={styles.cardWho}>
              <PlayerPortrait name={leader.playerName} src={leader.playerImage} size="sm" />
              <span className={styles.who}>
                <span className={styles.name}>{leader.playerName}</span>
                <span className={styles.team}>
                  <TeamBadge
                    name={leader.team.name}
                    shortName={leader.team.shortName}
                    logo={leader.team.logo}
                    size="xs"
                  />
                  {leader.team.name}
                </span>
              </span>
            </span>

            {(leader.innings !== null || leader.support) && (
              <span className={styles.support}>
                {[leader.innings !== null ? `${leader.innings} inns` : null, leader.support]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
          </Link>
        ))}
      </div>

      {(leaders.fours !== null || leaders.sixes !== null) && (
        <div className={styles.foot}>
          <dl className={styles.totals}>
            {leaders.fours !== null && (
              <div>
                <dt>Tournament fours</dt>
                <dd>{leaders.fours}</dd>
              </div>
            )}
            {leaders.sixes !== null && (
              <div>
                <dt>Tournament sixes</dt>
                <dd>{leaders.sixes}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {children}
    </div>
  );
}
