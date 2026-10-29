import Link from 'next/link';
import { ON_INTENT } from '@/lib/intentPrefetch';
import type { SeriesLeader, SeriesLeaders as Leaders, SeriesStatKind } from '@/types';
import PlayerPortrait from '../player/PlayerPortrait';
import TeamBadge from '../ui/TeamBadge';
import ViewAllCue from '../ui/ViewAllCue';
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
  return `/series/${seriesId}/stats/${STAT_SLUG[kind]}`;
}

/** One honour as a compact figure — the control center's side column. */
export function LeaderFigure({ leader, seriesId }: { leader: SeriesLeader; seriesId: string }) {
  return (
    <Link {...ON_INTENT} href={hrefFor(seriesId, leader.kind)} className={styles.figure}>
      <span className={styles.figureHead}>
        <span className={styles.figureLabel}>{leader.label}</span>
        <ViewAllCue />
      </span>
      <span className={styles.figureBody}>
        <PlayerPortrait name={leader.playerName} src={leader.playerImage} size="sm" />
        <span className={styles.who}>
          <span className={styles.name}>{leader.playerName}</span>
          <span className={styles.team}>
            <TeamBadge name={leader.team.name} shortName={leader.team.shortName} logo={leader.team.logo} size="xs" />
            {leader.team.shortName}
          </span>
        </span>
        <span className={styles.figureValue}>
          {leader.value}
          {UNIT[leader.kind] && <span className={styles.unit}>{UNIT[leader.kind]}</span>}
        </span>
      </span>
    </Link>
  );
}

/** Every four and six the tournament has seen, and what they were worth. */
function Boundaries({ fours, sixes }: { fours: number | null; sixes: number | null }) {
  const kinds = [
    fours !== null ? { unit: 'fours', label: 'Fours', count: fours, runs: fours * 4 } : null,
    sixes !== null ? { unit: 'sixes', label: 'Sixes', count: sixes, runs: sixes * 6 } : null,
  ].filter((k) => k !== null);
  const runs = kinds.reduce((n, k) => n + k.runs, 0);

  return (
    <section className={`${styles.tile} ${styles.boundaries}`} aria-labelledby="boundaries-title">
      <h4 id="boundaries-title" className={`${styles.cardLabel} ${styles.tileLabel}`}>
        Boundaries
      </h4>
      <dl className={styles.kinds}>
        {kinds.map((k) => (
          <div key={k.unit} className={styles.kind} data-kind={k.unit}>
            <dt className={styles.sr}>{k.label}</dt>
            <dd className={styles.value}>
              {k.count}
              <span className={styles.unit}>{k.unit}</span>
            </dd>
            <dd className={styles.kindRuns}>{k.runs.toLocaleString('en-GB')} runs</dd>
            {runs > 0 && (
              // Its share of the boundary runs, in twentieths; the stylesheet maps each step to a width.
              <dd className={styles.meter} aria-hidden="true">
                <span data-step={Math.round((k.runs / runs) * 20)} />
              </dd>
            )}
          </div>
        ))}
      </dl>
      <p className={styles.support}>{runs.toLocaleString('en-GB')} runs in boundaries</p>
    </section>
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
          <Link {...ON_INTENT}
            href={hrefFor(seriesId, leader.kind)}
            className={styles.card}
            data-featured={leader.kind === 'RUNS' || leader.kind === 'WICKETS' ? '' : undefined}
            key={leader.kind}
          >
            <span className={styles.cardHead}>
              <span className={styles.cardLabel}>{leader.label}</span>
              <ViewAllCue />
            </span>

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

      {(leaders.fours !== null || leaders.sixes !== null || children) && (
        <div className={styles.foot}>
          {(leaders.fours !== null || leaders.sixes !== null) && <Boundaries fours={leaders.fours} sixes={leaders.sixes} />}
          {children}
        </div>
      )}
    </div>
  );
}
