import Link from 'next/link';
import type { PointsTableGroup, PointsTableRow } from '@/types';
import RankingCrest from '../rankings/RankingCrest';
import styles from './PointsTable.module.scss';

/**
 * A series' standings.
 *
 * The one thing a league page could not show before, and the reason a reader
 * opens one: a list of results is something they have to add up themselves.
 *
 * Rendered as one table per group because crex sends groups — a league answers
 * with one, a World Cup group stage with one per group — and a flat table would
 * put Group A's third-placed side above Group B's leader.
 *
 * Signature element is the **status rail**: the 3px edge on each row, mint for a
 * side that is through, amber for the champion, dim for the eliminated. A table
 * exists to say who is still alive, so that is carried as structure rather than
 * as another badge competing with the numbers.
 */
export default function PointsTable({
  groups,
  highlight,
}: {
  groups: PointsTableGroup[];
  /**
   * Team keys to mark. Set on a match page to the two sides playing: on an
   * eight-row table the reader's question is "where are these two", and making
   * them findable is the difference between the table being context and being a
   * grid they have to search.
   */
  highlight?: string[];
}) {
  if (!groups.length) return null;

  const marked = new Set(highlight ?? []);

  return (
    <div className={styles.groups}>
      {groups.map((group, i) => (
        <Group group={group} marked={marked} key={group.name ?? i} />
      ))}

      <Legend groups={groups} />
    </div>
  );
}

/**
 * One group's table.
 *
 * The fourth column is whichever of the two crex actually sent: `NR` on a
 * limited-overs table, `Draw` on a Test one. Drawing both would put an empty
 * column on every table, and drawing neither would lose the one that decides a
 * Test series.
 */
function Group({ group, marked }: { group: PointsTableGroup; marked: Set<string> }) {
  const hasDrawn = group.rows.some((r) => r.drawn !== null);
  const hasNoResult = group.rows.some((r) => r.noResult !== null);
  const hasRate = group.rows.some((r) => r.netRunRate !== null);
  // Points are a competition's currency. A bilateral series has none to award —
  // crex sends the column anyway, full of zeros — so it is dropped there rather
  // than printed as a fact about the series.
  const hasPoints = group.tournament;

  return (
        <div className={styles.group}>
          {group.name && <h3 className={styles.groupName}>{group.name}</h3>}

          <div className={styles.wrap}>
            <table className={styles.table}>
              <caption className={styles.srOnly}>
                {group.name ? `${group.name} standings` : 'Points table'} — played, won,
                lost, and — where the competition and format have them — drawn or
                no-result, net run rate and points
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={styles.rankHead}>
                    <span className={styles.srOnly}>Position</span>
                    <span aria-hidden="true">#</span>
                  </th>
                  <th scope="col" className={styles.left}>
                    Team
                  </th>
                  <th scope="col">
                    <abbr title="Played">P</abbr>
                  </th>
                  <th scope="col">
                    <abbr title="Won">W</abbr>
                  </th>
                  <th scope="col">
                    <abbr title="Lost">L</abbr>
                  </th>
                  {hasDrawn && (
                    <th scope="col" className={styles.hideSm}>
                      <abbr title="Drawn">D</abbr>
                    </th>
                  )}
                  {hasNoResult && (
                    <th scope="col" className={styles.hideSm}>
                      <abbr title="No result">NR</abbr>
                    </th>
                  )}
                  {hasRate && (
                    <th scope="col" className={styles.hideSm}>
                      <abbr title="Net run rate">NRR</abbr>
                    </th>
                  )}
                  <th scope="col" className={styles.hideTablet}>
                    Form
                  </th>
                  {hasPoints && (
                    <th scope="col" className={styles.ptsHead}>
                      <abbr title="Points">Pts</abbr>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => (
                  <Row
                    row={row}
                    marked={marked.has(row.teamKey)}
                    hasPoints={hasPoints}
                    hasDrawn={hasDrawn}
                    hasNoResult={hasNoResult}
                    hasRate={hasRate}
                    key={row.teamKey || row.rank}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
  );
}

/** Which of the three rail states a side is in, if any. */
function railState(row: PointsTableRow): 'champion' | 'qualified' | 'eliminated' | undefined {
  if (row.champion) return 'champion';
  if (row.qualified) return 'qualified';
  if (row.eliminated) return 'eliminated';
  return undefined;
}

function Row({
  row,
  marked,
  hasPoints,
  hasDrawn,
  hasNoResult,
  hasRate,
}: {
  row: PointsTableRow;
  /** One of the sides the surrounding page is about. */
  marked: boolean;
  /** The competition awards points. False on a bilateral series. */
  hasPoints: boolean;
  hasDrawn: boolean;
  hasNoResult: boolean;
  hasRate: boolean;
}) {
  const state = railState(row);

  return (
    <tr className={styles.row} data-state={state} data-marked={marked ? '' : undefined}>
      <td className={styles.rank}>{row.rank || '—'}</td>

      <td className={styles.left}>
        <div className={styles.teamCell}>
          <RankingCrest name={row.team.name} shortName={row.team.shortName} logo={row.team.logo} />

          <div className={styles.teamStack}>
            {/* Every side in a table is now a page. This is the densest place in
                the app where team keys appear, so it is the most valuable one to
                make openable. */}
            <Link href={`/teams/${row.teamKey}`} className={styles.teamName}>
              {row.team.name}
              {row.champion && (
                <span className={styles.trophy} title="Champions" aria-label="Champions">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
                    <path d="M6 3h12v2h3v3a4 4 0 0 1-4 4h-.35A6 6 0 0 1 13 15.9V19h3v2H8v-2h3v-3.1A6 6 0 0 1 7.35 12H7a4 4 0 0 1-4-4V5h3V3Zm0 4H5v1a2 2 0 0 0 1 1.73V7Zm12 0v2.73A2 2 0 0 0 19 8V7h-1Z" />
                  </svg>
                </span>
              )}
            </Link>

            {/* The columns the table drops on a phone, reappearing under the
                name — the same escape hatch the rankings table uses, so a narrow
                viewport never scrolls a table sideways. */}
            <span className={styles.teamMeta}>
              {row.netRunRate && <span className={styles.metaSm}>NRR {row.netRunRate}</span>}
              {!!row.drawn && <span className={styles.metaSm}>{row.drawn} drawn</span>}
              {!!row.noResult && <span className={styles.metaSm}>{row.noResult} NR</span>}
              {row.form.length > 0 && <FormStrip form={row.form} inline />}
            </span>
          </div>
        </div>
      </td>

      <td className={styles.stat}>{row.played}</td>
      <td className={styles.stat}>{row.won}</td>
      <td className={styles.stat}>{row.lost}</td>
      {hasDrawn && <td className={`${styles.stat} ${styles.hideSm}`}>{row.drawn ?? 0}</td>}
      {hasNoResult && (
        <td className={`${styles.stat} ${styles.hideSm}`}>{row.noResult ?? 0}</td>
      )}
      {hasRate && (
        <td
          className={`${styles.nrr} ${styles.hideSm}`}
          data-sign={row.netRunRate?.startsWith('-') ? 'neg' : 'pos'}
        >
          {row.netRunRate ?? '—'}
        </td>
      )}
      <td className={styles.hideTablet}>
        {row.form.length > 0 ? <FormStrip form={row.form} /> : <span className={styles.none}>—</span>}
      </td>
      {hasPoints && <td className={styles.pts}>{row.points}</td>}
    </tr>
  );
}

const FORM_WORD = { W: 'won', L: 'lost', N: 'no result' } as const;

/**
 * Last five, oldest first — crex's own order, kept, because a form strip reads
 * left to right like the season did.
 */
function FormStrip({ form, inline = false }: { form: Array<'W' | 'L' | 'N'>; inline?: boolean }) {
  return (
    <span className={`${styles.form} ${inline ? styles.formInline : ''}`}>
      <span className={styles.srOnly}>
        Last {form.length}, oldest first: {form.map((f) => FORM_WORD[f]).join(', ')}
      </span>
      {form.map((f, i) => (
        <span className={styles.formDot} data-result={f} key={i} aria-hidden="true">
          {f}
        </span>
      ))}
    </span>
  );
}

/**
 * Only ever drawn for the states actually present. A legend explaining
 * "eliminated" above a table with nobody eliminated is decoration.
 */
function Legend({ groups }: { groups: PointsTableGroup[] }) {
  const rows = groups.flatMap((g) => g.rows);
  const keys = [
    rows.some((r) => r.champion) && (['champion', 'Champions'] as const),
    rows.some((r) => r.qualified && !r.champion) && (['qualified', 'Qualified'] as const),
    rows.some((r) => r.eliminated) && (['eliminated', 'Eliminated'] as const),
  ].filter(Boolean) as Array<readonly [string, string]>;

  if (!keys.length) return null;

  return (
    <ul className={styles.legend}>
      {keys.map(([state, label]) => (
        <li key={state}>
          <span className={styles.legendRail} data-state={state} aria-hidden="true" />
          {label}
        </li>
      ))}
    </ul>
  );
}
