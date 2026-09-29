'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { Match } from '@/types';
import { useCrexMatches } from '@/hooks/useCrexMatches';
import { useQueryTabs } from '@/hooks/useQueryTabs';
import {
  MATCH_TYPE_OPTIONS,
  filterByMatchType,
  matchTypeKey,
  parseMatchType,
  type MatchType,
  type MatchTypeKey,
} from '@/lib/matchType';
import type { HomeTab } from '@/lib/tabs';
import { rankLive } from '@/lib/featured';
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
import EmptyState from '../ui/EmptyState';
import Icon from '../ui/Icon';
import ErrorState from '../ui/ErrorState';
import { SectionHead } from '../ui/Section';
import { HeroSkeleton, BoardSkeleton } from './HomeSkeleton';
import styles from './HomeMatches.module.scss';

// A Test between days stays out of "Live" — nothing is being played until tomorrow.
const isAtStumps = (m: Match) => m.note?.kind === 'STUMPS';

const FINISHED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
// The overview is a summary: the next few and the last few, the rest a click away.
const UPCOMING_PREVIEW = 5;
const RESULTS_PREVIEW = 5;
const SERIES_PREVIEW = 4;

export interface HomeMatchesProps {
  /** Active tab from the URL; '' means the overview. */
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

  const { liveList, upcomingList, finishedList } = useMemo(() => {
    const now = Date.now();
    return {
      liveList: scoped.filter((m) => m.status === 'LIVE' && !isAtStumps(m)),
      upcomingList: scoped
        .filter((m) => m.status === 'UPCOMING')
        .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime)),
      finishedList: scoped
        .filter((m) => m.status === 'COMPLETED' && now - +new Date(m.startTime) <= FINISHED_WINDOW_MS)
        .sort((a, b) => +new Date(b.startTime) - +new Date(a.startTime)),
    };
  }, [scoped]);

  // Every live match, stumps included, for the stage and the ticker.
  const onStage = useMemo(
    () =>
      rankLive(
        scoped.filter((m) => m.status === 'LIVE'),
        new Set(follows.teams.map((t) => t.id))
      ),
    [scoped, follows.teams]
  );
  const featured = onStage.find((m) => m.id === featuredId) ?? onStage[0] ?? null;

  // With nothing live the page still has a job: the competitions under way.
  const ongoingSeries = useMemo(
    () => (featured ? [] : seriesFromMatches(scoped).filter((s) => s.status === 'LIVE').slice(0, SERIES_PREVIEW)),
    [featured, scoped]
  );

  const allList = useMemo(() => {
    const rank: Record<Match['status'], number> = { LIVE: 0, UPCOMING: 1, COMPLETED: 2 };
    return [...scoped].sort(
      (a, b) =>
        rank[a.status] - rank[b.status] ||
        (a.status === 'UPCOMING'
          ? +new Date(a.startTime) - +new Date(b.startTime)
          : +new Date(b.startTime) - +new Date(a.startTime))
    );
  }, [scoped]);

  const tab: HomeTab | 'overview' = picked || 'overview';
  const setTab = (next: HomeTab | 'overview') => setQuery({ tab: next === 'overview' ? '' : next });

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
            {onStage.length > 1 && (
              <ScoreTicker matches={onStage} activeId={featured.id} onSelect={setFeaturedId} />
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
          <Segmented
            label="Match status"
            value={tab}
            options={[
              { value: 'overview', label: 'Overview' },
              { value: 'live', label: 'Live', count: count(liveList.length), live: liveList.length > 0 },
              { value: 'upcoming', label: 'Upcoming', count: count(upcomingList.length) },
              { value: 'finished', label: 'Results', count: count(finishedList.length) },
              { value: 'all', label: 'All', count: count(allList.length) },
            ]}
            onChange={setTab}
            className={styles.tabs}
          />
        </div>

        {(isLoading || error) && !hasData ? (
          <BoardSkeleton />
        ) : tab === 'overview' ? (
          <div className={styles.split}>
            <section aria-labelledby="next-title">
              <SectionHead title="Coming up" id="next-title" count={upcomingList.length} level={3} />
              {upcomingList.length ? (
                <>
                  <UpcomingRail matches={upcomingList} limit={UPCOMING_PREVIEW} variant="compact" />
                  <Link href="/fixtures" className={styles.more}>
                    All fixtures
                    <Icon name="arrowRight" size={16} />
                  </Link>
                </>
              ) : (
                <EmptyState compact icon="calendar" title={`No ${typeNote}fixtures in the feed`} action={{ label: 'Open fixtures', href: '/fixtures' }} />
              )}
            </section>
            <section aria-labelledby="results-title">
              <SectionHead title="Results" id="results-title" count={finishedList.length} level={3} />
              {finishedList.length ? (
                <>
                  <ResultList matches={finishedList.slice(0, RESULTS_PREVIEW)} variant="compact" />
                  {finishedList.length > RESULTS_PREVIEW && (
                    <button type="button" className={styles.more} onClick={() => setTab('finished')}>
                      All {finishedList.length} results
                      <Icon name="arrowRight" size={16} />
                    </button>
                  )}
                </>
              ) : (
                <EmptyState compact icon="flag" title={`No ${typeNote}results this week`} />
              )}
            </section>
          </div>
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
            <UpcomingRail matches={upcomingList} />
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

      {ongoingSeries.length > 0 && (
        <section className={styles.board} aria-labelledby="series-title">
          <SectionHead id="series-title" title="Series in progress" action={{ href: '/series', label: 'All series' }} />
          <SeriesList series={ongoingSeries} />
        </section>
      )}
    </>
  );
}
