'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  dayDate,
  describeSelection,
  formatDayLong,
  rangeSelection,
  selectionDays,
  selectionRange,
} from '@/lib/fixtureDays';
import { LOCALE } from '@/lib/datetime';
import Icon from '../ui/Icon';
import styles from './FixtureCalendar.module.scss';

/** Monday-first, matching the en-GB dates the rest of the page prints. */
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

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
  /** The ?date= selection — a day, a range or a list — or '' for the coming week. */
  value: string;
  onChange: (selection: string) => void;
  /** Fixtures per day key — the calendar only offers days that have any. */
  counts: Map<string, number>;
  /** The reader's today, or '' before the client has said what it is. */
  todayKey: string;
}

/**
 * Month grid over the days the schedule covers; each offered day is shaded by how
 * much cricket is on it. One tap picks a day, a second tap on another day turns it
 * into a range, and the same day twice keeps just that day.
 */
export default function FixtureCalendar({ value, onChange, counts, todayKey }: FixtureCalendarProps) {
  const [open, setOpen] = useState(false);
  // The first end of a range still waiting for its second.
  const [anchor, setAnchor] = useState<string | null>(null);
  const picked = useMemo(() => new Set(selectionDays(value)), [value]);
  const range = selectionRange(value);
  const firstPicked = selectionDays(value)[0] ?? '';
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // The months the schedule spans, in order — the bounds for the arrows.
  const months = useMemo(() => {
    const set = new Set([...counts.keys()].map(monthKey));
    return [...set].sort();
  }, [counts]);

  const [month, setMonth] = useState(() => monthKey(firstPicked || months[0] || todayKey || '1970-01'));

  // Follow a selection made elsewhere (the day strip, or a ?date= link).
  useEffect(() => {
    if (firstPicked) setMonth(monthKey(firstPicked));
  }, [firstPicked]);

  useEffect(() => {
    if (!open) setAnchor(null);
  }, [open]);

  // A format filter can empty the shown month; fall back to one with cricket in it.
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

  const finish = (selection: string) => {
    onChange(selection);
    close(true);
  };

  const pick = (key: string) => {
    if (anchor === null) {
      setAnchor(key);
      onChange(key);
    } else if (anchor === key) {
      finish(key);
    } else {
      finish(rangeSelection(anchor, key));
    }
  };

  const label = value ? describeSelection(value) : 'the coming week';
  const max = Math.max(1, ...counts.values());

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Pick a date. Showing ${label}`}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Icon name="calendar" size={20} />
        <span className={styles.triggerLabel}>Month</span>
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
              <Icon name="chevronLeft" size={16} />
            </button>
            <span className={styles.month}>
              {dayDate(`${month}-01`).toLocaleDateString(LOCALE, {
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
              <Icon name="chevronRight" size={16} />
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
              const level = count ? Math.ceil((count / max) * 4) : 0;
              return (
                <button
                  key={key}
                  type="button"
                  className={`${styles.day} ${
                    picked.has(key) && (!range || key === range[0] || key === range[1])
                      ? styles.daySelected
                      : picked.has(key)
                        ? styles.dayInRange
                        : ''
                  } ${key === todayKey ? styles.dayToday : ''}`}
                  aria-pressed={picked.has(key)}
                  disabled={!count}
                  data-level={level || undefined}
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
            <button type="button" className={styles.clear} onClick={() => finish('')} disabled={!value}>
              Coming week
            </button>
            {todayKey && counts.get(todayKey) ? (
              <button type="button" className={styles.clear} onClick={() => finish(todayKey)}>
                Today
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
