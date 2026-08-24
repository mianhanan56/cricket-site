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
import RankingCrest from '../../../../../components/rankings/RankingCrest';
import BackButton from '../../../../../components/ui/BackButton';
import styles from './seriesStat.module.scss';

// The tables are read off every card in the series, so they are cached hard: a
// finished scorecard does not change, and a live one moves the top of a table by
// a run at a time.
const REVALIDATE = 900;

/** URL slug ⇄ stat kind. Slugs read as the thing they rank. */
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

// The reverse, for the switcher below. Not exported: a Next page module may
// only export the page and its route config, so the rail keeps its own copy.
const STAT_SLUGS: Record<SeriesStatKind, string> = Object.fromEntries(
  Object.entries(SLUGS).map(([slug, kind]) => [kind, slug])
) as Record<SeriesStatKind, string>;

export async function generateMetadata({
  params,
}: {
  params: { id: string; kind: string };
}) {
  const kind = SLUGS[params.kind];
  if (!kind) return { title: 'Series stats' };

  const series = await getCrexSeriesSchedule(params.id, { revalidate: REVALIDATE }).catch(
    () => null
  );
  const label = seriesStatLabel(kind);

  return {
    title: series ? `${label} in ${series.name}` : label,
    description: series
      ? `${label} in ${series.name}: the leading ten, with innings, average and strike rate.`
      : undefined,
  };
}

/** Which columns a table draws, in order. Batting and bowling read differently. */
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

export default async function SeriesStatPage({
  params,
}: {
  params: { id: string; kind: string };
}) {
  const kind = SLUGS[params.kind];
  if (!kind) notFound();

  const [series, table] = await Promise.all([
    getCrexSeriesSchedule(params.id, { revalidate: REVALIDATE }).catch(() => null),
    getCrexSeriesStatTable(params.id, kind, { revalidate: REVALIDATE }).catch(() => null),
  ]);

  if (!series) notFound();

  const columns = table?.discipline === 'BOWLING' ? BOWLING_COLUMNS : BATTING_COLUMNS;
  // The top three get the podium; everyone else is a row. Three because that is
  // what fits at portrait scale, and because a podium of one is not a podium.
  const podium = table?.rows.slice(0, 3) ?? [];

  return (
    <div className={styles.page}>
      <BackButton fallback={`/series/${params.id}`} />

      <header className={styles.head}>
        <p className={styles.eyebrow}>{series.name}</p>
        <h1 className={styles.heading}>{seriesStatLabel(kind)}</h1>
      </header>

      {/* Sibling rankings, so a reader who wanted wickets rather than runs does
          not have to go back to the series page to change their mind. */}
      <nav className={styles.switcher} aria-label="Other rankings">
        {SERIES_STAT_KINDS.map((other) => (
          <Link
            key={other}
            href={`/series/${params.id}/stats/${STAT_SLUGS[other]}`}
            className={`${styles.switch} ${other === kind ? styles.switchOn : ''}`}
            aria-current={other === kind ? 'page' : undefined}
          >
            {seriesStatLabel(other)}
          </Link>
        ))}
      </nav>

      {!table ? (
        <p className={styles.empty}>
          Nothing to rank yet — no completed scorecard in this series.
        </p>
      ) : (
        <>
          <div className={styles.podium}>
            {podium.map((row) => (
              <Link
                href={`/players/${row.playerKey}`}
                className={styles.podiumCard}
                data-rank={row.rank}
                key={row.playerKey}
              >
                <span className={styles.podiumRank}>{row.rank}</span>

                <span className={styles.podiumHalo}>
                  <PlayerPortrait name={row.playerName} src={row.playerImage} />
                </span>

                <span className={styles.podiumFigure}>{row.value}</span>
                <span className={styles.podiumName}>{row.playerName}</span>
                <span className={styles.podiumTeam}>
                  <RankingCrest
                    name={row.team.name}
                    shortName={row.team.shortName}
                    logo={row.team.logo}
                  />
                  <span>{row.team.name}</span>
                </span>
              </Link>
            ))}
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className={styles.caption}>
                {seriesStatLabel(kind)} in {series.name} — top {table.rows.length}, from{' '}
                {table.matchesCounted} {table.matchesCounted === 1 ? 'scorecard' : 'scorecards'}
                {table.qualifier ? `, minimum ${table.qualifier}` : ''}
              </caption>

              <thead>
                <tr>
                  <th scope="col" className={styles.numCol}>
                    #
                  </th>
                  <th scope="col" className={styles.playerCol}>
                    Player
                  </th>
                  {columns.map((c, i) => (
                    // The first figure is the one the table is ranked by, so it
                    // carries the accent all the way down the column.
                    <th scope="col" key={c} className={i === 0 ? styles.leadCol : undefined}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {table.rows.map((row) => {
                  const cells = cellsFor(row, table.discipline);

                  return (
                    <tr key={row.playerKey}>
                      <td className={styles.numCol}>{row.rank}</td>
                      <td className={styles.playerCol}>
                        <Link href={`/players/${row.playerKey}`} className={styles.player}>
                          <RankingCrest
                            name={row.team.name}
                            shortName={row.team.shortName}
                            logo={row.team.logo}
                          />
                          <span className={styles.playerName}>{row.playerName}</span>
                          <span className={styles.playerTeam}>{row.team.shortName}</span>
                        </Link>
                      </td>
                      {cells.map((cell, i) => (
                        <td
                          key={columns[i]}
                          className={i === 0 ? styles.leadCol : undefined}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
