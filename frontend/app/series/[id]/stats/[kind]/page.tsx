import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { SeriesStatKind, SeriesStatRow, SeriesStatTable } from '@/types';
import {
  SERIES_STAT_KINDS,
  getCrexSeriesSchedule,
  getCrexSeriesStatTable,
  seriesStatLabel,
} from '../../../../../lib/crex';
import PlayerPortrait from '../../../../../components/player/PlayerPortrait';
import TableScroll from '../../../../../components/ui/TableScroll';
import TeamBadge from '../../../../../components/ui/TeamBadge';
import EmptyState from '../../../../../components/ui/EmptyState';
import BackButton from '../../../../../components/ui/BackButton';
import { PageHeader } from '../../../../../components/ui/Section';
import styles from './seriesStat.module.scss';

// Aggregated from every scorecard in the series, so cached hard.
const REVALIDATE = 900;

const SLUGS: Record<string, SeriesStatKind> = {
  'most-runs': 'RUNS',
  'most-wickets': 'WICKETS',
  'highest-score': 'HIGHEST_SCORE',
  'best-figures': 'BEST_FIGURES',
  'most-sixes': 'SIXES',
  'most-fours': 'FOURS',
  'most-fifties': 'FIFTIES',
  'most-hundreds': 'HUNDREDS',
  'best-strike-rate': 'STRIKE_RATE',
  'best-economy': 'ECONOMY',
};

// A page module may only export the page and its config, so the reverse map stays local.
const STAT_SLUGS = Object.fromEntries(Object.entries(SLUGS).map(([slug, kind]) => [kind, slug])) as Record<
  SeriesStatKind,
  string
>;

/** The ranked figure's column, and the supporting column it would duplicate. */
const HEADLINE: Record<SeriesStatKind, { head: string; unit: string | null; replaces: string }> = {
  RUNS: { head: 'Runs', unit: 'runs', replaces: 'Runs' },
  WICKETS: { head: 'Wkts', unit: 'wickets', replaces: 'Wkts' },
  HIGHEST_SCORE: { head: 'HS', unit: null, replaces: 'HS' },
  BEST_FIGURES: { head: 'BBI', unit: null, replaces: 'BBI' },
  SIXES: { head: '6s', unit: 'sixes', replaces: '6s' },
  FOURS: { head: '4s', unit: 'fours', replaces: '4s' },
  FIFTIES: { head: '50s', unit: 'fifties', replaces: '50' },
  HUNDREDS: { head: '100s', unit: 'hundreds', replaces: '100' },
  STRIKE_RATE: { head: 'SR', unit: 'strike rate', replaces: 'SR' },
  ECONOMY: { head: 'Econ', unit: 'economy', replaces: 'Econ' },
};

export async function generateMetadata({ params }: { params: { id: string; kind: string } }) {
  const kind = SLUGS[params.kind];
  if (!kind) return { title: 'Series stats' };

  const series = await getCrexSeriesSchedule(params.id, { revalidate: REVALIDATE }).catch(() => null);
  const label = seriesStatLabel(kind);

  return {
    title: series ? `${label} in ${series.name}` : label,
    description: series ? `${label} in ${series.name}: the leading ten, with innings, average and strike rate.` : undefined,
  };
}

const BATTING_COLUMNS = ['Runs', 'Mat', 'Inns', 'HS', 'Avg', 'SR', '100', '50', '4s', '6s'] as const;
const BOWLING_COLUMNS = ['Wkts', 'Mat', 'Inns', 'Ov', 'Runs', 'BBI', 'Avg', 'Econ', 'SR', '5w'] as const;

/** A figure, or an em dash where there is none — never a bare 0 standing in. */
const fig = (n: number | null, dp = 2): string => (n === null ? '—' : n.toFixed(dp));

function cellsFor(row: SeriesStatRow, discipline: SeriesStatTable['discipline']): string[] {
  const b = row.batting;
  const w = row.bowling;

  return discipline === 'BATTING'
    ? [
        String(b.runs),
        String(b.matches),
        String(b.innings),
        b.highest,
        fig(b.average),
        fig(b.strikeRate),
        String(b.hundreds),
        String(b.fifties),
        String(b.fours),
        String(b.sixes),
      ]
    : [
        String(w.wickets),
        String(w.matches),
        String(w.innings),
        w.overs.toFixed(1),
        String(w.runs),
        w.best,
        fig(w.average),
        fig(w.economy),
        fig(w.strikeRate, 1),
        String(w.fiveFors),
      ];
}

export default async function SeriesStatPage({ params }: { params: { id: string; kind: string } }) {
  const kind = SLUGS[params.kind];
  if (!kind) notFound();

  const [series, table] = await Promise.all([
    getCrexSeriesSchedule(params.id, { revalidate: REVALIDATE }).catch(() => null),
    getCrexSeriesStatTable(params.id, kind, { revalidate: REVALIDATE }).catch(() => null),
  ]);

  if (!series) notFound();

  const label = seriesStatLabel(kind);
  const headline = HEADLINE[kind];
  const columns: readonly string[] = table?.discipline === 'BOWLING' ? BOWLING_COLUMNS : BATTING_COLUMNS;
  const keep = columns.map((c, i) => [c, i] as const).filter(([c]) => c !== headline.replaces);
  const leader = table?.rows[0] ?? null;
  const leaderCells = leader && table ? cellsFor(leader, table.discipline) : [];
  const spotlight = keep.filter(([c]) => ['Mat', 'Inns', 'Avg', 'SR', 'Econ', 'Runs', 'Wkts'].includes(c)).slice(0, 4);

  return (
    <div className={styles.page}>
      <BackButton fallback={`/series/${params.id}`} className={styles.back} />

      <PageHeader eyebrow={series.name} title={label} />

      <nav className={styles.switcher} aria-label="Other rankings">
        <div className={styles.switchGroup}>
          {SERIES_STAT_KINDS.map((other) => (
            <Link
              key={other}
              href={`/series/${params.id}/stats/${STAT_SLUGS[other]}`}
              className={`${styles.switch} ${other === kind ? styles.on : ''}`}
              aria-current={other === kind ? 'page' : undefined}
            >
              {seriesStatLabel(other)}
            </Link>
          ))}
        </div>
      </nav>

      {!table || !leader ? (
        <EmptyState
          icon="rankings"
          title="Nothing to rank yet"
          action={{ label: 'Back to the series', href: `/series/${params.id}` }}
        />
      ) : (
        <>
          <Link href={`/players/${leader.playerKey}`} className={styles.spotlight}>
            <span className={styles.portrait}>
              <PlayerPortrait name={leader.playerName} src={leader.playerImage} />
            </span>

            <span className={styles.spotMain}>
              <span className={styles.spotLabel}>Leader</span>
              <span className={styles.spotName}>{leader.playerName}</span>
              <span className={styles.spotTeam}>
                <TeamBadge name={leader.team.name} shortName={leader.team.shortName} logo={leader.team.logo} size="xs" />
                {leader.team.name}
              </span>
            </span>

            <span className={styles.spotValue}>
              <span className={styles.spotNum}>{leader.value}</span>
              {headline.unit && <span className={styles.spotUnit}>{headline.unit}</span>}
            </span>

            {spotlight.length > 0 && (
              <span className={styles.spotStats}>
                {spotlight.map(([c, i]) => (
                  <span key={c} className={styles.spotStat}>
                    <span className={styles.spotStatLabel}>{c}</span>
                    <span className={styles.spotStatNum}>{leaderCells[i]}</span>
                  </span>
                ))}
              </span>
            )}
          </Link>

          <TableScroll className={styles.tableWrap} label={`${label} in ${series.name}`}>
            <table className={styles.table}>
              <caption className={styles.caption}>
                {label} in {series.name}: top {table.rows.length}, from {table.matchesCounted}{' '}
                {table.matchesCounted === 1 ? 'scorecard' : 'scorecards'}
                {table.qualifier ? `, minimum ${table.qualifier}` : ''}
              </caption>

              <thead>
                <tr>
                  <th scope="col" className={styles.rankCol}>
                    #
                  </th>
                  <th scope="col" className={styles.playerCol}>
                    Player
                  </th>
                  <th scope="col" className={styles.leadCol}>
                    {headline.head}
                  </th>
                  {keep.map(([c]) => (
                    <th scope="col" key={c}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {table.rows.map((row) => {
                  const cells = cellsFor(row, table.discipline);
                  return (
                    <tr key={row.playerKey} data-lead={row.rank === 1 || undefined}>
                      <td className={styles.rankCol}>{row.rank}</td>
                      <td className={styles.playerCol}>
                        <Link href={`/players/${row.playerKey}`} className={styles.player}>
                          <TeamBadge name={row.team.name} shortName={row.team.shortName} logo={row.team.logo} size="xs" />
                          <span className={styles.playerName}>{row.playerName}</span>
                          <span className={styles.playerTeam}>{row.team.shortName}</span>
                        </Link>
                      </td>
                      <td className={styles.leadCol}>{row.value}</td>
                      {keep.map(([c, i]) => (
                        <td key={c}>{cells[i]}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        </>
      )}
    </div>
  );
}
