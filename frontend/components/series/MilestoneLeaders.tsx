import Link from 'next/link';
import { ON_INTENT } from '@/lib/intentPrefetch';
import type { SeriesStatTable } from '@/types';
import TeamBadge from '../ui/TeamBadge';
import ViewAllCue from '../ui/ViewAllCue';
import PlayerLink from '../match/PlayerLink';
import styles from './MilestoneLeaders.module.scss';

export type MilestoneKind = 'FIFTIES' | 'HUNDREDS';

const KINDS: Array<{ value: MilestoneKind; label: string; unit: string; slug: string; none: string }> = [
  { value: 'FIFTIES', label: 'Most fifties', unit: '50s', slug: 'most-fifties', none: 'No fifties scored yet' },
  { value: 'HUNDREDS', label: 'Most hundreds', unit: '100s', slug: 'most-hundreds', none: 'No hundreds scored yet' },
];

/** Both milestone rankings side by side, as cards on the honours board's last row. */
export default function MilestoneLeaders({
  tables,
  seriesId,
}: {
  tables: Record<MilestoneKind, SeriesStatTable | null>;
  seriesId: string;
}) {
  return (
    <>
      {KINDS.map((spec) => {
        const table = tables[spec.value];
        const titleId = `milestone-${spec.value.toLowerCase()}`;
        return (
          <section key={spec.value} className={styles.card} aria-labelledby={titleId}>
            {table?.rows.length ? (
              <Link {...ON_INTENT}
                href={`/series/${seriesId}/stats/${spec.slug}`}
                className={styles.head}
                aria-label={`${spec.label}, full ranking`}
              >
                <h4 id={titleId} className={styles.title}>
                  {spec.label}
                </h4>
                <ViewAllCue />
              </Link>
            ) : (
              <h4 id={titleId} className={styles.title}>
                {spec.label}
              </h4>
            )}

            {table?.rows.length ? (
              <ol className={styles.list}>
                {table.rows.map((row) => (
                  <li key={row.playerKey} className={styles.row}>
                    <span className={styles.rank}>{row.rank}</span>
                    <span className={styles.who}>
                      <PlayerLink id={row.playerKey} name={row.playerName} className={styles.name} />
                      <span className={styles.team}>
                        <TeamBadge name={row.team.name} shortName={row.team.shortName} logo={row.team.logo} size="xs" />
                        <span className={styles.teamName}>{row.team.name}</span>
                      </span>
                    </span>
                    <span className={styles.value}>
                      {row.value}
                      <small>{spec.unit}</small>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.empty}>{spec.none}</p>
            )}
          </section>
        );
      })}
    </>
  );
}
