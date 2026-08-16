'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { dayDate, formatDayLong } from '@/lib/fixtureDays';
import styles from './FixtureCalendar.module.scss';

/** Monday-first, matching the en-GB dates the rest of the page prints. */
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function ChevronIcon({ back = false }: { back?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={back ? 'm14 6-6 6 6 6' : 'm10 6 6 6-6 6'} />
    </svg>
  );
}

/** "2026-08" — the month a day key belongs to. */
const monthKey = (key: string) => key.slice(0, 7);

/** Every day of `month`'s grid, Monday-first, padded with the blanks either side. */
function monthGrid(month: string): Array<string | null> {
  const first = dayDate(`${month}-01`);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();

  const cells: Array<string | null> = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

export interface FixtureCalendarProps {
  /** Selected day key, or '' for every upcoming day. */
  value: string;
  onChange: (key: string) => void;
  /** Fixtures per day key — the calendar only offers days that have any. */
  counts: Map<string, number>;
  /** The reader's today, or '' before the client has said what it is. */
  todayKey: string;
}

/**
 * Month-grid date picker over the days the schedule actually covers.
 *
 * Deliberately not a generic date input: crex publishes roughly three weeks
 * ahead, so most of any month is a day with nothing on it. Days without
 * fixtures are rendered but disabled, and every offered day carries its match
 * count — the picker doubles as a density map of the schedule, which is the
 * thing you are actually choosing between.
 */
export default function FixtureCalendar({ value, onChange, counts, todayKey }: FixtureCalendarProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // The months the schedule spans, in order — the bounds for the arrows.
  const months = useMemo(() => {
    const set = new Set([...counts.keys()].map(monthKey));
    return [...set].sort();
  }, [counts]);

  const [month, setMonth] = useState(() => monthKey(value || months[0] || todayKey || '1970-01'));

  // Follow the selection when it changes from outside (the day rail, or a link
  // straight into ?date=), so opening the calendar lands on the chosen day.
  useEffect(() => {
    if (value) setMonth(monthKey(value));
  }, [value]);

  // A format tab can empty the month being shown — filter to Tests and August
  // may hold nothing at all. Fall back to the first month that has cricket in
  // it, so the arrows never strand the reader on a blank grid.
  useEffect(() => {
    if (months.length && !months.includes(month)) setMonth(months[0]);
  }, [months, month]);

  const close = useCallback((refocus = false) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(true);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const index = months.indexOf(month);
  const prevMonth = index > 0 ? months[index - 1] : null;
  const nextMonth = index >= 0 && index < months.length - 1 ? months[index + 1] : null;

  const pick = (key: string) => {
    onChange(key);
    close(true);
  };

  const label = value ? formatDayLong(value) : 'All dates';

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''} ${value ? styles.triggerSet : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Pick a date. Currently ${label}`}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <CalendarIcon />
        <span className={styles.triggerLabel}>{label}</span>
      </button>

      {open && (
        <div className={styles.panel} id={panelId} role="dialog" aria-label="Pick a date">
          <div className={styles.head}>
            <button
              type="button"
              className={styles.nav}
              onClick={() => prevMonth && setMonth(prevMonth)}
              disabled={!prevMonth}
              aria-label="Previous month"
            >
              <ChevronIcon back />
            </button>
            <span className={styles.month}>
              {dayDate(`${month}-01`).toLocaleDateString('en-GB', {
                month: 'long',
                year: 'numeric',
              })}
            </span>
            <button
              type="button"
              className={styles.nav}
              onClick={() => nextMonth && setMonth(nextMonth)}
              disabled={!nextMonth}
              aria-label="Next month"
            >
              <ChevronIcon />
            </button>
          </div>

          <div className={styles.weekdays} aria-hidden="true">
            {WEEKDAYS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>

          <div className={styles.grid}>
            {monthGrid(month).map((key, i) => {
              if (!key) return <span key={`pad-${i}`} className={styles.pad} />;

              const count = counts.get(key) ?? 0;
              return (
                <button
                  key={key}
                  type="button"
                  className={`${styles.day} ${key === value ? styles.daySelected : ''} ${
                    key === todayKey ? styles.dayToday : ''
                  }`}
                  disabled={!count}
                  aria-current={key === todayKey ? 'date' : undefined}
                  aria-label={`${formatDayLong(key)} — ${count} ${count === 1 ? 'fixture' : 'fixtures'}`}
                  onClick={() => pick(key)}
                >
                  {dayDate(key).getDate()}
                  {count > 0 && <span className={styles.dayCount}>{count}</span>}
                </button>
              );
            })}
          </div>

          <div className={styles.foot}>
            <button
              type="button"
              className={styles.clear}
              onClick={() => pick('')}
              disabled={!value}
            >
              All dates
            </button>
            {todayKey && counts.get(todayKey) ? (
              <button type="button" className={styles.clear} onClick={() => pick(todayKey)}>
                Today
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
