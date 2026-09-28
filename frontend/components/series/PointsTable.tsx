import Link from 'next/link';
import type { PointsTableGroup, PointsTableRow } from '@/types';
import TeamBadge from '../ui/TeamBadge';
import styles from './PointsTable.module.scss';

/** Standings, one table per group so a group's third never sits above another's leader. */
export default function PointsTable({
  groups,
  highlight,
}: {
  groups: PointsTableGroup[];
  /** Team keys to mark — the two sides on a match page. */
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

// The fourth column is whichever crex sent: NR on limited-overs, Draw on Tests.
function Group({ group, marked }: { group: PointsTableGroup; marked: Set<string> }) {
  const hasDrawn = group.rows.some((r) => r.drawn !== null);
  const hasNoResult = group.rows.some((r) => r.noResult !== null);
  const hasRate = group.rows.some((r) => r.netRunRate !== null);
  // A bilateral series awards no points; crex sends a column of zeros there.
  const hasPoints = group.tournament;

  return (
    <div className={styles.group}>
      {group.name && <h3 className={styles.groupName}>{group.name}</h3>}

      <div className={styles.wrap}>
        <table className={styles.table}>
          <caption className={styles.srOnly}>
            {group.name ? `${group.name} standings` : 'Points table'}
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

/** Which of the three status states a side is in, if any. */
function tagState(row: PointsTableRow): 'champion' | 'qualified' | 'eliminated' | undefined {
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
  marked: boolean;
  hasPoints: boolean;
  hasDrawn: boolean;
  hasNoResult: boolean;
  hasRate: boolean;
}) {
  const state = tagState(row);

  return (
    <tr className={styles.row} data-state={state} data-marked={marked ? '' : undefined}>
      <td className={styles.rank}>
        <span className={styles.pos}>{row.rank || '—'}</span>
        {state && <StatusTag state={state} />}
      </td>

      <td className={styles.left}>
        <div className={styles.teamCell}>
          <TeamBadge name={row.team.name} shortName={row.team.shortName} logo={row.team.logo} size="sm" />

          <div className={styles.teamStack}>
            <Link href={`/teams/${row.teamKey}`} className={styles.teamName}>
              {row.team.name}
            </Link>

            {/* Columns dropped on a phone reappear under the name. */}
            <span className={styles.teamMeta}>
              {row.netRunRate && (
                <span
                  className={`${styles.metaSm} ${styles.metaNrr}`}
                  data-sign={row.netRunRate.startsWith('-') ? 'neg' : 'pos'}
                >
                  NRR {row.netRunRate}
                </span>
              )}
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
      {hasNoResult && <td className={`${styles.stat} ${styles.hideSm}`}>{row.noResult ?? 0}</td>}
      {hasRate && (
        <td
          className={`${styles.nrr} ${styles.hideSm}`}
          data-sign={row.netRunRate ? (row.netRunRate.startsWith('-') ? 'neg' : 'pos') : undefined}
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

/** The letter beside a team's name: Q through, C champion, E eliminated. */
const TAG = {
  champion: ['C', 'Champions'],
  qualified: ['Q', 'Qualified'],
  eliminated: ['E', 'Eliminated'],
} as const;

function StatusTag({ state }: { state: keyof typeof TAG }) {
  const [letter, label] = TAG[state];

  return (
    <span className={styles.tag} data-state={state} title={label}>
      <span aria-hidden="true">{letter}</span>
      <span className={styles.srOnly}>{label}</span>
    </span>
  );
}

const FORM_WORD = { W: 'won', L: 'lost', N: 'no result' } as const;

/** Last five, oldest first — crex's own order. */
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

/** Only the states actually present. */
function Legend({ groups }: { groups: PointsTableGroup[] }) {
  const rows = groups.flatMap((g) => g.rows);
  const keys = [
    rows.some((r) => r.champion) && (['champion', 'Champions'] as const),
    rows.some((r) => r.qualified && !r.champion) && (['qualified', 'Qualified'] as const),
    rows.some((r) => r.eliminated) && (['eliminated', 'Eliminated'] as const),
  ].filter(Boolean) as Array<readonly [keyof typeof TAG, string]>;

  if (!keys.length) return null;

  return (
    <ul className={styles.legend}>
      {keys.map(([state, label]) => (
        <li key={state}>
          <span className={styles.legendTag} data-state={state} aria-hidden="true">
            {TAG[state][0]}
          </span>
          {label}
        </li>
      ))}
    </ul>
  );
}
