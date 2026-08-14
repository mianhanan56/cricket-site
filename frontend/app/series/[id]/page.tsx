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

/** "21 Jul → 16 Aug 2026" — the year printed once. */
function span(start: string, end: string): string {
  const sameYear = new Date(start).getFullYear() === new Date(end).getFullYear();
  return fmtDate(start) === fmtDate(end)
    ? fmtDate(end)
    : `${fmtDate(start, !sameYear)} → ${fmtDate(end)}`;
}

/**
 * One row of the schedule. Deliberately not a MatchCard: the schedule endpoint
 * carries no scores, so a card shaped like a scorecard would sit permanently
 * empty. What it does carry — number, sides, time, result — is a list.
 */
function ScheduleRow({ match }: { match: SeriesScheduleMatch }) {
  const isDone = match.status === 'COMPLETED';

  // Unallocated fixtures (a league's playoffs, before the table decides them)
  // have no match page to open, so they render as a row rather than a link.
  const Row = match.id
    ? ({ children }: { children: React.ReactNode }) => (
        <Link href={`/matches/${match.id}`} className={styles.row}>
          {children}
        </Link>
      )
    : ({ children }: { children: React.ReactNode }) => (
        <div className={`${styles.row} ${styles.rowInert}`}>{children}</div>
      );

  return (
    <Row>
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
      {isDone && match.result ? (
        <span className={styles.rowResult}>{match.result}</span>
      ) : (
        <span
          className={`${styles.rowStatus} ${
            match.status === 'LIVE' ? styles.live : styles.upcoming
          }`}
        >
          {match.status === 'LIVE' && <span className={styles.dot} aria-hidden="true" />}
          {match.status}
        </span>
      )}
    </Row>
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
  const status = series.status;

  // Anything in progress, with its live score — the one thing the schedule
  // endpoint cannot supply.
  const liveNow = feed.filter((m) => m.series.id === series.id && m.status === 'LIVE');

  return (
    <div className={styles.page}>
      <Link href="/series" className={styles.back}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5M11 18l-6-6 6-6" />
        </svg>
        All series
      </Link>

      <header className={styles.head}>
        <div className={styles.chips}>
          <span className={styles.format}>{series.format}</span>
          <span className={`${styles.status} ${styles[status.toLowerCase()]}`}>
            {status === 'LIVE' && <span className={styles.dot} aria-hidden="true" />}
            {status}
          </span>
        </div>

        <h1 className={styles.heading}>{series.name}</h1>

        <p className={styles.meta}>
          {span(series.startDate, series.endDate)}
          <span className={styles.sep} aria-hidden="true">
            ·
          </span>
          {series.matchCount} {series.matchCount === 1 ? 'match' : 'matches'}
          {/* Progress reads as information mid-series and as noise either side of
              it — 0 played before it starts, all played once it is over. */}
          {series.playedCount > 0 && series.playedCount < series.matchCount && (
            <>
              <span className={styles.sep} aria-hidden="true">
                ·
              </span>
              {series.playedCount} played
            </>
          )}
        </p>
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
