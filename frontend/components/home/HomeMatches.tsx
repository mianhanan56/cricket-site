'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Match } from '@crex/shared';
import MatchCard from './MatchCard';
import styles from './HomeMatches.module.scss';

type Tab = 'live' | 'upcoming' | 'recent' | 'finished';

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
function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2z" />
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
function ChevronIcon({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
    </svg>
  );
}

// Horizontal, scroll-snapping carousel for the match cards. Cards never wrap;
// the track shows 3 cards on desktop, 2 on tablet, 1 on mobile, and the arrows
// live in dedicated side gutters so they never overlap or shrink the cards.
function MatchCarousel({ matches }: { matches: Match[] }) {
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

  // Re-evaluate arrow state when the matches (tab) change, and reset to start.
  useEffect(() => {
    const el = trackRef.current;
    if (el) el.scrollLeft = 0;
    sync();
  }, [matches, sync]);

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
        aria-label="Previous matches"
      >
        <ChevronIcon dir="left" />
      </button>

      <div className={styles.track} ref={trackRef} onScroll={sync}>
        {matches.map((m) => (
          <div className={styles.slide} key={m.id}>
            <MatchCard match={m} />
          </div>
        ))}
      </div>

      <button
        type="button"
        className={`${styles.arrow} ${styles.right}`}
        onClick={() => scroll(1)}
        disabled={atEnd}
        aria-label="Next matches"
      >
        <ChevronIcon dir="right" />
      </button>
    </div>
  );
}

export default function HomeMatches({
  live,
  upcoming,
  recent,
  finished,
}: {
  live: Match[];
  upcoming: Match[];
  recent: Match[];
  finished: Match[];
}) {
  const initial: Tab = live.length ? 'live' : upcoming.length ? 'upcoming' : 'recent';
  const [tab, setTab] = useState<Tab>(initial);

  const tabs = [
    { key: 'live' as Tab, label: 'Live', statLabel: 'Live now', value: live.length, Icon: FlameIcon, tone: styles.toneLive },
    { key: 'upcoming' as Tab, label: 'Upcoming', statLabel: 'Upcoming', value: upcoming.length, Icon: CalendarIcon, tone: styles.tonePurple },
    { key: 'recent' as Tab, label: 'Recent', statLabel: 'Recent results', value: recent.length, Icon: TrophyIcon, tone: styles.toneGreen },
    { key: 'finished' as Tab, label: 'Finished', statLabel: 'Finished (7d)', value: finished.length, Icon: CheckCircleIcon, tone: styles.toneAmber },
  ];

  const list =
    tab === 'live' ? live : tab === 'upcoming' ? upcoming : tab === 'recent' ? recent : finished;

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
        <h2 className={styles.title}>Matches</h2>
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

      {list.length ? (
        <MatchCarousel matches={list} />
      ) : (
        <div className={styles.empty}>No matches in this category right now.</div>
      )}
    </>
  );
}
