import Link from 'next/link';
import type { SeriesSummary } from '@crex/shared';
import styles from './SeriesCard.module.scss';

const STATUS_CLASS: Record<SeriesSummary['status'], string> = {
  LIVE: 'isLive',
  UPCOMING: 'isUpcoming',
  COMPLETED: 'isCompleted',
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// Collapse a single-day span to one date; otherwise show "start → end".
function dateRange(start: string, end: string): { text: string; single: boolean } {
  const s = fmtDate(start);
  const e = fmtDate(end);
  return s === e ? { text: s, single: true } : { text: `${s} → ${e}`, single: false };
}

export default function SeriesCard({ series }: { series: SeriesSummary }) {
  const isLive = series.status === 'LIVE';
  const range = dateRange(series.startDate, series.endDate);

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
        <span>{range.text}</span>
      </div>

      {/* footer — match count + view link */}
      <div className={styles.footer}>
        <span className={styles.matches}>
          {series.matchCount} {series.matchCount === 1 ? 'match' : 'matches'}
        </span>
        <span className={styles.view}>
          View
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>
    </Link>
  );
}
