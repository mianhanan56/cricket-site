'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { Fixture } from '@/lib/crex';
import { useQueryTabs } from '@/hooks/useQueryTabs';
import {
  dayKey,
  dayKeyOf,
  formatDayLabel,
  formatDayLong,
  isRelativeDay,
} from '@/lib/fixtureDays';
import {
  MATCH_TYPE_OPTIONS,
  filterByMatchType,
  matchTypeKey,
  parseMatchType,
  type MatchTypeKey,
} from '@/lib/matchType';
import { FIXTURE_FORMAT_TABS, type FixtureFormatKey } from '@/lib/tabs';
import FilterSelect from '../ui/FilterSelect';
import FixtureCalendar from './FixtureCalendar';
import styles from './FixturesFilter.module.scss';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** Days revealed per step in the default view. */
const DAYS_PER_PAGE = 4;

/** How much of the schedule the default view covers. */
const WEEK_DAYS = 7;

interface DayGroup {
  key: string;
  label: string;
  fixtures: Fixture[];
}

export interface FixturesFilterProps {
  fixtures: Fixture[];
  /** Initial filters, read off the URL by the page. */
  initialFormat: FixtureFormatKey;
  initialType: MatchTypeKey;
  /** Selected day ("2026-08-20"), or '' for every upcoming day. */
  initialDate: string;
  /** The server's today, so the first paint has real day labels on it. */
  serverToday: string;
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

  // "Today" is the reader's today, which only the browser knows. The server's is
  // rendered first so the day headings are never blank, and the effect corrects
  // it on mount — a no-op in every timezone whose date agrees with the server's.
  const [todayKey, setTodayKey] = useState(serverToday);
  useEffect(() => setTodayKey(dayKeyOf(new Date())), []);

  // Format and type narrow the list; the date only chooses which day of it to
  // show. Keeping them apart is what lets the calendar carry live counts — it
  // describes the list you would get, not the list before filtering.
  const filtered = useMemo(() => {
    const byType = filterByMatchType(fixtures, matchType);
    return active.format ? byType.filter((f) => f.format === active.format) : byType;
  }, [fixtures, matchType, active.format]);

  // Fixtures arrive sorted, so appending in order keeps days and the matches
  // within a day in time order without a second sort.
  const groups = useMemo<DayGroup[]>(() => {
    const out: DayGroup[] = [];
    for (const fixture of filtered) {
      const key = dayKey(fixture.startTime);
      const last = out[out.length - 1];
      if (last?.key === key) last.fixtures.push(fixture);
      else out.push({ key, label: formatDayLabel(key, todayKey), fixtures: [fixture] });
    }
    return out;
  }, [filtered, todayKey]);

  const counts = useMemo(
    () => new Map(groups.map((g) => [g.key, g.fixtures.length])),
    [groups]
  );

  // A ?date= that no longer has fixtures on it (a stale link, or a format tab
  // that empties the day) shows its own empty state rather than silently
  // resetting — the reader chose that day and the page should say it is bare.
  const selected = date ? groups.find((g) => g.key === date) : null;

  // Without a date the page shows the coming week, not the whole three weeks
  // crex publishes: a week is the horizon a fixtures page is read at, and the
  // calendar — which still counts every day — is how you go past it.
  const week = useMemo(() => groups.slice(0, WEEK_DAYS), [groups]);

  // Reveal is per-day rather than per-card so a day is never half-shown, and it
  // resets whenever the view changes.
  const [shownDays, setShownDays] = useState(DAYS_PER_PAGE);
  useEffect(() => setShownDays(DAYS_PER_PAGE), [format, type, date]);

  const visibleGroups = date ? (selected ? [selected] : []) : week.slice(0, shownDays);
  const hiddenGroups = date ? [] : week.slice(visibleGroups.length);

  // Reaching the end of what is rendered reveals the next few days. `rootMargin`
  // starts that a screen early, so the list is already longer by the time the
  // reader gets there and the load never shows.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMore = hiddenGroups.length > 0;
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

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist" aria-label="Match format">
          {FIXTURE_FORMAT_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={format === t.key}
              className={`${styles.tab} ${format === t.key ? styles.active : ''}`}
              onClick={() => setQuery({ format: t.key })}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className={styles.selects}>
          <FixtureCalendar
            value={date}
            counts={counts}
            todayKey={todayKey}
            onChange={(next) => setQuery({ date: next })}
          />
          <FilterSelect
            label="Type"
            value={matchType}
            options={MATCH_TYPE_OPTIONS}
            onChange={(next) => setQuery({ type: matchTypeKey(next) })}
          />
        </div>
      </div>

      {visibleGroups.length ? (
        <>
          {visibleGroups.map((group) => (
            <section key={group.key} className={styles.day}>
              <h2 className={styles.dayHeading}>
                <span className={styles.dayLabel}>{group.label}</span>
                {/* Only where the label is relative: "Sat 22 Aug — Saturday 22
                    August" would be the same date printed twice. */}
                {isRelativeDay(group.key, todayKey) && (
                  <span className={styles.dayDate}>{formatDayLong(group.key)}</span>
                )}
                <span className={styles.dayCount}>
                  {group.fixtures.length} {group.fixtures.length === 1 ? 'match' : 'matches'}
                </span>
              </h2>

              <div className={styles.grid}>
                {group.fixtures.map((m) => {
                  const body = (
                    <>
                      <div className={styles.cardTop}>
                        <span className={styles.format}>{m.format}</span>
                        <span className={styles.date}>{formatTime(m.startTime)}</span>
                      </div>
                      <div className={styles.teams}>
                        <span>{m.homeTeam.shortName}</span>
                        <span className={styles.vs}>vs</span>
                        <span>{m.awayTeam.shortName}</span>
                      </div>
                      <div className={styles.series}>{m.series.name}</div>
                      <div className={styles.venue}>{m.venue}</div>
                    </>
                  );

                  // A fixture weeks out has no match key yet and so no page to
                  // open; linking it anyway would send every one to a 404.
                  return m.matchKey ? (
                    <Link key={m.id} href={`/matches/${m.matchKey}`} className={styles.card}>
                      {body}
                    </Link>
                  ) : (
                    <div key={m.id} className={styles.cardStatic}>
                      {body}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {/* The rest of the schedule loads itself as you reach the end of what
              is rendered — a schedule is scrolled, not paged, and a button here
              was one more thing between the reader and the next day's cricket.
              The sentinel is the only marker; nothing is drawn. */}
          {hiddenGroups.length > 0 && <div ref={sentinelRef} aria-hidden="true" />}
        </>
      ) : (
        <p className={styles.empty}>
          No {type === 'all' ? '' : `${type} `}
          {active.format ? `${active.format} ` : ''}fixtures{' '}
          {date ? `on ${formatDayLong(date)}` : 'scheduled'}.
        </p>
      )}
    </>
  );
}
