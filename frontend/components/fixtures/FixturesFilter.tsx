'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Fixture } from '@/lib/crex';
import { useQueryTabs } from '@/hooks/useQueryTabs';
import {
  addDays,
  dayDate,
  dayKey,
  dayKeyOf,
  describeSelection,
  formatDayLong,
  selectionDays,
  toggleDay,
} from '@/lib/fixtureDays';
import { LOCALE } from '@/lib/datetime';
import {
  MATCH_TYPE_KEY_OPTIONS,
  filterByMatchType,
  parseMatchType,
  type MatchTypeKey,
} from '@/lib/matchType';
import { FIXTURE_FORMAT_TABS, type FixtureFormatKey } from '@/lib/tabs';
import FilterMenu from '../ui/FilterMenu';
import FilterSheet from '../ui/FilterSheet';
import Icon from '../ui/Icon';
import EmptyState from '../ui/EmptyState';
import { PageHeader } from '../ui/Section';
import UpcomingRail from '../home/UpcomingRail';
import FixtureCalendar from './FixtureCalendar';
import styles from './FixturesFilter.module.scss';

/** Days revealed per step as the list scrolls. */
const DAYS_PER_PAGE = 4;

interface DayGroup {
  key: string;
  fixtures: Fixture[];
}

export interface FixturesFilterProps {
  /** The page's heading, which carries the format and competition menus. */
  eyebrow: string;
  title: string;
  fixtures: Fixture[];
  /** Where the schedule read stops mid-day (see `FixtureSchedule`); null when every day is whole. */
  coveredUntil: string | null;
  initialFormat: FixtureFormatKey;
  initialType: MatchTypeKey;
  /** Selected day ("2026-08-20"), or '' for every day. */
  initialDate: string;
  serverToday: string;
}

const WEEK = 7;
const FORMAT_OPTIONS = FIXTURE_FORMAT_TABS.map((t) => ({ value: t.key, label: t.label }));

const daysBetween = (from: string, to: string) => Math.round((+dayDate(to) - +dayDate(from)) / 86_400_000);
const dayMonth = (key: string) => dayDate(key).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });

/** "23 – 29 Oct", or "29 Oct – 4 Nov" across a month end. */
function weekLabel(first: string, last: string): string {
  return first.slice(0, 7) === last.slice(0, 7)
    ? `${dayDate(first).getDate()} – ${dayMonth(last)}`
    : `${dayMonth(first)} – ${dayMonth(last)}`;
}

/** Seven days from today at a time, each with its fixtures; days toggle in and out, so several can be picked at once. */
function WeekStrip({
  counts,
  picked,
  todayKey,
  lastKey,
  total,
  calendar,
  onToggle,
  onReset,
}: {
  counts: Map<string, number>;
  picked: ReadonlySet<string>;
  todayKey: string;
  lastKey: string | undefined;
  total: number;
  /** The month calendar's button, at the head's far end. */
  calendar: ReactNode;
  onToggle: (key: string) => void;
  onReset: () => void;
}) {
  const weeks = lastKey ? Math.max(1, Math.ceil((daysBetween(todayKey, lastKey) + 1) / WEEK)) : 1;
  const [week, setWeek] = useState(0);

  // Follow a pick made elsewhere (the calendar, or a ?date= link) to its week.
  const firstPicked = [...picked].sort()[0];
  useEffect(() => {
    if (!firstPicked) return;
    const w = Math.floor(daysBetween(todayKey, firstPicked) / WEEK);
    if (w >= 0 && w < weeks) setWeek(w);
  }, [firstPicked, todayKey, weeks]);

  const start = addDays(todayKey, Math.min(week, weeks - 1) * WEEK);
  const days = Array.from({ length: WEEK }, (_, i) => addDays(start, i));

  return (
    <div className={styles.dates}>
      <div className={styles.weekHead}>
        <button type="button" className={styles.allDays} aria-pressed={!picked.size} onClick={onReset}>
          All days
          <span className={styles.allCount}>{total}</span>
        </button>
        <div className={styles.weekNav}>
          <button
            type="button"
            className={styles.navBtn}
            onClick={() => setWeek((w) => w - 1)}
            disabled={week === 0}
            aria-label="Previous week"
          >
            <Icon name="chevronLeft" size={16} />
          </button>
          <span className={styles.range} aria-live="polite">
            {weekLabel(days[0], days[WEEK - 1])}
          </span>
          <button
            type="button"
            className={styles.navBtn}
            onClick={() => setWeek((w) => w + 1)}
            disabled={week >= weeks - 1}
            aria-label="Next week"
          >
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
        <div className={styles.calendarSlot}>{calendar}</div>
      </div>

      <div className={styles.week} role="group" aria-label="Choose a day">
        {days.map((key) => {
          const n = counts.get(key) ?? 0;
          const on = picked.has(key);
          return (
            <button
              key={key}
              type="button"
              className={`${styles.day} ${key === todayKey ? styles.today : ''}`}
              aria-pressed={on}
              // A picked day stays clickable even when a filter leaves it empty, so it can be unpicked.
              disabled={!n && !on}
              aria-label={`${formatDayLong(key)}, ${n} ${n === 1 ? 'fixture' : 'fixtures'}`}
              onClick={() => onToggle(key)}
            >
              <span className={styles.dayName}>
                {key === todayKey ? 'Today' : dayDate(key).toLocaleDateString(LOCALE, { weekday: 'short' })}
              </span>
              <span className={styles.dayNum}>{dayDate(key).getDate()}</span>
              <span className={styles.dayCount}>
                {n ? (
                  <>
                    {n}
                    <span className={styles.countWord}> {n === 1 ? 'match' : 'matches'}</span>
                  </>
                ) : (
                  '–'
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function FixturesFilter({
  eyebrow,
  title,
  fixtures,
  coveredUntil,
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
  // The read's last day is only partly listed, so it waits for the next read rather than showing short.
  const whole = useMemo(() => {
    if (!coveredUntil) return fixtures;
    const cut = dayKey(coveredUntil);
    return fixtures.filter((f) => dayKey(f.startTime) < cut);
  }, [fixtures, coveredUntil]);

  const filtered = useMemo(() => {
    const byType = filterByMatchType(whole, matchType);
    return active.format ? byType.filter((f) => f.format === active.format) : byType;
  }, [whole, matchType, active.format]);

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
  const total = filtered.length;
  const lastKey = groups[groups.length - 1]?.key;

  const [shownDays, setShownDays] = useState(DAYS_PER_PAGE);
  useEffect(() => setShownDays(DAYS_PER_PAGE), [format, type, date]);

  const shownFrom = date ? pickedGroups : groups;
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
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        asideClassName={styles.toolbar}
        aside={
          <>
            <FilterMenu label="Format" value={format} options={FORMAT_OPTIONS} onChange={(next) => setQuery({ format: next })} />
            <FilterMenu
              label="Competition"
              value={type}
              options={MATCH_TYPE_KEY_OPTIONS}
              onChange={(next) => setQuery({ type: next })}
              align="end"
            />
          </>
        }
      />

      <FilterSheet
        groups={() => [
          { key: 'format', label: 'Format', options: FORMAT_OPTIONS },
          { key: 'type', label: 'Competition', options: MATCH_TYPE_KEY_OPTIONS },
        ]}
        value={{ format, type }}
        defaults={{ format: 'all', type: 'all' }}
        onApply={(next) => setQuery(next)}
        className={styles.mobileFilter}
      />

      <WeekStrip
        counts={counts}
        picked={picked}
        todayKey={todayKey}
        lastKey={lastKey}
        total={total}
        calendar={
          <FixtureCalendar
            value={date}
            counts={counts}
            todayKey={todayKey}
            onChange={(next) => setQuery({ date: next })}
          />
        }
        onToggle={(key) => setQuery({ date: toggleDay(date, key) })}
        onReset={() => setQuery({ date: '' })}
      />

      {visibleMatches.length ? (
        <div className={styles.list}>
          <UpcomingRail matches={visibleMatches} timeline />
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
              ? { label: 'Show every day', onClick: () => setQuery({ date: '' }) }
              : filtersOn
                ? { label: 'Show all cricket', onClick: () => setQuery({ format: 'all', type: 'all' }) }
                : { label: 'Live matches', href: '/' }
          }
        />
      )}
    </>
  );
}
