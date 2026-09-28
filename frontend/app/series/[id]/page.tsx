import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Match, PointsTableRow } from '@/types';
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
import { LeaderFigure, SeriesLeadersBoard, rankedLeaders } from '../../../components/series/SeriesLeaders';
import SeriesTabs, { type SeriesTab } from '../../../components/series/SeriesTabs';
import { ProgressRail, seriesSpan, seriesState } from '../../../components/series/SeriesCard';
import MatchTile from '../../../components/match/MatchTile';
import UpcomingRail from '../../../components/home/UpcomingRail';
import ResultList from '../../../components/home/ResultList';
import StateChip from '../../../components/live/StateChip';
import FollowButton from '../../../components/follow/FollowButton';
import TeamBadge from '../../../components/ui/TeamBadge';
import LocalTime from '../../../components/ui/LocalTime';
import EmptyState from '../../../components/ui/EmptyState';
import BackButton from '../../../components/ui/BackButton';
import { PageHeader, SectionHead } from '../../../components/ui/Section';
import styles from './seriesDetail.module.scss';

// Freshness is per-fetch rather than a page-level `revalidate`: ISR would also
// cache the notFound() path and turn an unknown id into a soft 404.
const REVALIDATE = 300;
const LIVE_REVALIDATE = 15;

const TAB_KEYS = ['matches', 'table', 'stats'] as const;
type TabKey = (typeof TAB_KEYS)[number];

const UPCOMING_FIRST = 10;
const RESULTS_FIRST = 8;

async function loadSchedule(id: string): Promise<SeriesSchedule | null> {
  return getCrexSeriesSchedule(id, { revalidate: REVALIDATE }).catch(() => null);
}

export async function generateMetadata({ params }: { params: { id: string } }) {
  const series = await loadSchedule(params.id);
  if (!series) return { title: 'Series' };

  return {
    title: `${series.name} — Fixtures & Results`,
    description: `All ${series.matchCount} ${series.format} ${
      series.matchCount === 1 ? 'match' : 'matches'
    } in ${series.name}: fixtures, live scores and results.`,
  };
}

// The schedule carries no scores; a feed match (when the feed has it) does.
function toMatch(row: SeriesScheduleMatch, series: { id: string; name: string }): Match {
  const n = Number(row.matchNo);
  return {
    id: row.id,
    homeTeam: row.homeTeam,
    awayTeam: row.awayTeam,
    series,
    format: row.format,
    status: row.status,
    venue: row.venue,
    venueId: row.venueId,
    startTime: row.startTime,
    result: row.result,
    matchNumber: Number.isInteger(n) ? n : null,
  };
}

type NodeState = 'finished' | 'void' | 'live' | 'upcoming';

function nodeState(m: SeriesScheduleMatch): NodeState {
  if (m.status === 'LIVE') return 'live';
  if (m.status === 'UPCOMING') return 'upcoming';
  return /abandon|no result|cancel/i.test(m.result ?? '') ? 'void' : 'finished';
}

/** "Qualifier 1" → "Q1", "Final" → "F", "12" → "12". */
function nodeLabel(no: string | null, i: number): string {
  if (!no) return String(i + 1);
  if (/^\d+$/.test(no)) return no;
  const letters = no.match(/\b[A-Za-z]/g)?.join('').toUpperCase().slice(0, 2) ?? '';
  const digits = no.match(/\d+/)?.[0] ?? '';
  return (letters.slice(0, digits ? 1 : 2) + digits) || String(i + 1);
}

const LEGEND: Record<NodeState, string> = {
  finished: 'Played',
  void: 'No result',
  live: 'Live',
  upcoming: 'To play',
};

const NODE_WORD: Record<NodeState, string> = {
  finished: 'finished',
  void: 'no result',
  live: 'live',
  upcoming: 'upcoming',
};

function leaderOf(rows: PointsTableRow[]): PointsTableRow | null {
  return rows.reduce<PointsTableRow | null>((top, r) => (!top || (r.rank && r.rank < top.rank) ? r : top), null);
}

function More({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className={styles.more}>
      <summary className={styles.moreSummary}>{label}</summary>
      <div className={styles.moreBody}>{children}</div>
    </details>
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
    // Empty for a bilateral tour; the standings section is then absent.
    getCrexSeriesTable(params.id, { revalidate: REVALIDATE }).catch(() => []),
    getCrexSeriesLeaders(params.id, { revalidate: REVALIDATE }).catch(() => null),
  ]);

  // Schedule endpoint down: fall back to the feed's narrower view before 404-ing.
  const base = schedule ?? seriesScheduleFromMatches(params.id, feed);
  if (!base) notFound();

  const series = withFeedStatuses(base, feed);
  const ref = { id: series.id, name: series.name };
  const span = seriesSpan(series.startDate, series.endDate);

  const feedById = new Map(feed.map((m) => [m.id, m]));
  // Rendered with no ball feed to check a break against, and crex latches them for
  // hours — so a paused note is dropped and the card says only what the status proves.
  const verifiable = (m: Match): Match => (m.note?.paused ? { ...m, note: null } : m);
  const asMatch = (row: SeriesScheduleMatch) => verifiable(feedById.get(row.id) ?? toMatch(row, ref));

  const liveRows = series.matches.filter((m) => m.status === 'LIVE');
  const upcoming = series.matches.filter((m) => m.status === 'UPCOMING').map(asMatch);
  const results = series.matches
    .filter((m) => m.status === 'COMPLETED')
    .reverse()
    .map(asMatch);
  const live = liveRows.map(asMatch);
  const next = series.matches.find((m) => m.status === 'UPCOMING') ?? null;
  const total = series.matches.length || series.matchCount;
  const played = results.length;
  // A tour can run Tests and ODIs; one format label would misname half of it.
  const formats = [...new Set(series.matches.map((m) => m.format).filter(Boolean))];

  const shownLeaders = leaders ? rankedLeaders(leaders) : [];
  const topRuns = shownLeaders.find((l) => l.kind === 'RUNS');
  const topWickets = shownLeaders.find((l) => l.kind === 'WICKETS');
  const league = table.length === 1 && table[0].tournament ? table[0] : null;
  const topTeam = league ? leaderOf(league.rows) : null;
  const hasFigures = Boolean(topTeam || topRuns || topWickets);

  const tabs: SeriesTab[] = [
    { key: 'matches', label: 'Matches', count: series.matchCount },
    ...(table.length > 0 ? [{ key: 'table', label: 'Points table', count: table.length > 1 ? table.length : null }] : []),
    ...(shownLeaders.length > 0 ? [{ key: 'stats', label: 'Top performers' }] : []),
  ];

  // A tab this series has no section for falls back rather than 404-ing.
  const requested = pickParam<TabKey>(searchParams?.tab, TAB_KEYS, 'matches');
  const tab = tabs.some((t) => t.key === requested) ? requested : 'matches';

  return (
    <div className={styles.page}>
      <BackButton fallback="/series" className={styles.back} />

      <PageHeader
        eyebrow={`${formats.length > 1 ? formats.join(' · ') : series.format} series`}
        title={series.name}
        aside={<FollowButton kind="series" entity={ref} />}
      >
        <div className={styles.meta}>
          <StateChip state={seriesState(series.status)} />
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
        </div>
      </PageHeader>

      <section className={styles.control} data-figures={hasFigures || undefined} aria-label="Tournament progress">
        <div className={styles.progress}>
          <div className={styles.readoutRow}>
            <div className={styles.readout}>
              <span className={styles.label}>Played</span>
              <span className={styles.big}>
                {played}
                <span className={styles.of}>/{total}</span>
              </span>
            </div>
            <dl className={styles.counts}>
              {live.length > 0 && (
                <div data-kind="live">
                  <dt>Live</dt>
                  <dd>{live.length}</dd>
                </div>
              )}
              <div>
                <dt>To play</dt>
                <dd>{upcoming.length}</dd>
              </div>
            </dl>
          </div>

          <ProgressRail played={played} total={total} live={live.length > 0} className={styles.rail} />

          {series.matches.length > 1 && (
            <ol className={styles.nodes} aria-label="Every match">
              {series.matches.map((m, i) => {
                const state = nodeState(m);
                const title = `${m.matchNo && /^\d+$/.test(m.matchNo) ? `Match ${m.matchNo}` : (m.matchNo ?? `Match ${i + 1}`)}: ${m.homeTeam.shortName} v ${m.awayTeam.shortName}, ${m.result ?? NODE_WORD[state]}`;
                return (
                  <li key={m.key}>
                    <Link href={`/matches/${m.id}`} className={styles.node} data-state={state} title={title} aria-label={title}>
                      {nodeLabel(m.matchNo, i)}
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}

          {(next || series.matches.length > 1) && (
            <div className={styles.progressFoot}>
              {next && (
                <Link href={`/matches/${next.id}`} className={styles.next}>
                  <span className={styles.label}>Next</span>
                  <span className={styles.nextTeams}>
                    {next.homeTeam.shortName} <span className={styles.vs}>v</span> {next.awayTeam.shortName}
                  </span>
                  <LocalTime iso={next.startTime} format="dayTime" className={styles.nextTime} />
                </Link>
              )}
              {series.matches.length > 1 && (
                <ul className={styles.legend} aria-hidden="true">
                  {(['finished', 'void', 'live', 'upcoming'] as const)
                    .filter((k) => series.matches.some((m) => nodeState(m) === k))
                    .map((k) => (
                      <li key={k}>
                        <span className={styles.legendNode} data-state={k} />
                        {LEGEND[k]}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {hasFigures && (
          <div className={styles.figures}>
            {topTeam && (
              <Link href={`/series/${series.id}?tab=table`} scroll={false} className={styles.teamFigure}>
                <span className={styles.label}>Top of table</span>
                <span className={styles.teamBody}>
                  <TeamBadge name={topTeam.team.name} shortName={topTeam.team.shortName} logo={topTeam.team.logo} size="sm" />
                  <span className={styles.teamWho}>
                    <span className={styles.teamName}>{topTeam.team.name}</span>
                    {topTeam.netRunRate && (
                      <span className={styles.nrr} data-sign={topTeam.netRunRate.startsWith('-') ? 'neg' : 'pos'}>
                        NRR {topTeam.netRunRate}
                      </span>
                    )}
                  </span>
                  <span className={styles.pts}>
                    {topTeam.points}
                    <span className={styles.ptsUnit}>pts</span>
                  </span>
                </span>
              </Link>
            )}
            {topRuns && <LeaderFigure leader={topRuns} seriesId={series.id} />}
            {topWickets && <LeaderFigure leader={topWickets} seriesId={series.id} />}
          </div>
        )}
      </section>

      <SeriesTabs base={`/series/${series.id}`} tabs={tabs} active={tab} />

      {tab === 'matches' && (
        <div className={styles.sections}>
          {live.length > 0 && (
            <section>
              <SectionHead title="Live now" count={live.length} level={3} />
              <div className={styles.grid}>
                {live.map((m) => (
                  <MatchTile key={m.id} match={m} showSeries={false} />
                ))}
              </div>
            </section>
          )}

          <div className={styles.split} data-single={upcoming.length === 0 || results.length === 0 || undefined}>
            {upcoming.length > 0 && (
              <section>
                <SectionHead title="Coming up" count={upcoming.length} level={3} />
                <UpcomingRail matches={upcoming.slice(0, UPCOMING_FIRST)} />
                {upcoming.length > UPCOMING_FIRST && (
                  <More label={`${upcoming.length - UPCOMING_FIRST} more fixtures`}>
                    <UpcomingRail matches={upcoming.slice(UPCOMING_FIRST)} />
                  </More>
                )}
              </section>
            )}

            {results.length > 0 && (
              <section>
                <SectionHead title="Results" count={results.length} level={3} />
                <ResultList matches={results.slice(0, RESULTS_FIRST)} />
                {results.length > RESULTS_FIRST && (
                  <More label={`${results.length - RESULTS_FIRST} earlier results`}>
                    <ResultList matches={results.slice(RESULTS_FIRST)} />
                  </More>
                )}
              </section>
            )}
          </div>

          {upcoming.length === 0 && results.length === 0 && live.length === 0 && (
            <EmptyState icon="calendar" title="No matches listed yet" action={{ label: 'All series', href: '/series' }} />
          )}
        </div>
      )}

      {tab === 'table' && (
        <section>
          <SectionHead title="Standings" count={table.length > 1 ? table.length : undefined} level={3} />
          <PointsTable groups={table} />
        </section>
      )}

      {tab === 'stats' && leaders && (
        <section>
          <SectionHead title="Top performers" level={3} />
          <SeriesLeadersBoard leaders={leaders} seriesId={series.id} />
        </section>
      )}
    </div>
  );
}
