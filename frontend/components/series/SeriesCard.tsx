import Link from 'next/link';
import type { SeriesSummary } from '@/types';
import styles from './SeriesCard.module.scss';

const STATUS_CLASS: Record<SeriesSummary['status'], string> = {
  LIVE: 'isLive',
  UPCOMING: 'isUpcoming',
  COMPLETED: 'isCompleted',
};

function fmtDate(iso: string, withYear = true): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

/**
 * "21 Jul → 16 Aug 2026", collapsed to one date for a single-day series.
 *
 * The year is printed once. Real series spans run weeks — now that these are the
 * whole competition rather than the feed's window, repeating "2026" on both ends
 * is noise on every card.
 */
function dateRange(start: string, end: string): string {
  const sameYear = new Date(start).getFullYear() === new Date(end).getFullYear();
  const s = fmtDate(start, !sameYear);
  const e = fmtDate(end);
  return fmtDate(start) === e ? e : `${s} → ${e}`;
}

export default function SeriesCard({ series }: { series: SeriesSummary }) {
  const isLive = series.status === 'LIVE';
  const range = dateRange(series.startDate, series.endDate);

  // Progress only means something part-way through — nothing played yet, or
  // everything played, is already said by the status pill, so the rail stays off.
  const played = series.playedCount;
  const inProgress = played !== undefined && played > 0 && played < series.matchCount;
  const pct = inProgress ? Math.round((played / series.matchCount) * 100) : 0;

  return (
    <Link href={`/series/${series.id}`} className={styles.card}>
      {/* header — format chip on the left, status on the right */}
      <div className={styles.header}>
        <span className={styles.format}>{series.format}</span>
        <span className={`${styles.status} ${styles[STATUS_CLASS[series.status]]}`}>
          {isLive && <span className={styles.dot} aria-hidden="true" />}
          {series.status}
        </span>
      </div>

      {/* series name */}
      <h3 className={styles.name}>{series.name}</h3>

      {/* date range (collapsed to one date for single-day series) */}
      <div className={styles.dates}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        <span>{range}</span>
      </div>

      {/* footer — the series' progress through its schedule, and the view link */}
      <div className={styles.footer}>
        <div className={styles.tally}>
          {inProgress ? (
            <span className={styles.count}>
              <span className={styles.done}>{played}</span>
              <span className={styles.of} aria-hidden="true">
                /
              </span>
              {series.matchCount}
              <span className={styles.label}>played</span>
            </span>
          ) : (
            <span className={styles.count}>
              {series.matchCount}
              <span className={styles.label}>
                {series.matchCount === 1 ? 'match' : 'matches'}
              </span>
            </span>
          )}

          <span className={styles.view}>
            View
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </div>

        {/* The rail carries the "how far through" reading that a bare number can't. */}
        {inProgress && (
          <span
            className={styles.rail}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={series.matchCount}
            aria-valuenow={played}
            aria-label={`${played} of ${series.matchCount} matches played`}
          >
            <span className={styles.fill} data-pct={pct} />
          </span>
        )}
      </div>
    </Link>
  );
}
