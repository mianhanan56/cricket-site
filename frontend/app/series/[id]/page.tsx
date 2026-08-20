import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Match } from '@/types';
import {
  getCrexMatchList,
  getCrexSeriesLeaders,
  getCrexSeriesSchedule,
  getCrexSeriesTable,
  seriesScheduleFromMatches,
  withFeedStatuses,
  type SeriesSchedule,
  type SeriesScheduleMatch,
} from '../../../lib/crex';
import { pickParam } from '../../../lib/queryParams';
import PointsTable from '../../../components/series/PointsTable';
import { SeriesKeyStats } from '../../../components/series/SeriesLeaders';
import SeriesTabs, { type SeriesTab } from '../../../components/series/SeriesTabs';
import styles from './seriesDetail.module.scss';

// Ids here are crex series keys ("2AW", "2E2") — the same ones SeriesCard links
// with. Two sources, because neither is enough on its own:
//
//   /series/matches  the whole competition — every fixture, its date, its result.
//                    This is what the header's span and total are built from.
//   /matches/live    which of those matches is on right now. Only used to
//                    correct the schedule's statuses — the live scores
//                    themselves belong on the match page.
//
// Freshness is set per-fetch rather than with a page-level `revalidate`: making
// the route ISR-cached would also cache the notFound() path, turning an unknown
// id into a soft 404 (the not-found page served with a 200). Same reasoning as
// /matches/[id].
const REVALIDATE = 300;
/** The live feed moves in seconds, so it is not cached to the schedule's window. */
const LIVE_REVALIDATE = 15;

// The page's two sections, read off `?tab=`. Server-rendered rather than
// switched in the client so the standings stay in the HTML — same reasoning as
// the filters on /series and /fixtures. The stat rankings are not a third tab:
// each one is a page of its own under /series/[id]/stats, opened from the rail.
const TAB_KEYS = ['matches', 'table'] as const;
type TabKey = (typeof TAB_KEYS)[number];

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

  // Every row opens, including a fixture crex has not allocated a match key to
  // yet: `match.id` is that key where there is one and the fixture's preview id
  // where there is not (see scheduledMatchId), and /matches/[id] takes both.
  return (
    <Link href={`/matches/${match.id}`} className={styles.row}>
      {body}
    </Link>
  );
}

export default async function SeriesDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const [schedule, feed, table, leaders] = await Promise.all([
    loadSchedule(params.id),
    getCrexMatchList({ revalidate: LIVE_REVALIDATE }).catch(() => [] as Match[]),
    // Empty for a bilateral tour, which is most series — the standings section
    // is simply absent there rather than rendering an empty table.
    getCrexSeriesTable(params.id, { revalidate: REVALIDATE }).catch(() => []),
    // Null before a ball is bowled, and on any series crex has no leaders for.
    // The stats tab is absent there rather than empty.
    getCrexSeriesLeaders(params.id, { revalidate: REVALIDATE }).catch(() => null),
  ]);

  // With the schedule endpoint unreachable, fall back to the feed's narrower view
  // rather than 404-ing a series that plainly exists. Only when neither source
  // knows the key is this really not a page.
  const base = schedule ?? seriesScheduleFromMatches(params.id, feed);
  if (!base) notFound();

  const series = withFeedStatuses(base, feed);

  // The two ends of the span. The year prints on the end, and on the start only
  // when the span actually crosses one.
  const crossesYear =
    new Date(series.startDate).getFullYear() !== new Date(series.endDate).getFullYear();
  const start0 = fmtDate(series.startDate, crossesYear);
  const end0 = fmtDate(series.endDate);
  const oneDay = fmtDate(series.startDate) === end0;

  // Only the sections that have something in them. Matches is always first and
  // is therefore the default — a series always has a schedule, and a tour with
  // neither table nor leaders shows no rail at all.
  const tabs: SeriesTab[] = [
    { key: 'matches', label: 'Matches', count: series.matchCount },
    ...(table.length > 0
      ? [
          {
            key: 'table',
            label: 'Points table',
            count: table.length > 1 ? table.length : null,
          },
        ]
      : []),
  ];

  // A tab named in the URL that this series has no section for falls back rather
  // than 404-ing: ?tab=stats is a perfectly good link that stops meaning
  // anything when a tour ends and crex drops its leaders.
  const requested = pickParam<TabKey>(searchParams?.tab, TAB_KEYS, 'matches');
  const tab = tabs.some((t) => t.key === requested) ? requested : 'matches';

  return (
    <div className={styles.page}>
      <Link href="/series" className={styles.back}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5M11 18l-6-6 6-6" />
        </svg>
        All series
      </Link>

      <header className={styles.head}>
        <h1 className={styles.heading}>{series.name}</h1>

        {/* When it runs, and nothing else. The played-count went with the live
            strip: the tab rail already says how many matches there are, and the
            schedule under it says which of them have been played and how. */}
        <dl className={styles.facts}>
          <div className={styles.fact}>
            <dt className={styles.factLabel}>Schedule</dt>
            <dd className={`${styles.factValue} ${styles.factDates}`}>
              {oneDay ? (
                <time dateTime={series.startDate}>{end0}</time>
              ) : (
                <>
                  <time dateTime={series.startDate}>{start0}</time>
                  <span className={styles.factArrow} aria-hidden="true">
                    →
                  </span>
                  <time dateTime={series.endDate}>{end0}</time>
                </>
              )}
            </dd>
          </div>

        </dl>
      </header>

      {/* Two columns from the laptop band up: the sections on the left, the
          tournament's key stats in the right rail. Each rail card opens the full
          ranking behind it — the top ten, with the figures that produced it. */}
      <div className={styles.body} data-rail={leaders ? 'true' : undefined}>
        <div className={styles.main}>
          <SeriesTabs base={`/series/${series.id}`} tabs={tabs} active={tab} />

          {tab === 'matches' && (
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
          )}

          {tab === 'table' && (
            <section className={styles.section}>
              {/* "Standings", not "Points table" again: the tab above it already
              says that, and a heading that repeats its own tab is furniture. */}
              <h2 className={styles.sectionTitle}>
                Standings
                {table.length > 1 && (
                  <span className={styles.sectionCount}>{table.length} groups</span>
                )}
              </h2>
              <PointsTable groups={table} />
            </section>
          )}

        </div>

        {leaders && (
          <aside className={styles.aside}>
            <SeriesKeyStats leaders={leaders} seriesId={series.id} />
          </aside>
        )}
      </div>
    </div>
  );
}
