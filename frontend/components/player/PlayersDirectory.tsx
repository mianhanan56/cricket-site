'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { RankingFormat, RankingGender, RankingRole } from '@/types';
import Segmented from '../ui/Segmented';
import TeamBadge from '../ui/TeamBadge';
import EmptyState from '../ui/EmptyState';
import Icon from '../ui/Icon';
import FollowButton from '../follow/FollowButton';
import { SectionHead } from '../ui/Section';
import styles from './PlayersDirectory.module.scss';

export interface DirectoryRow {
  id: string;
  name: string;
  country: string;
  gender: RankingGender;
  role: RankingRole;
  position: number;
  format: RankingFormat;
  rating: number;
  roles: RankingRole[];
  crest: { shortName: string; logo: string | null } | null;
}

const DISCIPLINES: Array<{ role: RankingRole; title: string }> = [
  { role: 'BATTING', title: 'Batters' },
  { role: 'BOWLING', title: 'Bowlers' },
  { role: 'ALLROUNDER', title: 'All-rounders' },
];

const FORMAT_LABEL: Record<RankingFormat, string> = { TEST: 'Test', ODI: 'ODI', T20I: 'T20I' };

function countryLabel(country: string, gender: RankingGender) {
  return gender === 'WOMEN' ? country.replace(/\s+Women$/, '') : country;
}

function Row({ row }: { row: DirectoryRow }) {
  const country = countryLabel(row.country, row.gender);
  return (
    <li className={styles.row} data-top={row.position === 1 || undefined}>
      <span className={styles.pos}>
        <span className={styles.posNum}>{row.position}</span>
        <span className={styles.posFormat}>{FORMAT_LABEL[row.format]}</span>
      </span>
      <TeamBadge
        name={row.country}
        shortName={row.crest?.shortName ?? country.slice(0, 3).toUpperCase()}
        logo={row.crest?.logo}
        size="sm"
      />
      <span className={styles.who}>
        <Link href={`/players/${row.id}`} className={styles.name}>
          {row.name}
        </Link>
        <span className={styles.country}>{country}</span>
      </span>
      <span className={styles.rating}>{row.rating}</span>
      <FollowButton kind="players" entity={{ id: row.id, name: row.name }} compact className={styles.follow} />
    </li>
  );
}

export default function PlayersDirectory({ rows }: { rows: DirectoryRow[] }) {
  const [gender, setGender] = useState<RankingGender>('MEN');
  const [query, setQuery] = useState('');

  const counts = useMemo(
    () => ({
      MEN: rows.filter((r) => r.gender === 'MEN').length,
      WOMEN: rows.filter((r) => r.gender === 'WOMEN').length,
    }),
    [rows]
  );

  const groups = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const visible = rows.filter(
      (r) =>
        r.gender === gender &&
        terms.every((t) => `${r.name} ${r.country}`.toLowerCase().includes(t))
    );
    return DISCIPLINES.map((d) => ({
      ...d,
      rows: visible
        .filter((r) => r.role === d.role)
        .sort((a, b) => a.position - b.position || b.rating - a.rating),
    }));
  }, [rows, gender, query]);

  const total = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        <Segmented
          label="Gender"
          value={gender}
          onChange={setGender}
          options={[
            { value: 'MEN', label: 'Men', count: counts.MEN },
            { value: 'WOMEN', label: 'Women', count: counts.WOMEN },
          ]}
        />
        <label className={styles.search}>
          <Icon name="search" size={17} className={styles.searchIcon} />
          <span className={styles.srOnly}>Filter by name or country</span>
          <input
            type="search"
            className={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or country"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      </div>

      {total === 0 ? (
        <EmptyState
          icon="search"
          title={`No ranked player matches “${query.trim()}”`}
          action={{ label: 'Clear filter', onClick: () => setQuery('') }}
          compact
        />
      ) : (
        <div className={styles.columns}>
          {groups.map(
            (g) =>
              g.rows.length > 0 && (
                <section key={g.role} className={styles.column} aria-label={g.title}>
                  <SectionHead title={g.title} count={g.rows.length} level={3} />
                  <div className={styles.panel}>
                    <div className={styles.head} aria-hidden="true">
                      <span>Best</span>
                      <span>Player</span>
                      <span>Rating</span>
                    </div>
                    <ol className={styles.list}>
                      {g.rows.map((r) => (
                        <Row key={r.id} row={r} />
                      ))}
                    </ol>
                  </div>
                </section>
              )
          )}
        </div>
      )}
    </div>
  );
}
