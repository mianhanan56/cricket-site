import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Match } from '@/types';
import {
  getCrexMatchList,
  getCrexSeriesSchedule,
  seriesScheduleFromMatches,
  withFeedStatuses,
  type SeriesSchedule,
  type SeriesScheduleMatch,
} from '../../../lib/crex';
import MatchCard from '../../../components/home/MatchCard';
import styles from './seriesDetail.module.scss';

// Ids here are crex series keys ("2AW", "2E2") — the same ones SeriesCard links
// with. Two sources, because neither is enough on its own:
//
//   /series/matches  the whole competition — every fixture, its date, its result.
//                    This is what the header's span and total are built from.
//   /matches/live    scores, but only for the handful of matches inside the
//                    feed's window. Used for the cards at the top.
//
// Freshness is set per-fetch rather than with a page-level `revalidate`: making
// the route ISR-cached would also cache the notFound() path, turning an unknown
// id into a soft 404 (the not-found page served with a 200). Same reasoning as
// /matches/[id].
const REVALIDATE = 300;
/** The live feed moves in seconds, so it is not cached to the schedule's window. */
const LIVE_REVALIDATE = 15;

async function loadSchedule(id: string): Promise<SeriesSchedule | null> {
  return getCrexSeriesSchedule(id, { revalidate: REVALIDATE }).catch(() => null);
}

export async function generateMetadata({ params }: { params: { id: string } }) {
  const series = await loadSchedule(params.id);
  if (!series) return { title: 'Series' };

  return {
    title: `${series.name} — Schedule & Results`,
    description: `All ${series.matchCount} ${series.format} ${
      series.matchCount === 1 ? 'match' : 'matches'
    } in ${series.name}: fixtures, live scores and results.`,
  };
}

function fmtDate(iso: string, withYear = true): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

function fmtDayTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}


/**
 * One row of the schedule. Deliberately not a MatchCard: the schedule endpoint
 * carries no scores, so a card shaped like a scorecard would sit permanently
 * empty. What it does carry — number, sides, time, result — is a list.
 */
function ScheduleRow({ match }: { match: SeriesScheduleMatch }) {
  const body = (
    <>
      <span className={styles.rowNo}>{match.matchNo ?? '—'}</span>

      <span className={styles.rowMain}>
        <span className={styles.rowTeams}>
          {match.homeTeam.shortName} <span className={styles.rowVs}>vs</span>{' '}
          {match.awayTeam.shortName}
        </span>
        <span className={styles.rowMeta}>
          {fmtDayTime(match.startTime)} · {match.venue}
        </span>
      </span>

      {/* A result when there is one, the state when there isn't. */}
      {match.status === 'COMPLETED' && match.result ? (
        <span className={styles.rowResult}>{match.result}</span>
      ) : (
        <span className={styles.rowStatus} data-status={match.status}>
          {match.status === 'LIVE' && <span className={styles.dot} aria-hidden="true" />}
          {match.status}
        </span>
      )}
    </>
  );

  // Unallocated fixtures (a league's playoffs, before the table decides them)
  // have no match page to open, so they render as a row rather than a link.
  return match.id ? (
    <Link href={`/matches/${match.id}`} className={styles.row}>
      {body}
    </Link>
  ) : (
    <div className={`${styles.row} ${styles.rowInert}`}>{body}</div>
  );
}

export default async function SeriesDetailPage({ params }: { params: { id: string } }) {
  const [schedule, feed] = await Promise.all([
    loadSchedule(params.id),
    getCrexMatchList({ revalidate: LIVE_REVALIDATE }).catch(() => [] as Match[]),
  ]);

  // With the schedule endpoint unreachable, fall back to the feed's narrower view
  // rather than 404-ing a series that plainly exists. Only when neither source
  // knows the key is this really not a page.
  const base = schedule ?? seriesScheduleFromMatches(params.id, feed);
  if (!base) notFound();

  const series = withFeedStatuses(base, feed);

  // Anything in progress, with its live score — the one thing the schedule
  // endpoint cannot supply.
  const liveNow = feed.filter((m) => m.series.id === series.id && m.status === 'LIVE');

  // Same rail as the series cards, and drawn at every stage for the same reason:
  // it is what carries the date span, so a card or header that dropped it lost
  // its bottom row. Empty before a ball is bowled, full once it is over.
  const pct =
    series.matchCount > 0 ? Math.round((series.playedCount / series.matchCount) * 100) : 0;

  // The rail's endpoints. The year prints on the end, and on the start only when
  // the span actually crosses one.
  const crossesYear =
    new Date(series.startDate).getFullYear() !== new Date(series.endDate).getFullYear();
  const start = fmtDate(series.startDate, crossesYear);
  const end = fmtDate(series.endDate);
  const oneDay = fmtDate(series.startDate) === end;

  return (
    <div className={styles.page}>
      <Link href="/series" className={styles.back}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5M11 18l-6-6 6-6" />
        </svg>
        All series
      </Link>

      <header className={styles.head} data-status={series.status}>
        <div className={styles.chips}>
          <span className={styles.format}>{series.format}</span>
          <span className={styles.status}>
            {series.status === 'LIVE' && <span className={styles.dot} aria-hidden="true" />}
            {series.status}
          </span>
        </div>

        <h1 className={styles.heading}>{series.name}</h1>

        {/* The same schedule block the series cards carry, sized up for a page
            header: how many are played, how far through, over what dates. The
            reader clicked that construct on /series and lands on it here. */}
        <div className={styles.progress}>
          <span className={styles.progressCount}>
            {series.playedCount > 0 ? (
              <>
                <span className={styles.progressDone}>{series.playedCount}</span>
                <span className={styles.progressOf} aria-hidden="true">
                  /
                </span>
                {series.matchCount}
                <span className={styles.progressLabel}>played</span>
              </>
            ) : (
              <>
                <span className={styles.progressDone}>{series.matchCount}</span>
                <span className={styles.progressLabel}>
                  {series.matchCount === 1 ? 'match' : 'matches'}
                </span>
              </>
            )}
          </span>

          <span
            className={styles.rail}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={series.matchCount}
            aria-valuenow={series.playedCount}
            aria-label={`${series.playedCount} of ${series.matchCount} matches played`}
          >
            <span className={styles.fill} data-pct={pct} />
          </span>

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
      </header>

      {liveNow.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            In progress
            <span className={styles.sectionCount}>{liveNow.length}</span>
          </h2>
          <div className={styles.grid}>
            {liveNow.map((m) => (
              <MatchCard match={m} key={m.id} />
            ))}
          </div>
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          Full schedule
          <span className={styles.sectionCount}>{series.matchCount}</span>
        </h2>
        <div className={styles.schedule}>
          {series.matches.map((m) => (
            <ScheduleRow match={m} key={m.key} />
          ))}
        </div>
      </section>
    </div>
  );
}
