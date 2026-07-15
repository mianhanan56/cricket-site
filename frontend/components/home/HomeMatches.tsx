'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Match, SeriesSummary } from '@crex/shared';
import MatchCard from './MatchCard';
import SeriesCard from './SeriesCard';
import styles from './HomeMatches.module.scss';

type Tab = 'live' | 'upcoming' | 'finished' | 'series';

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
  const initial: Tab = live.length ? 'live' : upcoming.length ? 'upcoming' : 'finished';
  const [tab, setTab] = useState<Tab>(initial);

  const tabs = [
    { key: 'live' as Tab, label: 'Live', statLabel: 'Live now', value: live.length, Icon: FlameIcon, tone: styles.toneLive },
    { key: 'upcoming' as Tab, label: 'Upcoming', statLabel: 'Upcoming', value: upcoming.length, Icon: CalendarIcon, tone: styles.tonePurple },
    { key: 'finished' as Tab, label: 'Finished', statLabel: 'Finished', value: finished.length, Icon: CheckCircleIcon, tone: styles.toneAmber },
    { key: 'series' as Tab, label: 'Series', statLabel: 'Recent series', value: series.length, Icon: LayersIcon, tone: styles.toneBlue },
  ];

  const list = tab === 'live' ? live : tab === 'upcoming' ? upcoming : finished;
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
          {/* Contextual note for the Finished tab — only while it's active. */}
          {tab === 'finished' && (
            <span className={styles.noteBadge}>
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              Last 7 days
            </span>
          )}
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
        series.length ? (
          <Carousel resetKey={tab}>
            {series.map((s) => (
              <div className={styles.slide} key={s.id || s.name}>
                <SeriesCard series={s} />
              </div>
            ))}
          </Carousel>
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
      ) : (
        <div className={styles.empty}>No matches in this category right now.</div>
      )}
    </>
  );
}
