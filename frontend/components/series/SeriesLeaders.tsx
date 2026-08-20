import Link from 'next/link';
import type { SeriesLeader, SeriesLeaders as Leaders } from '@/types';
import PlayerPortrait from '../player/PlayerPortrait';
import styles from './SeriesLeaders.module.scss';

/**
 * Where each honour's full ranking lives. Kept beside the rail rather than
 * imported from the route so a page module is not pulled into this component.
 */
const STAT_SLUG: Partial<Record<SeriesLeader['kind'], string>> = {
  RUNS: 'most-runs',
  WICKETS: 'most-wickets',
  HIGHEST_SCORE: 'highest-score',
  BEST_FIGURES: 'best-figures',
  SIXES: 'most-sixes',
  FOURS: 'most-fours',
  STRIKE_RATE: 'best-strike-rate',
  ECONOMY: 'best-economy',
};

/**
 * What the rail shows, in the order a cricket follower asks for it. Every one of
 * these has a ranking page behind it; the two crex sends that do not — dot balls
 * and fantasy points — are left off rather than made into dead cards.
 */
const RAIL_ORDER = [
  'RUNS',
  'WICKETS',
  'HIGHEST_SCORE',
  'BEST_FIGURES',
  'SIXES',
  'FOURS',
  'STRIKE_RATE',
  'ECONOMY',
] as const;

/** The unit that belongs under each headline figure. Null where the figure is one. */
const UNIT: Partial<Record<SeriesLeader['kind'], string>> = {
  RUNS: 'runs',
  WICKETS: 'wickets',
  SIXES: 'sixes',
  FOURS: 'fours',
  DOTS: 'dot balls',
  FANTASY: 'points',
};

/**
 * The tournament's honours, as cards in the page's right rail.
 *
 * The rail fills the column beside a table that does not reach the edge of a
 * laptop screen, and answers "who is leading this" without a tab. Each card is
 * a door: it opens that honour's full ranking — the top ten, with the innings,
 * average and strike rate behind the figure — at /series/[id]/stats/[kind].
 *
 * Runs and wickets keep the amber and violet tint; the rest are mint, because
 * the two that decide a tournament should be the two that are coloured.
 */
export function SeriesKeyStats({
  leaders,
  seriesId,
}: {
  leaders: Leaders;
  /** crex series key, for the ranking page each card opens. */
  seriesId: string;
}) {
  const shown = RAIL_ORDER.map((kind) => leaders.leaders.find((l) => l.kind === kind)).filter(
    (l): l is SeriesLeader => Boolean(l)
  );

  if (!shown.length) return null;

  return (
    <div className={styles.rail}>
      <div className={styles.railHead}>
        <h2 className={styles.railTitle}>Key stats</h2>
        <span className={styles.railHint}>Tap for the top 10</span>
      </div>

      {shown.map((leader) => (
        <Link
          href={`/series/${seriesId}/stats/${STAT_SLUG[leader.kind]}`}
          className={styles.railCard}
          data-kind={leader.kind}
          key={leader.kind}
        >
          <span className={styles.railLabel}>{leader.label}</span>

          <span className={styles.railBody}>
            <span className={styles.railHalo}>
              <PlayerPortrait name={leader.playerName} src={leader.playerImage} size="sm" />
            </span>

            <span className={styles.railWho}>
              <span className={styles.railName}>{leader.playerName}</span>
              <span className={styles.railTeam}>{leader.team.name}</span>
            </span>

            <span className={styles.railFigure}>
              {leader.value}
              {UNIT[leader.kind] && <span className={styles.railUnit}>{UNIT[leader.kind]}</span>}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
