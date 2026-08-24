// Dates and times, formatted in a named timezone rather than in whoever's
// timezone happens to be running the code.
//
// This exists because `toLocaleString(undefined, …)` reads the *host's* zone,
// and this app has two hosts. On the server that is Vercel's UTC, so a 19:30
// IST start rendered as "2:00 PM" for every reader on earth; in the browser it
// is the reader's own, so the same string changed the moment React hydrated and
// the SSR markup no longer matched. A live-scores site cannot be wrong about
// when a match starts, and it cannot flicker while correcting itself either.
//
// So: every formatter here takes an explicit zone, which makes it a pure
// function of (instant, zone) and therefore deterministic on both sides of a
// render. Components that show an instant use `<LocalTime>`, which renders
// SERVER_ZONE on the server and switches to the reader's on mount. Values that
// are calendar dates rather than instants — a date of birth, a series' span —
// pass SERVER_ZONE directly and stay identical everywhere, which is what a
// calendar date should do.

/** One locale for the whole app. Day-first, which is how every date here reads. */
export const LOCALE = 'en-GB';

/**
 * The zone the server renders in, and the first paint in the browser.
 *
 * UTC rather than a cricket-playing zone on purpose: it is the one choice that
 * cannot silently look right in testing and be wrong in production, and it is
 * what `<LocalTime>` corrects away from on mount.
 */
export const SERVER_ZONE = 'UTC';

/** The shapes anything in this app renders a date or a time in. */
export type DateStyle =
  /** "24 Aug 2026" */
  | 'date'
  /** "24 Aug" */
  | 'dateShort'
  /** "Sat, 24 Aug 2026" */
  | 'dayDate'
  /** "Sat, 24 Aug, 6:30 pm" */
  | 'dayTime'
  /** "6:30 pm" */
  | 'time';

// 12-hour throughout: a start time is read at a glance, and "6:30 pm" is the
// clock most readers keep.
const STYLES: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  date: { day: 'numeric', month: 'short', year: 'numeric' },
  dateShort: { day: 'numeric', month: 'short' },
  dayDate: { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' },
  dayTime: {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  },
  time: { hour: 'numeric', minute: '2-digit', hour12: true },
};

/**
 * Format an ISO instant in a named zone.
 *
 * Never throws: an unparseable timestamp renders as an em dash rather than
 * "Invalid Date", and an unknown zone falls back to UTC rather than taking the
 * page down. Both are things upstream can hand us.
 */
export function formatInZone(iso: string, style: DateStyle, timeZone: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';

  try {
    return new Intl.DateTimeFormat(LOCALE, { ...STYLES[style], timeZone }).format(at);
  } catch {
    return new Intl.DateTimeFormat(LOCALE, { ...STYLES[style], timeZone: SERVER_ZONE }).format(at);
  }
}

/**
 * The reader's own zone. Browser-only — on the server there is no such thing,
 * and pretending otherwise is the bug this module exists to fix.
 */
export function readerZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || SERVER_ZONE;
  } catch {
    return SERVER_ZONE;
  }
}
