import Link from 'next/link';
import type { MatchStatus, SeriesSummary } from '@/types';
import type { MatchStateView } from '@/lib/matchState';
import { SERVER_ZONE, formatInZone } from '@/lib/datetime';
import StateChip from '../live/StateChip';
import Icon from '../ui/Icon';
import styles from './SeriesCard.module.scss';

const STATE: Record<MatchStatus, MatchStateView> = {
  LIVE: { key: 'LIVE', family: 'live', word: 'Live', label: 'Live', alive: true },
  UPCOMING: { key: 'UPCOMING', family: 'upcoming', word: 'Upcoming', label: 'Upcoming', alive: false },
  COMPLETED: { key: 'FINISHED', family: 'final', word: 'Finished', label: 'Finished', alive: false },
};

export function seriesState(status: MatchStatus): MatchStateView {
  return STATE[status];
}

// A span, not an instant: both ends are compared with === to spot a one-day
// series, so they must read the same on the server and in the browser.
export function seriesSpan(startIso: string, endIso: string): { start: string; end: string; oneDay: boolean } {
  const crossesYear = new Date(startIso).getFullYear() !== new Date(endIso).getFullYear();
  const start = formatInZone(startIso, crossesYear ? 'date' : 'dateShort', SERVER_ZONE);
  const end = formatInZone(endIso, 'date', SERVER_ZONE);
  return { start, end, oneDay: formatInZone(startIso, 'date', SERVER_ZONE) === end };
}

/** Played-vs-total rail. Widths are SVG attributes, so no inline styles. */
export function ProgressRail({
  played,
  total,
  live = false,
  className,
}: {
  played: number;
  total: number;
  live?: boolean;
  className?: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((played / total) * 1000) / 10) : 0;

  return (
    <svg
      className={`${styles.rail} ${className ?? ''}`}
      viewBox="0 0 100 4"
      preserveAspectRatio="none"
      data-live={live || undefined}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={played}
      aria-label={`${played} of ${total} matches played`}
    >
      <rect className={styles.railTrack} x="0" y="1.5" width="100" height="1" />
      <rect className={styles.railFill} x="0" y="0" width={pct} height="4" />
      {live && pct > 0 && pct < 100 && <rect className={styles.railTip} x={Math.max(0, pct - 1)} y="0" width="1" height="4" />}
    </svg>
  );
}

export default function SeriesCard({ series }: { series: SeriesSummary }) {
  const span = seriesSpan(series.startDate, series.endDate);
  const played =
    series.playedCount ?? (series.status === 'COMPLETED' ? series.matchCount : series.status === 'UPCOMING' ? 0 : null);
  const known = played !== null && series.matchCount > 0;

  return (
    <Link href={`/series/${series.id}`} className={styles.row} data-status={series.status}>
      <span className={styles.format}>{series.format}</span>

      <span className={styles.main}>
        <span className={styles.name}>{series.name}</span>
        <span className={styles.dates}>
          {span.oneDay ? (
            <time dateTime={series.startDate}>{span.end}</time>
          ) : (
            <>
              <time dateTime={series.startDate}>{span.start}</time>
              <span aria-hidden="true"> → </span>
              <time dateTime={series.endDate}>{span.end}</time>
            </>
          )}
        </span>
      </span>

      <span className={styles.progress}>
        <span className={styles.readout}>
          {known && series.status !== 'UPCOMING' ? (
            <>
              <span className={styles.readLabel}>Played</span>
              <span className={styles.readNum}>
                {played}
                <span className={styles.of}> / {series.matchCount}</span>
              </span>
            </>
          ) : (
            <>
              <span className={styles.readLabel}>{series.matchCount === 1 ? 'Match' : 'Matches'}</span>
              <span className={styles.readNum}>{series.matchCount}</span>
            </>
          )}
        </span>
        {known && <ProgressRail played={played} total={series.matchCount} live={series.status === 'LIVE'} />}
      </span>

      <StateChip state={seriesState(series.status)} className={styles.chip} />
      <Icon name="chevronRight" size={18} className={styles.go} />
    </Link>
  );
}
