'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { DirectoryTeam } from '@/lib/directory';
import { PageHeader, SectionHead } from '@/components/ui/Section';
import TeamBadge from '@/components/ui/TeamBadge';
import EmptyState from '@/components/ui/EmptyState';
import Icon from '@/components/ui/Icon';
import FollowButton from '@/components/follow/FollowButton';
import styles from './teams.module.scss';

function TeamTile({ team }: { team: DirectoryTeam }) {
  return (
    <li className={styles.tile}>
      <Link href={`/teams/${team.id}`} className={styles.tileLink}>
        <TeamBadge name={team.name} shortName={team.shortName} logo={team.logo} size="md" />
        <span className={styles.tileText}>
          <span className={styles.name}>{team.name}</span>
          <span className={styles.short}>{team.shortName}</span>
        </span>
        <span className={styles.best}>
          <span className={styles.srOnly}>Best ICC ranking: </span>
          <span className={styles.bestPos}>#{team.best.position}</span>
          <span className={styles.bestFmt}>{team.best.format}</span>
        </span>
      </Link>
      <FollowButton
        kind="teams"
        compact
        className={styles.follow}
        entity={{ id: team.id, name: team.name, shortName: team.shortName, logo: team.logo }}
      />
    </li>
  );
}

export default function TeamsDirectory({ men, women }: { men: DirectoryTeam[]; women: DirectoryTeam[] }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const groups = useMemo(() => {
    const match = (t: DirectoryTeam) =>
      !q || t.name.toLowerCase().includes(q) || t.shortName.toLowerCase().includes(q);
    return [
      { key: 'men', title: 'Men', teams: men.filter(match) },
      { key: 'women', title: 'Women', teams: women.filter(match) },
    ].filter((g) => g.teams.length);
  }, [men, women, q]);

  const total = men.length + women.length;

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Teams"
        title="International teams"
        aside={
          total > 0 && (
            <label className={styles.filter}>
              <Icon name="search" size={16} />
              <span className={styles.srOnly}>Filter teams by name</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter teams"
                autoComplete="off"
                spellCheck={false}
                className={styles.filterInput}
              />
            </label>
          )
        }
      />

      {total === 0 ? (
        <EmptyState icon="teams" title="No teams to show" action={{ label: 'Open rankings', href: '/rankings' }} />
      ) : groups.length === 0 ? (
        <EmptyState
          icon="search"
          compact
          title={`No teams match “${query.trim()}”`}
          action={{ label: 'Clear filter', onClick: () => setQuery('') }}
        />
      ) : (
        groups.map((g) => (
          <section key={g.key} className={styles.section} aria-labelledby={`teams-${g.key}`}>
            <SectionHead id={`teams-${g.key}`} title={g.title} count={g.teams.length} />
            <ul className={styles.grid}>
              {g.teams.map((t) => (
                <TeamTile team={t} key={t.id} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
