'use client';

import Link from 'next/link';
import type { RankingEntry, TeamRankingEntry } from '@/types';
import { useQueryTabs } from '@/hooks/useQueryTabs';
import type {
  RankingsCategory as Category,
  RankingsFormat as Format,
  RankingsGender as Gender,
  RankingsGroup as Group,
} from '@/lib/tabs';
import type { RankingsData, TeamRankingsData } from '@/lib/rankings';
import { PageHeader } from '../ui/Section';
import Segmented, { type SegmentOption } from '../ui/Segmented';
import FilterSheet from '../ui/FilterSheet';
import EmptyState from '../ui/EmptyState';
import RankingCrest from './RankingCrest';
import styles from './RankingsView.module.scss';

const GROUPS: readonly SegmentOption<Group>[] = [
  { value: 'players', label: 'Players' },
  { value: 'teams', label: 'Teams' },
];

const GENDERS: readonly SegmentOption<Gender>[] = [
  { value: 'men', label: 'Men' },
  { value: 'women', label: 'Women' },
];

const FORMATS: readonly SegmentOption<Format>[] = [
  { value: 'test', label: 'Test' },
  { value: 'odi', label: 'ODI' },
  { value: 't20i', label: 'T20I' },
];

const CATEGORIES: readonly SegmentOption<Category>[] = [
  { value: 'batting', label: 'Batting' },
  { value: 'bowling', label: 'Bowling' },
  { value: 'all-rounder', label: 'All-rounder' },
];

interface Row {
  id: string;
  position: number;
  title: string;
  /** Country for a player; matches and points for a team, on the phone line. */
  meta: string;
  country?: string;
  rating: number;
  /** Places gained. Undefined when the source has no previous position. */
  movement?: number;
  crest?: { logo: string | null; shortName: string };
  matches?: number;
  points?: number;
  href?: string;
}

const num = (n: number) => n.toLocaleString('en-US');

const toPlayerRow = (e: RankingEntry): Row => ({
  id: e.id,
  position: e.position,
  title: e.playerName,
  meta: e.country,
  country: e.country,
  rating: e.rating,
  movement: typeof e.previousPosition === 'number' ? e.previousPosition - e.position : undefined,
  href: e.playerKey ? `/players/${e.playerKey}` : undefined,
});

const toTeamRow = (e: TeamRankingEntry): Row => ({
  id: e.id,
  position: e.position,
  title: e.teamName,
  meta: `${e.matches} ${e.matches === 1 ? 'match' : 'matches'} · ${num(e.points)} pts`,
  rating: e.rating,
  crest: { logo: e.logo, shortName: e.shortName },
  matches: e.matches,
  points: e.points,
  href: e.teamKey ? `/teams/${e.teamKey}` : undefined,
});

function Movement({ places }: { places: number | undefined }) {
  if (places === undefined) return null;

  if (places === 0) {
    return (
      <span className={styles.move} data-dir="flat">
        <span aria-hidden="true">–</span>
        <span className={styles.srOnly}>No change</span>
      </span>
    );
  }

  const up = places > 0;
  const n = Math.abs(places);
  return (
    <span className={styles.move} data-dir={up ? 'up' : 'down'}>
      <span aria-hidden="true">
        {up ? '▲' : '▼'} {up ? '+' : '−'}
        {n}
      </span>
      <span className={styles.srOnly}>{`${n} place${n === 1 ? '' : 's'} ${up ? 'up' : 'down'}`}</span>
    </span>
  );
}

function RatingBar({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(1, (value / max) * 100)) : 0;
  return (
    <svg
      className={`${styles.bar} ${className ?? ''}`}
      viewBox="0 0 100 4"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect className={styles.barTrack} width="100" height="4" />
      <rect className={styles.barFill} width={pct.toFixed(2)} height="4" />
    </svg>
  );
}

function Name({ row, className }: { row: Row; className: string }) {
  return row.href ? (
    <Link href={row.href} className={`${className} ${styles.stretch}`}>
      {row.title}
    </Link>
  ) : (
    <span className={className}>{row.title}</span>
  );
}

export interface RankingsViewProps {
  data: RankingsData;
  teams: TeamRankingsData;
  /** ICC publication date per gender — only present on the bundled fallback. */
  asOf?: Partial<Record<Gender, string>>;
  initial: { group: Group; format: Format; gender: Gender; category: Category };
}

const PODIUM = 3;

export default function RankingsView({ data, teams, asOf, initial }: RankingsViewProps) {
  const [{ group, format, gender, category }, setQuery] = useQueryTabs(initial, {
    group: 'players',
    format: 'odi',
    gender: 'men',
    category: 'batting',
  });

  // The ICC publishes no Women's Test rankings.
  const formats = gender === 'women' ? FORMATS.filter((f) => f.value !== 'test') : FORMATS;
  const changeGender = (g: Gender) =>
    setQuery(g === 'women' && format === 'test' ? { gender: g, format: 'odi' } : { gender: g });

  const isTeams = group === 'teams';
  const rows: Row[] = isTeams
    ? (teams[format]?.[gender] ?? []).map(toTeamRow)
    : (data[format]?.[gender]?.[category] ?? []).map(toPlayerRow);

  const formatLabel = FORMATS.find((f) => f.value === format)?.label ?? '';
  const categoryLabel = CATEGORIES.find((c) => c.value === category)?.label ?? '';
  const title = `${gender === 'women' ? "Women's" : "Men's"} ${formatLabel} ${isTeams ? 'Teams' : categoryLabel}`;
  const top = rows.length ? Math.max(...rows.map((r) => r.rating)) : 0;
  const podium = rows.slice(0, PODIUM);
  const rest = rows.slice(PODIUM);
  const listKey = `${group}-${format}-${gender}-${category}`;

  return (
    <div className={styles.page}>
      <PageHeader eyebrow="ICC Rankings" title={title}>
        {asOf?.[gender] && <p className={styles.asOf}>As of {asOf[gender]}</p>}
      </PageHeader>

      <div className={styles.controls}>
        <Segmented label="Ranking" value={group} options={GROUPS} onChange={(g) => setQuery({ group: g })} />
        <Segmented label="Gender" value={gender} options={GENDERS} onChange={changeGender} />
        <Segmented label="Format" value={format} options={formats} onChange={(f) => setQuery({ format: f })} />
        {!isTeams && (
          <Segmented
            label="Discipline"
            value={category}
            options={CATEGORIES}
            onChange={(c) => setQuery({ category: c })}
          />
        )}
      </div>

      <FilterSheet
        groups={(d) => [
          { key: 'group', label: 'Ranking', options: GROUPS },
          { key: 'gender', label: 'Gender', options: GENDERS },
          { key: 'format', label: 'Format', options: d.gender === 'women' ? FORMATS.filter((f) => f.value !== 'test') : FORMATS },
          ...(d.group === 'teams' ? [] : [{ key: 'category', label: 'Discipline', options: CATEGORIES }]),
        ]}
        value={{ group, gender, format, category }}
        defaults={{ group: 'players', gender: 'men', format: 'odi', category: 'batting' }}
        normalize={(d) => (d.gender === 'women' && d.format === 'test' ? { ...d, format: 'odi' as const } : d)}
        onApply={(next) => setQuery(next)}
        chips={false}
        className={styles.mobileFilter}
      />

      {rows.length ? (
        <div key={listKey} className={styles.board}>
          <ol className={styles.podium} aria-label={`${title}, top ${podium.length}`}>
            {podium.map((row, i) => (
              <li key={row.id} className={styles.step} data-lead={i === 0 ? '' : undefined}>
                <div className={styles.stepTop}>
                  <span className={styles.stepPos}>
                    <span className={styles.srOnly}>Rank </span>
                    {row.position}
                  </span>
                  <Movement places={row.movement} />
                  {row.crest && (
                    <span className={styles.stepCrest}>
                      <RankingCrest
                        name={row.title}
                        shortName={row.crest.shortName}
                        logo={row.crest.logo}
                        size={i === 0 ? 'lg' : 'sm'}
                      />
                    </span>
                  )}
                </div>

                <div className={styles.stepBody}>
                  <Name row={row} className={styles.stepName} />
                  <span className={styles.stepMeta}>{row.meta}</span>
                </div>

                <div className={styles.stepFigures}>
                  <span className={styles.stepRating}>
                    {row.rating}
                    <span className={styles.stepLabel}>Rating</span>
                  </span>
                  {i > 0 && (
                    <span className={styles.stepGap}>
                      <span className={styles.srOnly}>Behind the leader by </span>
                      {row.rating - top === 0 ? '0' : `−${top - row.rating}`}
                    </span>
                  )}
                </div>
                <RatingBar value={row.rating} max={top} className={styles.stepBar} />
              </li>
            ))}
          </ol>

          {rest.length > 0 && (
            <div className={styles.table} data-group={group}>
              <div className={`${styles.row} ${styles.head}`} aria-hidden="true">
                <span className={styles.cPos}>#</span>
                {!isTeams && <span className={styles.cMove}>Move</span>}
                <span className={styles.cMain}>{isTeams ? 'Team' : 'Player'}</span>
                {isTeams ? (
                  <>
                    <span className={styles.cNum}>Matches</span>
                    <span className={styles.cNum2}>Points</span>
                  </>
                ) : (
                  <span className={styles.cCountry}>Country</span>
                )}
                <span className={styles.cGap}>Gap</span>
                <span className={styles.cBar} />
                <span className={styles.cRating}>Rating</span>
              </div>

              <ol className={styles.rows} aria-label={`${title}, positions ${rest[0].position} to ${rest[rest.length - 1].position}`}>
                {rest.map((row) => (
                  <li key={row.id} className={styles.row}>
                    <span className={styles.cPos}>
                      <span className={styles.srOnly}>Rank </span>
                      {row.position}
                    </span>
                    {!isTeams && (
                      <span className={styles.cMove}>
                        <Movement places={row.movement} />
                      </span>
                    )}
                    <span className={styles.cMain}>
                      {row.crest && (
                        <RankingCrest name={row.title} shortName={row.crest.shortName} logo={row.crest.logo} />
                      )}
                      <span className={styles.nameStack}>
                        <Name row={row} className={styles.name} />
                        <span className={styles.meta}>{row.meta}</span>
                      </span>
                    </span>
                    {isTeams ? (
                      <>
                        <span className={styles.cNum}>
                          <span className={styles.srOnly}>Matches </span>
                          {row.matches}
                        </span>
                        <span className={styles.cNum2}>
                          <span className={styles.srOnly}>Points </span>
                          {row.points !== undefined ? num(row.points) : ''}
                        </span>
                      </>
                    ) : (
                      <span className={styles.cCountry}>{row.country}</span>
                    )}
                    <span className={styles.cGap}>
                      <span className={styles.srOnly}>Behind the leader by </span>−{top - row.rating}
                    </span>
                    <span className={styles.cBar}>
                      <RatingBar value={row.rating} max={top} />
                    </span>
                    <span className={styles.cRating}>
                      <span className={styles.srOnly}>Rating </span>
                      {row.rating}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          icon="rankings"
          title={`No ${isTeams ? 'team' : 'player'} rankings for this list`}
          action={{ label: "Show men's ODI", onClick: () => setQuery({ gender: 'men', format: 'odi' }) }}
        />
      )}
    </div>
  );
}
