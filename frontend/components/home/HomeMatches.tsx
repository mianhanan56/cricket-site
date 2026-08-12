'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Match, SeriesSummary } from '@/types';
import { useCrexMatches } from '@/hooks/useCrexMatches';
import { seriesFromMatches } from '@/lib/crex';
import MatchCard from './MatchCard';
import SeriesCard from './SeriesCard';
import { MatchCarouselSkeleton } from './HomeSkeleton';
import styles from './HomeMatches.module.scss';

type Tab = 'live' | 'upcoming' | 'finished' | 'series';

// "Finished" surfaces every match completed in the last 7 days — same window
// the server uses in app/page.tsx, applied again here because polled data
// arrives unfiltered.
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

export default function HomeMatches({
  live,
  upcoming,
  finished,
  series,
}: {
  live: Match[];
  upcoming: Match[];
  finished: Match[];
  series: SeriesSummary[];
}) {
  // Server-rendered lists paint first; the crex Worker then polls over the top.
  // When the Worker isn't configured the hook stays inert and the props stand,
  // so this is additive — nothing breaks if crex goes away.
  const serverMatches = useMemo(
    () => [...live, ...upcoming, ...finished],
    [live, upcoming, finished]
  );
  // `lastUpdated` is still read below — it's how we know a poll has actually
  // landed and the polled list can safely replace the server-rendered one.
  // `isLoading` is true only on a first poll with nothing server-rendered behind
  // it (backend down, crex the sole source) — the one case where the page has no
  // matches to show yet and placeholders beat an empty state.
  const {
    matches: polled,
    lastUpdated,
    isLoading: crexLoading,
  } = useCrexMatches({ initial: serverMatches });

  // Only let polled data take over once it has actually landed — an empty first
  // render from the hook must not blank out server-rendered matches.
  const source = lastUpdated ? polled : serverMatches;

  const { liveList, upcomingList, finishedList } = useMemo(() => {
    if (!lastUpdated) return { liveList: live, upcomingList: upcoming, finishedList: finished };

    const now = Date.now();
    return {
      liveList: source.filter((m) => m.status === 'LIVE'),
      upcomingList: source
        .filter((m) => m.status === 'UPCOMING')
        .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime)),
      finishedList: source
        .filter((m) => m.status === 'COMPLETED' && now - +new Date(m.startTime) <= FINISHED_WINDOW_MS)
        .sort((a, b) => +new Date(b.startTime) - +new Date(a.startTime)),
    };
  }, [source, lastUpdated, live, upcoming, finished]);

  // Series are rolled up from the same match feed rather than taken from the
  // backend, whose count only reflects matches synced into our DB (a whole
  // season showed as "1 match"). Completed series are dropped — a finished
  // competition is not something anyone is coming to the home page for.
  const seriesList = useMemo(() => {
    const rolled = lastUpdated ? seriesFromMatches(source) : series;
    return rolled.filter((s) => s.status !== 'COMPLETED');
  }, [source, lastUpdated, series]);

  const initial: Tab = liveList.length ? 'live' : upcomingList.length ? 'upcoming' : 'finished';
  const [tab, setTab] = useState<Tab>(initial);

  const tabs = [
    { key: 'live' as Tab, label: 'Live', statLabel: 'Live now', value: liveList.length, Icon: FlameIcon, tone: styles.toneLive },
    { key: 'upcoming' as Tab, label: 'Upcoming', statLabel: 'Upcoming', value: upcomingList.length, Icon: CalendarIcon, tone: styles.tonePurple },
    { key: 'finished' as Tab, label: 'Finished', statLabel: 'Finished', value: finishedList.length, Icon: CheckCircleIcon, tone: styles.toneAmber },
    { key: 'series' as Tab, label: 'Series', statLabel: 'Ongoing series', value: seriesList.length, Icon: LayersIcon, tone: styles.toneBlue },
  ];

  const list = tab === 'live' ? liveList : tab === 'upcoming' ? upcomingList : finishedList;
  const isSeries = tab === 'series';

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
      <div className={styles.head}>
        <div className={styles.headLeft}>
          <h2 className={styles.title}>Matches</h2>
        </div>
        <div className={styles.pills} role="tablist">
          {tabs.map(({ key, label, value, Icon }) => (
            <button
              key={key}
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

      {isSeries ? (
        seriesList.length ? (
          <Carousel resetKey={tab}>
            {seriesList.map((s) => (
              <div className={styles.slide} key={s.id || s.name}>
                <SeriesCard series={s} />
              </div>
            ))}
          </Carousel>
        ) : crexLoading ? (
          <MatchCarouselSkeleton kind="series" />
        ) : (
          <div className={styles.empty}>No recent series to show right now.</div>
        )
      ) : list.length ? (
        <Carousel resetKey={tab}>
          {list.map((m) => (
            <div className={styles.slide} key={m.id}>
              <MatchCard match={m} />
            </div>
          ))}
        </Carousel>
      ) : crexLoading ? (
        <MatchCarouselSkeleton />
      ) : (
        <div className={styles.empty}>No matches in this category right now.</div>
      )}
    </>
  );
}
