'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Match } from '@/types';
import { useCrexMatches } from '@/hooks/useCrexMatches';
import { useQueryTabs } from '@/hooks/useQueryTabs';
import {
  MATCH_TYPE_OPTIONS,
  filterByMatchType,
  matchTypeKey,
  parseMatchType,
  type MatchTypeKey,
} from '@/lib/matchType';
import type { HomeTab } from '@/lib/tabs';
import FilterSelect from '../ui/FilterSelect';
import MatchCard from './MatchCard';
import { MatchCarouselSkeleton } from './HomeSkeleton';
import styles from './HomeMatches.module.scss';

type Tab = HomeTab;

// "Finished" surfaces every match completed in the last 7 days. The crex feed
// arrives unfiltered, so the window is applied here.
const FINISHED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function FlameIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="M22 4 12 14.01l-3-3" />
    </svg>
  );
}
function LayersIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 2 9 5-9 5-9-5 9-5z" />
      <path d="m3 12 9 5 9-5M3 17l9 5 9-5" />
    </svg>
  );
}
function ChevronIcon({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
    </svg>
  );
}

// Horizontal, scroll-snapping carousel. Cards never wrap; the track shows 3
// cards on desktop, 2 on tablet, 1 on mobile, and the arrows live in dedicated
// side gutters so they never overlap or shrink the cards. `resetKey` scrolls
// back to the start whenever it changes (e.g. switching tabs).
function Carousel({ children, resetKey }: { children: ReactNode; resetKey: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft >= maxScroll - 1);
  }, []);

  // Re-evaluate arrow state when the content (tab) changes, and reset to start.
  useEffect(() => {
    const el = trackRef.current;
    if (el) el.scrollLeft = 0;
    sync();
  }, [resetKey, sync]);

  const scroll = useCallback((dir: number) => {
    const el = trackRef.current;
    if (!el) return;
    // Advance by one full "page" of visible cards.
    el.scrollBy({ left: el.clientWidth * dir, behavior: 'smooth' });
  }, []);

  return (
    <div className={styles.slider}>
      <button
        type="button"
        className={`${styles.arrow} ${styles.left}`}
        onClick={() => scroll(-1)}
        disabled={atStart}
        aria-label="Previous"
      >
        <ChevronIcon dir="left" />
      </button>

      <div className={styles.track} ref={trackRef} onScroll={sync}>
        {children}
      </div>

      <button
        type="button"
        className={`${styles.arrow} ${styles.right}`}
        onClick={() => scroll(1)}
        disabled={atEnd}
        aria-label="Next"
      >
        <ChevronIcon dir="right" />
      </button>
    </div>
  );
}

export interface HomeMatchesProps {
  /** Active tab from the URL; '' means "follow the data". */
  initialTab: Tab | '';
  initialType: MatchTypeKey;
}

export default function HomeMatches({ initialTab, initialType }: HomeMatchesProps) {
  // The crex Worker is the only source here — nothing is server-rendered, so
  // `isLoading` covers the first poll and placeholders stand in for it.
  const { matches, isLoading: crexLoading } = useCrexMatches();

  // Tab and type both live in the URL: /?tab=upcoming&type=international.
  const [{ tab: picked, type: typeKey }, setQuery] = useQueryTabs(
    { tab: initialTab, type: initialType },
    { type: 'all' }
  );
  const type = parseMatchType(typeKey);

  // The type filter is applied before the lists are split, so the stat tiles
  // count what the carousel will actually show.
  const scoped = useMemo(() => filterByMatchType(matches, type), [matches, type]);

  const { liveList, upcomingList, finishedList } = useMemo(() => {
    const now = Date.now();
    return {
      liveList: scoped.filter((m) => m.status === 'LIVE'),
      upcomingList: scoped
        .filter((m) => m.status === 'UPCOMING')
        .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime)),
      finishedList: scoped
        .filter((m) => m.status === 'COMPLETED' && now - +new Date(m.startTime) <= FINISHED_WINDOW_MS)
        .sort((a, b) => +new Date(b.startTime) - +new Date(a.startTime)),
    };
  }, [scoped]);

  // The catch-all list: everything crex is carrying, in the order a reader cares
  // about it — in progress, then next up, then just-finished. Deliberately built
  // from `scoped` rather than by concatenating the three lists above, so a result
  // older than the "Finished" window still appears here instead of vanishing.
  const allList = useMemo(() => {
    const rank: Record<Match['status'], number> = { LIVE: 0, UPCOMING: 1, COMPLETED: 2 };
    return [...scoped].sort(
      (a, b) =>
        rank[a.status] - rank[b.status] ||
        // Soonest first while a match is still ahead of us, most recent first
        // once it isn't.
        (a.status === 'UPCOMING'
          ? +new Date(a.startTime) - +new Date(b.startTime)
          : +new Date(b.startTime) - +new Date(a.startTime))
    );
  }, [scoped]);

  // The opening tab follows the data until the reader picks one themselves —
  // and a pick is now a URL param, so it also survives a reload or a share.
  const auto: Tab = liveList.length ? 'live' : upcomingList.length ? 'upcoming' : 'finished';
  const tab: Tab = picked || auto;
  const setTab = (next: Tab) => setQuery({ tab: next });

  const tabs = [
    { key: 'live' as Tab, label: 'Live', statLabel: 'Live now', value: liveList.length, Icon: FlameIcon, tone: styles.toneLive },
    { key: 'upcoming' as Tab, label: 'Upcoming', statLabel: 'Upcoming', value: upcomingList.length, Icon: CalendarIcon, tone: styles.tonePurple },
    { key: 'finished' as Tab, label: 'Finished', statLabel: 'Finished', value: finishedList.length, Icon: CheckCircleIcon, tone: styles.toneAmber },
    { key: 'all' as Tab, label: 'Matches', statLabel: 'All matches', value: allList.length, Icon: LayersIcon, tone: styles.toneBlue },
  ];

  // Folded into the empty states so "nothing here" reads as a consequence of
  // the active filter, not as a broken feed.
  const typeNote = type === 'ALL' ? '' : `${type.toLowerCase()} `;

  const list =
    tab === 'live'
      ? liveList
      : tab === 'upcoming'
        ? upcomingList
        : tab === 'finished'
          ? finishedList
          : allList;

  return (
    <>
      {/* Stats strip — each tile doubles as a shortcut to its tab. */}
      <div className={styles.stats}>
        {tabs.map(({ key, statLabel, value, Icon, tone }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`${styles.stat} ${tab === key ? styles.statActive : ''}`}
          >
            <span className={`${styles.statIcon} ${tone}`}>
              <Icon />
            </span>
            <span className={styles.statBody}>
              <span className={styles.statValue}>{value}</span>
              <span className={styles.statLabel}>{statLabel}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Section head + tab pills */}
      {/* Order here is the phone order — title and filter share the first line,
          the tab rail wraps below. Desktop reorders the filter after the rail
          with CSS, so both layouts come out of one DOM. */}
      <div className={styles.head}>
        <h2 className={styles.title}>Matches</h2>

        <div className={styles.headFilter}>
          <FilterSelect
            label="Type"
            value={type}
            options={MATCH_TYPE_OPTIONS}
            onChange={(next) => setQuery({ type: matchTypeKey(next) })}
          />
        </div>

        <div className={styles.pills} role="tablist">
          {tabs.map(({ key, label, value, Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`${styles.pill} ${tab === key ? styles.pillActive : ''}`}
            >
              <Icon />
              <span>{label}</span>
              {key === 'live' && value > 0 && <span className={styles.count}>{value}</span>}
            </button>
          ))}
        </div>
      </div>

      {list.length ? (
        <Carousel resetKey={`${tab}-${type}`}>
          {list.map((m) => (
            <div className={styles.slide} key={m.id}>
              <MatchCard match={m} />
            </div>
          ))}
        </Carousel>
      ) : crexLoading ? (
        <MatchCarouselSkeleton />
      ) : (
        <div className={styles.empty}>
          {tab === 'all'
            ? `No ${typeNote}matches are listed right now.`
            : `No ${typeNote}matches in this category right now.`}
        </div>
      )}
    </>
  );
}
