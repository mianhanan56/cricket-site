// Day keys ("2026-08-17") for the fixtures calendar: sortable, comparable with ===, safe in a URL.
// An instant becomes a key only in an explicit zone (SERVER_ZONE until the reader's is known), so
// server and first client render bucket alike. Key arithmetic and labels run in UTC, never the host's zone.

import { LOCALE, SERVER_ZONE } from './datetime';

/** ?date= must look exactly like this, or it is ignored. */
export const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day: the right shape, and it survives a round trip ("2026-02-30" does not). */
export function isDayKey(key: string): boolean {
  if (!DAY_KEY_PATTERN.test(key)) return false;
  const d = new Date(`${key}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === key;
}

const keyFormats = new Map<string, Intl.DateTimeFormat>();

function keyFormat(zone: string): Intl.DateTimeFormat {
  let f = keyFormats.get(zone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch {
      return keyFormat(SERVER_ZONE);
    }
    keyFormats.set(zone, f);
  }
  return f;
}

/** The day an instant falls on in `zone`, or '' for an unreadable instant. */
export function dayKeyIn(at: string | Date, zone: string): string {
  const d = typeof at === 'string' ? new Date(at) : at;
  if (Number.isNaN(d.getTime())) return '';
  const part: Record<string, string> = {};
  for (const { type, value } of keyFormat(zone).formatToParts(d)) part[type] = value;
  return `${part.year}-${part.month}-${part.day}`;
}

/** UTC midnight of `key` — a carrier for arithmetic and labels, always read back in UTC. */
export const dayDate = (key: string): Date => new Date(`${key}T00:00:00Z`);

/** Day of the month, 1–31. */
export const dayOfMonth = (key: string): number => dayDate(key).getUTCDate();

/** `key` shifted by `days`, or '' when `key` is not a day. */
export function addDays(key: string, days: number): string {
  if (!isDayKey(key)) return '';
  const d = dayDate(key);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`. */
export const daysBetween = (from: string, to: string): number =>
  Math.round((+dayDate(to) - +dayDate(from)) / 86_400_000);

/** A day key in words, in the app's locale. */
export const formatDayKey = (key: string, options: Intl.DateTimeFormatOptions): string =>
  dayDate(key).toLocaleDateString(LOCALE, { ...options, timeZone: 'UTC' });

/** "Today" / "Tomorrow" / "Sat 22 Aug"; relative words only once `todayKey` is known. */
export function formatDayLabel(key: string, todayKey: string): string {
  if (todayKey) {
    if (key === todayKey) return 'Today';
    if (key === addDays(todayKey, 1)) return 'Tomorrow';
  }
  return formatDayKey(key, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "Monday 17 August" — the long form, for the heading of a single chosen day. */
export const formatDayLong = (key: string): string =>
  formatDayKey(key, { weekday: 'long', day: 'numeric', month: 'long' });

// ?date= carries a selection of days, in one of three shapes:
//   "2026-10-01"                   one day
//   "2026-10-01..2026-10-11"       a range, both ends included
//   "2026-10-02,2026-10-04"        separate days
// '' is every day. Anything else is ignored rather than half-read.

/** The longest range a link may expand to — two months of schedule. */
const MAX_RANGE_DAYS = 62;

const RANGE = '..';

/** The days a selection covers, in order; anything that is not a real day is dropped. */
export function selectionDays(selection: string): string[] {
  if (!selection) return [];
  if (selection.includes(RANGE)) {
    const [from, to] = selection.split(RANGE);
    if (!isDayKey(from) || !isDayKey(to)) return [];
    const days: string[] = [];
    for (let key = from; key && key <= to && days.length < MAX_RANGE_DAYS; key = addDays(key, 1)) days.push(key);
    return days;
  }
  return selection.split(',').filter(isDayKey);
}

/** Days as the shortest selection that says the same thing. */
export function daysSelection(days: Iterable<string>): string {
  return [...new Set(days)].filter(isDayKey).sort().join(',');
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
  return isDayKey(from) && isDayKey(to) ? [from, to] : null;
}

/** A ?date= value, or '' for the unfiltered view. */
export function pickDayParam(raw: string | string[] | undefined | null): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return '';
  if (value.includes(RANGE)) {
    const [from, to, extra] = value.split(RANGE);
    return extra === undefined && isDayKey(from) && isDayKey(to) ? rangeSelection(from, to) : '';
  }
  const days = value.split(',');
  return days.every(isDayKey) ? daysSelection(days) : '';
}

/** How a selection reads in a sentence: "on Monday 12 October", "from 1 Oct to 11 Oct". */
export function describeSelection(selection: string): string {
  const range = selectionRange(selection);
  const short = (key: string) => formatDayKey(key, { day: 'numeric', month: 'short' });
  if (range) return `from ${short(range[0])} to ${short(range[1])}`;
  const days = selectionDays(selection);
  if (!days.length) return 'on the days picked';
  return days.length === 1 ? `on ${formatDayLong(days[0])}` : `on the ${days.length} days picked`;
}
