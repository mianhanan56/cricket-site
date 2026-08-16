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
  return dayDate(key).toLocaleDateString('en-GB', {
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
  dayDate(key).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

/** A ?date= value, or '' for the unfiltered view. */
export function pickDayParam(raw: string | string[] | undefined | null): string {
  const first = Array.isArray(raw) ? raw[0] : raw;
  return first && DAY_KEY_PATTERN.test(first) ? first : '';
}
