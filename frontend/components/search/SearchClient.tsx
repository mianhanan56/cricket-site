'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Match } from '@/types';
import { searchMatches } from '@/lib/search';
import {
  buildIndex,
  loadRemoteIndex,
  querySearch,
  type EntityType,
  type RemoteIndex,
  type SearchEntity,
} from '@/lib/searchIndex';
import { PageHeader, SectionHead } from '../ui/Section';
import EmptyState from '../ui/EmptyState';
import Icon, { type IconName } from '../ui/Icon';
import TeamBadge from '../ui/TeamBadge';
import MatchTile from '../match/MatchTile';
import UpcomingRail from '../home/UpcomingRail';
import ResultList from '../home/ResultList';
import { SearchResultsSkeleton } from './SearchSkeleton';
import styles from '../../app/search/search.module.scss';

const ENTITY_GROUPS: Array<{ type: Exclude<EntityType, 'match'>; title: string; icon: IconName }> = [
  { type: 'player', title: 'Players', icon: 'player' },
  { type: 'team', title: 'Teams', icon: 'teams' },
  { type: 'series', title: 'Series', icon: 'trophy' },
  { type: 'venue', title: 'Venues', icon: 'pin' },
];

function EntityLink({ entity, icon }: { entity: SearchEntity; icon: IconName }) {
  return (
    <Link href={entity.href} className={styles.entity}>
      <span className={styles.entityIcon}>
        {entity.type === 'team' ? (
          <TeamBadge name={entity.label} shortName={entity.sub} logo={entity.logo} size="sm" />
        ) : (
          <Icon name={icon} size={17} />
        )}
      </span>
      <span className={styles.entityText}>
        <span className={styles.entityLabel}>{entity.label}</span>
        {entity.sub && entity.type !== 'venue' && <span className={styles.entitySub}>{entity.sub}</span>}
      </span>
      <Icon name="arrowRight" size={16} className={styles.entityArrow} />
    </Link>
  );
}

export default function SearchClient() {
  const router = useRouter();
  const params = useSearchParams();
  const urlQuery = params.get('q') ?? '';
  const inputRef = useRef<HTMLInputElement>(null);

  const [q, setQ] = useState(urlQuery);
  const [results, setResults] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [index, setIndex] = useState<RemoteIndex | null>(null);

  // Adopt ?q= whenever it changes underneath (Back/Forward, a navbar search while already here).
  useEffect(() => setQ(urlQuery), [urlQuery]);

  useEffect(() => {
    loadRemoteIndex().then(setIndex);
  }, []);

  useEffect(() => {
    const term = q.trim();

    if (term.length < 2) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      if (!term && urlQuery) router.replace('/search', { scroll: false });
      return;
    }
    setLoading(true);

    // Only the newest query may write — a slow earlier request must not overwrite it.
    let current = true;

    const t = setTimeout(async () => {
      // replace, not push: Back should leave search, not walk through every keystroke.
      if (term !== urlQuery) router.replace(`/search?q=${encodeURIComponent(term)}`, { scroll: false });

      let found: Match[] = [];
      try {
        found = await searchMatches(term, 30);
      } catch {
        found = [];
      }
      if (!current) return;
      setResults(found);
      setLoading(false);
      setSearched(true);
    }, 300);

    return () => {
      current = false;
      clearTimeout(t);
    };
  }, [q, urlQuery, router]);

  const term = q.trim();

  const entities = useMemo(() => {
    if (!searched || term.length < 2) return [];
    return querySearch(buildIndex(results, index), term, 6).filter((e) => e.type !== 'match');
  }, [results, index, term, searched]);

  const live = results.filter((m) => m.status === 'LIVE');
  const upcoming = results.filter((m) => m.status === 'UPCOMING');
  const finished = results.filter((m) => m.status === 'COMPLETED');
  const nothing = searched && !loading && !results.length && !entities.length;

  return (
    <div className={styles.page}>
      <PageHeader eyebrow="Search" title={term.length >= 2 ? `“${term}”` : 'Search cricket'} />

      <div className={styles.field}>
        <Icon name="search" size={20} className={styles.fieldIcon} />
        <label htmlFor="search-page-input" className={styles.srOnly}>
          Search matches, teams, players, series and venues
        </label>
        <input
          id="search-page-input"
          ref={inputRef}
          className={styles.input}
          type="search"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder="Search players, teams, series or matches"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {q && (
          <button
            type="button"
            className={styles.clear}
            aria-label="Clear search"
            onClick={() => {
              setQ('');
              inputRef.current?.focus();
            }}
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      {loading && (
        <div role="status" aria-busy="true" aria-label={`Searching for ${term}`}>
          <SearchResultsSkeleton rows={4} />
        </div>
      )}

      {!loading && nothing && (
        <EmptyState
          icon="search"
          title="No results found"
          body={`Nothing matches “${term}”. Try a different name, team or series.`}
          action={{ label: 'Browse fixtures', href: '/fixtures' }}
          secondary={{ label: 'Ranked players', href: '/players' }}
        />
      )}

      {!loading && !searched && !term && (
        <EmptyState
          icon="search"
          title="Search players, teams, series or matches"
          action={{ label: 'Browse fixtures', href: '/fixtures' }}
          secondary={{ label: 'Ranked players', href: '/players' }}
          compact
        />
      )}

      {!loading && searched && (
        <div className={styles.results}>
          {entities.length > 0 && (
            <div className={styles.entities}>
              {ENTITY_GROUPS.map((g) => {
                const items = entities.filter((e) => e.type === g.type);
                if (!items.length) return null;
                return (
                  <section key={g.type} className={styles.entityGroup} aria-label={g.title}>
                    <SectionHead title={g.title} count={items.length} level={3} />
                    <div className={styles.entityList}>
                      {items.map((e) => (
                        <EntityLink key={`${e.type}-${e.id}`} entity={e} icon={g.icon} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {live.length > 0 && (
            <section>
              <SectionHead title="Live" count={live.length} />
              <div className={styles.tiles}>
                {live.map((m) => (
                  <MatchTile key={m.id} match={m} />
                ))}
              </div>
            </section>
          )}

          {(upcoming.length > 0 || finished.length > 0) && (
            <div className={styles.split}>
              {upcoming.length > 0 && (
                <section className={styles.col}>
                  <SectionHead title="Upcoming" count={upcoming.length} />
                  <UpcomingRail matches={upcoming} />
                </section>
              )}
              {finished.length > 0 && (
                <section className={styles.col}>
                  <SectionHead title="Results" count={finished.length} />
                  <ResultList matches={finished} />
                </section>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
