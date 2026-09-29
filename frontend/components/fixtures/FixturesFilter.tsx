'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Fixture } from '@/lib/crex';
import { useQueryTabs } from '@/hooks/useQueryTabs';
import {
  dayDate,
  dayKey,
  dayKeyOf,
  describeSelection,
  formatDayLabel,
  formatDayLong,
  isRelativeDay,
  selectionDays,
  toggleDay,
} from '@/lib/fixtureDays';
import { LOCALE } from '@/lib/datetime';
import {
  MATCH_TYPE_OPTIONS,
  filterByMatchType,
  matchTypeKey,
  parseMatchType,
  type MatchType,
  type MatchTypeKey,
} from '@/lib/matchType';
import { FIXTURE_FORMAT_TABS, type FixtureFormatKey } from '@/lib/tabs';
import Segmented from '../ui/Segmented';
import EmptyState from '../ui/EmptyState';
import UpcomingRail from '../home/UpcomingRail';
import FixtureCalendar from './FixtureCalendar';
import styles from './FixturesFilter.module.scss';

/** Days revealed per step in the default view. */
const DAYS_PER_PAGE = 4;
/** The default view covers a week; the calendar and day strip reach past it. */
const WEEK_DAYS = 7;

interface DayGroup {
  key: string;
  fixtures: Fixture[];
}

export interface FixturesFilterProps {
  fixtures: Fixture[];
  initialFormat: FixtureFormatKey;
  initialType: MatchTypeKey;
  /** Selected day ("2026-08-20"), or '' for the coming week. */
  initialDate: string;
  serverToday: string;
}

/** One chip per day; days toggle in and out, so several can be picked at once. */
function DayStrip({
  groups,
  picked,
  todayKey,
  weekCount,
  onToggle,
  onReset,
}: {
  groups: DayGroup[];
  picked: ReadonlySet<string>;
  todayKey: string;
  weekCount: number;
  onToggle: (key: string) => void;
  onReset: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const max = Math.max(1, ...groups.map((g) => g.fixtures.length));

  // Bring the chosen day into view without moving the page.
  useEffect(() => {
    const strip = ref.current;
    const chip = strip?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!strip || !chip) return;
    strip.scrollLeft = chip.offsetLeft - strip.clientWidth / 2 + chip.clientWidth / 2;
  }, [picked]);

  return (
    <div className={styles.strip} ref={ref} role="group" aria-label="Choose a day">
      <button type="button" className={styles.chip} aria-pressed={!picked.size} onClick={onReset}>
        <span className={styles.chipDay}>Next</span>
        <span className={styles.chipDate}>7d</span>
        <span className={styles.chipCount}>{weekCount}</span>
      </button>
      {groups.map((g) => {
        const d = dayDate(g.key);
        const relative = isRelativeDay(g.key, todayKey);
        const n = g.fixtures.length;
        return (
          <button
            key={g.key}
            type="button"
            className={styles.chip}
            aria-pressed={picked.has(g.key)}
            aria-label={`${formatDayLong(g.key)}, ${n} ${n === 1 ? 'fixture' : 'fixtures'}`}
            onClick={() => onToggle(g.key)}
          >
            <span className={styles.chipDay}>
              {relative ? formatDayLabel(g.key, todayKey) : d.toLocaleDateString(LOCALE, { weekday: 'short' })}
            </span>
            <span className={styles.chipDate}>{d.getDate()}</span>
            <svg className={styles.chipBar} viewBox="0 0 32 3" preserveAspectRatio="none" aria-hidden="true">
              <rect x="0" y="0" width="32" height="3" className={styles.chipTrack} />
              <rect x="0" y="0" width={(n / max) * 32} height="3" className={styles.chipFill} />
            </svg>
            <span className={styles.chipCount}>{n}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function FixturesFilter({
  fixtures,
  initialFormat,
  initialType,
  initialDate,
  serverToday,
}: FixturesFilterProps) {
  // Every filter is URL state: /fixtures?format=t20&type=international&date=2026-08-20.
  const [{ format, type, date }, setQuery] = useQueryTabs(
    { format: initialFormat, type: initialType, date: initialDate },
    { format: 'all', type: 'all', date: '' }
  );

  const active = FIXTURE_FORMAT_TABS.find((t) => t.key === format) ?? FIXTURE_FORMAT_TABS[0];
  const matchType = parseMatchType(type);

  // The reader's today is only known in the browser; the server's paints first.
  const [todayKey, setTodayKey] = useState(serverToday);
  useEffect(() => setTodayKey(dayKeyOf(new Date())), []);

  // Format and type narrow the list; the date only picks a day of it, so day counts describe the filtered list.
  const filtered = useMemo(() => {
    const byType = filterByMatchType(fixtures, matchType);
    return active.format ? byType.filter((f) => f.format === active.format) : byType;
  }, [fixtures, matchType, active.format]);

  // Fixtures arrive sorted, so appending in order keeps days and matches in time order.
  const groups = useMemo<DayGroup[]>(() => {
    const out: DayGroup[] = [];
    for (const fixture of filtered) {
      const key = dayKey(fixture.startTime);
      const last = out[out.length - 1];
      if (last?.key === key) last.fixtures.push(fixture);
      else out.push({ key, fixtures: [fixture] });
    }
    return out;
  }, [filtered]);

  const counts = useMemo(() => new Map(groups.map((g) => [g.key, g.fixtures.length])), [groups]);

  // A stale ?date= shows its own empty state rather than silently resetting.
  const picked = useMemo(() => new Set(selectionDays(date)), [date]);
  const pickedGroups = useMemo(() => groups.filter((g) => picked.has(g.key)), [groups, picked]);
  const week = useMemo(() => groups.slice(0, WEEK_DAYS), [groups]);
  const weekCount = week.reduce((n, g) => n + g.fixtures.length, 0);

  const [shownDays, setShownDays] = useState(DAYS_PER_PAGE);
  useEffect(() => setShownDays(DAYS_PER_PAGE), [format, type, date]);

  const shownFrom = date ? pickedGroups : week;
  const visibleGroups = useMemo(() => shownFrom.slice(0, shownDays), [shownFrom, shownDays]);
  const hasMore = shownFrom.length > visibleGroups.length;
  const visibleMatches = useMemo(() => visibleGroups.flatMap((g) => g.fixtures), [visibleGroups]);

  // A schedule is scrolled, not paged: nearing the end reveals the next few days.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setShownDays((n) => n + DAYS_PER_PAGE);
      },
      { rootMargin: '600px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, shownDays]);

  const filtersOn = format !== 'all' || type !== 'all';

  return (
    <>
      <div className={styles.toolbar}>
        <Segmented
          label="Match format"
          value={format}
          onChange={(next) => setQuery({ format: next })}
          options={FIXTURE_FORMAT_TABS.map((t) => ({ value: t.key, label: t.label }))}
        />
        <Segmented<MatchType>
          label="Match type"
          value={matchType}
          onChange={(next) => setQuery({ type: matchTypeKey(next) })}
          options={MATCH_TYPE_OPTIONS}
        />
      </div>

      <div className={styles.dayBar}>
        <FixtureCalendar
          value={date}
          counts={counts}
          todayKey={todayKey}
          onChange={(next) => setQuery({ date: next })}
        />
        <DayStrip
          groups={groups}
          picked={picked}
          todayKey={todayKey}
          weekCount={weekCount}
          onToggle={(key) => setQuery({ date: toggleDay(date, key) })}
          onReset={() => setQuery({ date: '' })}
        />
      </div>

      {visibleMatches.length ? (
        <div className={styles.list}>
          <UpcomingRail matches={visibleMatches} />
          {hasMore && <div ref={sentinelRef} aria-hidden="true" />}
        </div>
      ) : (
        <EmptyState
          icon="calendar"
          title={`No ${type === 'all' ? '' : `${type} `}${active.format ? `${active.format} ` : ''}fixtures ${
            date ? describeSelection(date) : 'scheduled'
          }`}
          action={
            date
              ? { label: 'Show the coming week', onClick: () => setQuery({ date: '' }) }
              : filtersOn
                ? { label: 'Show all cricket', onClick: () => setQuery({ format: 'all', type: 'all' }) }
                : { label: 'Live matches', href: '/' }
          }
        />
      )}
    </>
  );
}
