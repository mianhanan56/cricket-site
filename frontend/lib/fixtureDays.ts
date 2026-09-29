// Day keys for the fixtures calendar.
//
// A fixtures page is read in days, and a day is the reader's day — a 19:00 IST
// start is "tonight" in Delhi and "this afternoon" in London, but it belongs to
// the same date in both places only if the date is taken locally. So every day
// bucket here is keyed by LOCAL midnight, formatted "2026-08-17": sortable,
// comparable with ===, and safe to put in a URL.
//
// Shared by the server page (which validates ?date= and stamps its own today)
// and the client filter (which corrects today to the reader's timezone).

import { LOCALE } from './datetime';

// These format a LOCAL-midnight Date and are deliberately not routed through
// `formatInZone`: a day key is already the reader's own day by construction, so
// the host's zone is the right one to render it in and the label comes out the
// same on both sides of a render. Only the locale is shared, so the whole app
// writes a date one way.

/** ?date= must look exactly like this, or it is ignored. */
export const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Local midnight of the day `date` falls on, as "2026-08-17". */
export function dayKeyOf(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** Same, from an ISO timestamp. */
export const dayKey = (iso: string): string => dayKeyOf(new Date(iso));

/** "2026-08-17" -> a local-midnight Date. Parsed without the Z, so it stays local. */
export const dayDate = (key: string): Date => new Date(`${key}T00:00:00`);

/** `key` shifted by `days`, as a key. */
export function addDays(key: string, days: number): string {
  const d = dayDate(key);
  d.setDate(d.getDate() + days);
  return dayKeyOf(d);
}

/**
 * "Today" / "Tomorrow" / "Sat 22 Aug".
 *
 * `todayKey` is empty on the very first client render (see FixturesFilter), and
 * the relative labels are skipped until it arrives: an absolute date is correct
 * in every timezone, where a guessed "Today" would not be.
 */
export function formatDayLabel(key: string, todayKey: string): string {
  if (todayKey) {
    if (key === todayKey) return 'Today';
    if (key === addDays(todayKey, 1)) return 'Tomorrow';
  }
  return dayDate(key).toLocaleDateString(LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** True when `formatDayLabel` will say "Today" or "Tomorrow" rather than a date. */
export const isRelativeDay = (key: string, todayKey: string): boolean =>
  Boolean(todayKey) && (key === todayKey || key === addDays(todayKey, 1));

/** "Monday 17 August" — the long form, for the heading of a single chosen day. */
export const formatDayLong = (key: string): string =>
  dayDate(key).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });

// ?date= carries a selection of days, in one of three shapes:
//   "2026-10-01"                   one day
//   "2026-10-01..2026-10-11"       a range, both ends included
//   "2026-10-02,2026-10-04"        separate days
// '' is the coming week. Anything else is ignored rather than half-read.

/** The longest range a link may expand to — two months of schedule. */
const MAX_RANGE_DAYS = 62;

const RANGE = '..';

/** The days a selection covers, in order. */
export function selectionDays(selection: string): string[] {
  if (!selection) return [];
  if (selection.includes(RANGE)) {
    const [from, to] = selection.split(RANGE);
    const days: string[] = [];
    for (let key = from; key <= to && days.length < MAX_RANGE_DAYS; key = addDays(key, 1)) days.push(key);
    return days;
  }
  return selection.split(',');
}

/** Days as the shortest selection that says the same thing. */
export function daysSelection(days: Iterable<string>): string {
  return [...new Set(days)]
    .filter((d) => DAY_KEY_PATTERN.test(d))
    .sort()
    .join(',');
}

/** The range between two days, whichever order they were picked in. */
export function rangeSelection(a: string, b: string): string {
  if (a === b) return a;
  return a < b ? `${a}${RANGE}${b}` : `${b}${RANGE}${a}`;
}

/** Add a day to a selection, or take it out if it is already there. */
export function toggleDay(selection: string, key: string): string {
  const days = new Set(selectionDays(selection));
  if (days.has(key)) days.delete(key);
  else days.add(key);
  return daysSelection(days);
}

/** "2026-10-01..2026-10-11" -> the start and end, or null for any other shape. */
export function selectionRange(selection: string): [string, string] | null {
  if (!selection.includes(RANGE)) return null;
  const [from, to] = selection.split(RANGE);
  return [from, to];
}

/** A ?date= value, or '' for the unfiltered view. */
export function pickDayParam(raw: string | string[] | undefined | null): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return '';
  if (value.includes(RANGE)) {
    const [from, to, extra] = value.split(RANGE);
    return extra === undefined && DAY_KEY_PATTERN.test(from) && DAY_KEY_PATTERN.test(to)
      ? rangeSelection(from, to)
      : '';
  }
  const days = value.split(',');
  return days.every((d) => DAY_KEY_PATTERN.test(d)) ? daysSelection(days) : '';
}

/** How a selection reads in a sentence: "on Monday 12 October", "from 1 Oct to 11 Oct". */
export function describeSelection(selection: string): string {
  const range = selectionRange(selection);
  const short = (key: string) => dayDate(key).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
  if (range) return `from ${short(range[0])} to ${short(range[1])}`;
  const days = selectionDays(selection);
  return days.length === 1 ? `on ${formatDayLong(days[0])}` : `on the ${days.length} days picked`;
}
