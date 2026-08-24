import Link from 'next/link';
import type { SeriesSummary } from '@/types';
import { SERVER_ZONE, formatInZone } from '@/lib/datetime';
import styles from './SeriesCard.module.scss';

// A span, not an instant — the two ends are compared with === to spot a one-day
// series, so both have to read the same on the server and in the browser. See
// lib/datetime.
function fmtDate(iso: string, withYear = false): string {
  return formatInZone(iso, withYear ? 'date' : 'dateShort', SERVER_ZONE);
}

export default function SeriesCard({ series }: { series: SeriesSummary }) {
  const isLive = series.status === 'LIVE';

  // The rail's endpoints are the series' own start and end, so the year is
  // printed once — on the end — and only where the span actually crosses one.
  const crossesYear =
    new Date(series.startDate).getFullYear() !== new Date(series.endDate).getFullYear();
  const start = fmtDate(series.startDate, crossesYear);
  const end = fmtDate(series.endDate, true);
  const oneDay = fmtDate(series.startDate, true) === end;

  // The fill is the share of the schedule already played. Unlike the old rail
  // this is drawn at every stage — 0% for an upcoming series, full for a
  // finished one — because the rail is now also what carries the date span, and
  // a card that dropped it lost its bottom row entirely.
  const played = series.playedCount ?? (series.status === 'COMPLETED' ? series.matchCount : 0);
  const pct = series.matchCount > 0 ? Math.round((played / series.matchCount) * 100) : 0;
  const showTally = played > 0;

  return (
    <Link href={`/series/${series.id}`} className={styles.card} data-status={series.status}>
      {/* header — format chip on the left, status on the right */}
      <div className={styles.header}>
        <span className={styles.format}>{series.format}</span>
        <span className={styles.status}>
          {isLive && <span className={styles.dot} aria-hidden="true" />}
          {series.status}
        </span>
      </div>

      {/* series name — the headline of the card */}
      <h3 className={styles.name}>{series.name}</h3>

      {/* schedule block: how many are played, how far through, and over what dates */}
      <div className={styles.schedule}>
        <div className={styles.tally}>
          <span className={styles.count}>
            {showTally ? (
              <>
                <span className={styles.done}>{played}</span>
                <span className={styles.of} aria-hidden="true">
                  /
                </span>
                {series.matchCount}
                <span className={styles.label}>played</span>
              </>
            ) : (
              <>
                <span className={styles.done}>{series.matchCount}</span>
                <span className={styles.label}>
                  {series.matchCount === 1 ? 'match' : 'matches'}
                </span>
              </>
            )}
          </span>

          <span className={styles.view} aria-hidden="true">
            View
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </div>

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

        {/* the rail's endpoints are the span it covers */}
        <div className={styles.span}>
          {oneDay ? (
            <time dateTime={series.startDate} className={styles.single}>
              {end}
            </time>
          ) : (
            <>
              <time dateTime={series.startDate}>{start}</time>
              <time dateTime={series.endDate}>{end}</time>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
