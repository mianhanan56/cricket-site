'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { RankingGender, RankingRole } from '@/types';
import { useQueryTabs } from '@/hooks/useQueryTabs';
import {
  RANKING_FORMAT_LABEL,
  filterDirectory,
  type DirectoryItem,
  type DirectoryRow,
} from '@/lib/playersDirectory';
import type { PlayersFormatKey, PlayersRoleKey, RankingsGender } from '@/lib/tabs';
import Segmented, { type SegmentOption } from '../ui/Segmented';
import FilterSheet from '../ui/FilterSheet';
import TeamBadge from '../ui/TeamBadge';
import EmptyState from '../ui/EmptyState';
import Icon from '../ui/Icon';
import FollowButton from '../follow/FollowButton';
import { SectionHead } from '../ui/Section';
import styles from './PlayersDirectory.module.scss';

type Filters = { gender: RankingsGender; role: PlayersRoleKey; format: PlayersFormatKey };

const DEFAULTS: Filters = { gender: 'men', role: 'all', format: 'all' };

// An ICC list is ten deep, so one format's section never needs the button.
const BATCH = 10;

const ROLES: readonly SegmentOption<PlayersRoleKey>[] = [
  { value: 'all', label: 'All' },
  { value: 'batting', label: 'Batters' },
  { value: 'bowling', label: 'Bowlers' },
  { value: 'all-rounder', label: 'All-rounders' },
];

const FORMATS: readonly SegmentOption<PlayersFormatKey>[] = [
  { value: 'all', label: 'All' },
  { value: 'test', label: 'Test' },
  { value: 'odi', label: 'ODI' },
  { value: 't20i', label: 'T20I' },
];

const ROLE_TITLE: Record<RankingRole, string> = {
  BATTING: 'Batters',
  BOWLING: 'Bowlers',
  ALLROUNDER: 'All-rounders',
};

function countryLabel(country: string, gender: RankingGender) {
  return gender === 'WOMEN' ? country.replace(/\s+Women$/, '') : country;
}

function emptyTitle({ gender, role, format }: Filters, query: string) {
  const who = [
    gender === 'women' ? "women's" : "men's",
    FORMATS.find((f) => f.value === format && f.value !== 'all')?.label,
    role === 'all' ? 'players' : ROLES.find((r) => r.value === role)?.label.toLowerCase(),
  ]
    .filter(Boolean)
    .join(' ');
  const term = query.trim();
  return term ? `No ${who} match “${term}”` : `No ${who} are ranked`;
}

function Row({ item }: { item: DirectoryItem }) {
  const { row, best, others } = item;
  const country = countryLabel(row.country, row.gender);
  return (
    <li className={styles.row} data-top={best.position === 1 || undefined}>
      <span className={styles.rank}>
        <span className={styles.srOnly}>Rank </span>
        <span className={styles.rankNum}>{best.position}</span>
        <span className={styles.rankFormat}>{RANKING_FORMAT_LABEL[best.format]}</span>
      </span>
      <TeamBadge
        name={row.country}
        shortName={row.crest?.shortName ?? country.slice(0, 3).toUpperCase()}
        logo={row.crest?.logo}
        size="sm"
        className={styles.crest}
      />
      <span className={styles.who}>
        <Link href={`/players/${row.id}`} className={styles.name}>
          {row.name}
        </Link>
        <span className={styles.meta}>
          <span className={styles.country}>{country}</span>
          {others.length > 0 && (
            <span className={styles.others}>
              {others.map((o) => (
                <span key={o.format} className={styles.other}>
                  {RANKING_FORMAT_LABEL[o.format]} <span className={styles.otherPos}>#{o.position}</span>
                </span>
              ))}
            </span>
          )}
        </span>
      </span>
      <span className={styles.rating}>{best.rating}</span>
      <FollowButton kind="players" entity={{ id: row.id, name: row.name }} compact className={styles.follow} />
    </li>
  );
}

export default function PlayersDirectory({ rows, initial }: { rows: DirectoryRow[]; initial: Filters }) {
  const [filters, setQuery] = useQueryTabs(initial, DEFAULTS);
  const { gender, role, format } = filters;
  // Kept out of the URL: a server round trip per keystroke would fight the input.
  const [query, setSearch] = useState('');

  const counts = useMemo(
    () => ({
      men: rows.filter((r) => r.gender === 'MEN').length,
      women: rows.filter((r) => r.gender === 'WOMEN').length,
    }),
    [rows]
  );

  const sections = useMemo(
    () => filterDirectory(rows, { gender, role, format, query }),
    [rows, gender, role, format, query]
  );

  // How far each section has been opened, for this exact view — a new filter or search starts over.
  const view = `${gender}|${role}|${format}|${query.trim().toLowerCase()}`;
  const [opened, setOpened] = useState<{ view: string; by: Partial<Record<RankingRole, number>> }>({ view, by: {} });
  // Cleared, not just ignored: coming back to an earlier view must not reopen it.
  if (opened.view !== view) setOpened({ view, by: {} });
  const by = opened.view === view ? opened.by : {};
  const shownFor = (r: RankingRole) => by[r] ?? BATCH;
  const loadMore = (r: RankingRole) => setOpened({ view, by: { ...by, [r]: shownFor(r) + BATCH } });

  const formats = gender === 'women' ? FORMATS.filter((f) => f.value !== 'test') : FORMATS;
  const changeGender = (g: RankingsGender) =>
    setQuery(g === 'women' && format === 'test' ? { gender: g, format: 'all' } : { gender: g });

  const clear = () => {
    setSearch('');
    setQuery({ role: 'all', format: 'all' });
  };

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        <div className={styles.filters}>
          <Segmented
            label="Gender"
            value={gender}
            onChange={changeGender}
            options={[
              { value: 'men', label: 'Men', count: counts.men },
              { value: 'women', label: 'Women', count: counts.women },
            ]}
          />
          <Segmented
            label="Role"
            value={role}
            onChange={(r) => setQuery({ role: r })}
            options={ROLES}
          />
          <Segmented
            label="Format"
            value={format}
            onChange={(f) => setQuery({ format: f })}
            options={formats}
          />
        </div>
        <label className={styles.search}>
          <Icon name="search" size={17} className={styles.searchIcon} />
          <span className={styles.srOnly}>Filter by name or country</span>
          <input
            type="search"
            className={styles.input}
            value={query}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or country"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <FilterSheet
          groups={(d) => [
            {
              key: 'gender',
              label: 'Gender',
              options: [
                { value: 'men', label: 'Men', count: counts.men },
                { value: 'women', label: 'Women', count: counts.women },
              ],
            },
            { key: 'role', label: 'Role', options: ROLES },
            { key: 'format', label: 'Format', options: d.gender === 'women' ? FORMATS.filter((f) => f.value !== 'test') : FORMATS },
          ]}
          value={filters}
          defaults={DEFAULTS}
          normalize={(d) => (d.gender === 'women' && d.format === 'test' ? { ...d, format: 'all' as const } : d)}
          onApply={(next) => setQuery(next)}
        />
      </div>

      {sections.length === 0 ? (
        <EmptyState
          icon="search"
          title={emptyTitle(filters, query)}
          action={{ label: 'Clear filters', onClick: clear }}
          compact
        />
      ) : (
        <div className={styles.sections}>
          {sections.map((s) => (
            <section key={s.role} aria-label={ROLE_TITLE[s.role]}>
              <SectionHead title={ROLE_TITLE[s.role]} count={s.items.length} level={3} />
              <div className={styles.panel} data-format={format === 'all' ? undefined : format}>
                <div className={styles.head} aria-hidden="true">
                  <span>Rank</span>
                  <span>Player</span>
                  <span className={styles.headCountry}>Country</span>
                  <span className={styles.headOthers}>Other formats</span>
                  <span className={styles.headRating}>Rating</span>
                </div>
                <ol className={styles.list}>
                  {s.items.slice(0, shownFor(s.role)).map((item) => (
                    <Row key={item.row.id} item={item} />
                  ))}
                </ol>
              </div>
              {s.items.length > shownFor(s.role) && (
                <button type="button" className={styles.more} onClick={() => loadMore(s.role)}>
                  Load more {ROLE_TITLE[s.role].toLowerCase()}
                  <span className={styles.moreCount}>
                    {shownFor(s.role)} of {s.items.length}
                  </span>
                </button>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
