'use client';

import { useMemo, useState } from 'react';
import type { Match } from '@/types';
import { useCrexMatches } from '@/hooks/useCrexMatches';
import { useFixturesAhead } from '@/hooks/useFixturesAhead';
import { useSeriesTotals } from '@/hooks/useSeriesTotals';
import { useQueryTabs } from '@/hooks/useQueryTabs';
import {
  MATCH_TYPE_KEY_OPTIONS,
  MATCH_TYPE_OPTIONS,
  filterByMatchType,
  matchTypeKey,
  parseMatchType,
  type MatchType,
  type MatchTypeKey,
} from '@/lib/matchType';
import type { HomeTab } from '@/lib/tabs';
import { rankLive } from '@/lib/featured';
import { isLiveNow } from '@/lib/matchState';
import { useFollows } from '@/lib/follows';
import { seriesFromMatches } from '@/lib/crex';
import { SeriesList } from '../series/SeriesFilter';
import LiveHero from './LiveHero';
import NextUpHero from './NextUpHero';
import ScoreTicker from './ScoreTicker';
import UpcomingRail from './UpcomingRail';
import ResultList from './ResultList';
import MyCricketBand from './MyCricketBand';
import MatchTile from '../match/MatchTile';
import Segmented from '../ui/Segmented';
import FilterSheet from '../ui/FilterSheet';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import { SectionHead } from '../ui/Section';
import { HeroSkeleton, BoardSkeleton } from './HomeSkeleton';
import styles from './HomeMatches.module.scss';

const FINISHED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const SERIES_PREVIEW = 4;

export interface HomeMatchesProps {
  /** Active tab from the URL; '' means none picked yet. */
  initialTab: HomeTab | '';
  initialType: MatchTypeKey;
}

export default function HomeMatches({ initialTab, initialType }: HomeMatchesProps) {
  const { matches, isLoading, error, refresh, isRefreshing } = useCrexMatches();
  const follows = useFollows();
  const [{ tab: picked, type: typeKey }, setQuery] = useQueryTabs(
    { tab: initialTab, type: initialType },
    { type: 'all' }
  );
  const type = parseMatchType(typeKey);
  const [featuredId, setFeaturedId] = useState<string | null>(null);

  const scoped = useMemo(() => filterByMatchType(matches, type), [matches, type]);
  const ahead = useFixturesAhead();

  // The tab, its count, the ticker and the stage share one list; a Test at stumps is in All only.
  const liveList = useMemo(
    () =>
      rankLive(
        scoped.filter(isLiveNow),
        new Set(follows.teams.map((t) => t.id))
      ),
    [scoped, follows.teams]
  );

  // Schedule rows the feed has no copy of, up to the last one read — that day is only partly read.
  const missing = useMemo(() => {
    const inFeed = new Set(matches.map((m) => m.id));
    const lastRead = Math.max(0, ...ahead.map((f) => +new Date(f.startTime)));
    return filterByMatchType(
      ahead.filter((f) => f.status === 'UPCOMING' && !inFeed.has(f.id) && +new Date(f.startTime) < lastRead),
      type
    );
  }, [matches, ahead, type]);

  const { upcomingList, finishedList } = useMemo(() => {
    const now = Date.now();
    return {
      upcomingList: [...scoped.filter((m) => m.status === 'UPCOMING'), ...missing].sort(
        (a, b) => +new Date(a.startTime) - +new Date(b.startTime)
      ),
      finishedList: scoped
        .filter((m) => m.status === 'COMPLETED' && now - +new Date(m.startTime) <= FINISHED_WINDOW_MS)
        .sort((a, b) => +new Date(b.startTime) - +new Date(a.startTime)),
    };
  }, [scoped, missing]);

  // The stage holds its match until the reader picks another or it stops being live: a re-rank
  // (a break, a wicket elsewhere) must not swap the card being read.
  const featured = liveList.find((m) => m.id === featuredId) ?? liveList[0] ?? null;
  if (featured && featured.id !== featuredId) setFeaturedId(featured.id);

  // With nothing live the page still has a job: the competitions under way.
  const ongoingSeries = useMemo(
    () => (featured ? [] : seriesFromMatches(scoped).filter((s) => s.status === 'LIVE').slice(0, SERIES_PREVIEW)),
    [featured, scoped]
  );
  const seriesTotals = useSeriesTotals(ongoingSeries, matches);

  const allList = useMemo(() => {
    const rank: Record<Match['status'], number> = { LIVE: 0, UPCOMING: 1, COMPLETED: 2 };
    return [...scoped, ...missing].sort(
      (a, b) =>
        rank[a.status] - rank[b.status] ||
        (a.status === 'UPCOMING'
          ? +new Date(a.startTime) - +new Date(b.startTime)
          : +new Date(b.startTime) - +new Date(a.startTime))
    );
  }, [scoped, missing]);

  // With no tab in the URL, open on what's happening: live if anything is, else what's next.
  // Fixed once the feed first answers, so a match ending doesn't pull the page to another tab.
  const [landing, setLanding] = useState<HomeTab | null>(null);
  if (!landing && matches.length) setLanding(liveList.length ? 'live' : upcomingList.length ? 'upcoming' : 'all');
  const tab: HomeTab = picked || landing || 'live';
  const setTab = (next: HomeTab) => setQuery({ tab: next });

  const typeNote = type === 'ALL' ? '' : `${type.toLowerCase()} `;
  const hasData = matches.length > 0;
  // Before the feed answers there is nothing to count, and 0 would read as a fact.
  const count = (n: number) => (hasData || (!isLoading && !error) ? n : undefined);

  return (
    <>
      <div className={styles.stage}>
        {isLoading && !hasData ? (
          <HeroSkeleton />
        ) : error && !hasData ? (
          <ErrorState onRetry={refresh} retrying={isRefreshing} />
        ) : featured ? (
          <>
            {liveList.length > 1 && (
              <ScoreTicker matches={liveList} activeId={featured.id} onSelect={setFeaturedId} />
            )}
            <LiveHero key={featured.id} match={featured} />
          </>
        ) : upcomingList[0] ? (
          <NextUpHero match={upcomingList[0]} />
        ) : (
          <EmptyState
            icon="live"
            title={`No ${typeNote}cricket on right now`}
          />
        )}
      </div>

      <MyCricketBand matches={matches} />

      <section className={styles.board} aria-labelledby="board-title">
        <div className={styles.boardHead}>
          <h2 id="board-title" className={styles.boardTitle}>
            Matches
          </h2>
          <Segmented
            label="Match type"
            size="sm"
            value={type}
            options={MATCH_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            onChange={(next: MatchType) => setQuery({ type: matchTypeKey(next) })}
            className={styles.typeFilter}
          />
          <FilterSheet
            groups={() => [{ key: 'type', label: 'Competition', options: MATCH_TYPE_KEY_OPTIONS }]}
            value={{ type: matchTypeKey(type) }}
            defaults={{ type: 'all' }}
            onApply={(next) => setQuery(next)}
            className={styles.mobileFilter}
          />
          <Segmented
            label="Match status"
            value={tab}
            options={[
              { value: 'live', label: 'Live', count: count(liveList.length), live: liveList.length > 0 },
              { value: 'upcoming', label: 'Upcoming', count: count(upcomingList.length) },
              { value: 'finished', label: 'Results', count: count(finishedList.length) },
              { value: 'all', label: 'All', count: count(allList.length) },
            ]}
            onChange={setTab}
            fill
            className={styles.tabs}
          />
        </div>

        {(isLoading || error) && !hasData ? (
          <BoardSkeleton />
        ) : tab === 'live' ? (
          liveList.length ? (
            <div className={styles.grid}>
              {liveList.map((m) => (
                <MatchTile key={m.id} match={m} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon="live"
              title={`No ${typeNote}matches live right now`}
              action={upcomingList.length ? { label: 'See what’s next', onClick: () => setTab('upcoming') } : undefined}
            />
          )
        ) : tab === 'upcoming' ? (
          upcomingList.length ? (
            <UpcomingRail matches={upcomingList} timeline />
          ) : (
            <EmptyState icon="calendar" title={`No ${typeNote}upcoming matches in the feed`} action={{ label: 'Open fixtures', href: '/fixtures' }} />
          )
        ) : tab === 'finished' ? (
          finishedList.length ? (
            <ResultList matches={finishedList} />
          ) : (
            <EmptyState icon="flag" title={`No ${typeNote}results this week`} />
          )
        ) : allList.length ? (
          <div className={styles.grid}>
            {allList.map((m) => (
              <MatchTile key={m.id} match={m} />
            ))}
          </div>
        ) : (
          <EmptyState icon="signal" title={`No ${typeNote}matches listed right now`} />
        )}
      </section>

      {seriesTotals && seriesTotals.length > 0 && (
        <section className={styles.board} aria-labelledby="series-title">
          <SectionHead id="series-title" title="Series in progress" action={{ href: '/series', label: 'All series' }} />
          <SeriesList series={seriesTotals} />
        </section>
      )}
    </>
  );
}
