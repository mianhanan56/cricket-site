'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { SeriesStatTable } from '@/types';
import Segmented from '../ui/Segmented';
import TeamBadge from '../ui/TeamBadge';
import PlayerLink from '../match/PlayerLink';
import styles from './MilestoneLeaders.module.scss';

export type MilestoneKind = 'FIFTIES' | 'HUNDREDS';

const KINDS: Array<{ value: MilestoneKind; label: string; unit: string; slug: string; none: string }> = [
  { value: 'FIFTIES', label: 'Most fifties', unit: '50s', slug: 'most-fifties', none: 'No fifties scored yet' },
  { value: 'HUNDREDS', label: 'Most hundreds', unit: '100s', slug: 'most-hundreds', none: 'No hundreds scored yet' },
];

/** Both milestone rankings arrive together; switching between them is local. */
export default function MilestoneLeaders({
  tables,
  seriesId,
}: {
  tables: Record<MilestoneKind, SeriesStatTable | null>;
  seriesId: string;
}) {
  const [kind, setKind] = useState<MilestoneKind>(tables.FIFTIES || !tables.HUNDREDS ? 'FIFTIES' : 'HUNDREDS');
  const spec = KINDS.find((k) => k.value === kind) ?? KINDS[0];
  const table = tables[kind];

  return (
    <div className={styles.wrap}>
      <Segmented
        label="Milestone ranking"
        value={kind}
        onChange={setKind}
        options={KINDS.map((k) => ({ value: k.value, label: k.label }))}
      />

      <section className={styles.card} aria-labelledby="milestone-title">
        <h4 id="milestone-title" className={styles.title}>
          {spec.label}
        </h4>

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

        {table && (
          <Link href={`/series/${seriesId}/stats/${spec.slug}`} className={styles.full}>
            Full {spec.label.toLowerCase()} ranking
          </Link>
        )}
      </section>
    </div>
  );
}
