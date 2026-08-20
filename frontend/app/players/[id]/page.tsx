import Link from 'next/link';
import { notFound } from 'next/navigation';
import type {
  PlayerBattingCareer,
  PlayerBowlingCareer,
  PlayerFormEntry,
  PlayerProfile,
} from '@/types';
import { getCrexPlayerProfile, teamLogoUrl } from '../../../lib/crex';
import PlayerPortrait from '../../../components/player/PlayerPortrait';
import styles from './player.module.scss';

// Ids here are crex player f_keys ("1IG", "FW") — the same ones every scorecard
// line, squad list and ranking row already carries, so any name the app prints
// can link straight here without a lookup.
//
// Freshness is set per-fetch rather than with a page-level `revalidate`, for the
// same reason as /matches/[id] and /series/[id]: an ISR-cached route caches the
// notFound() path too, which serves an unknown key as a soft 404.
const REVALIDATE = 3600;

async function loadPlayer(id: string): Promise<PlayerProfile | null> {
  return getCrexPlayerProfile(id, { revalidate: REVALIDATE }).catch(() => null);
}

export async function generateMetadata({ params }: { params: { id: string } }) {
  const player = await loadPlayer(params.id);
  if (!player) return { title: 'Player' };

  // The best single line about a player is their strongest career row, and
  // "strongest" is simply the one with the most runs or wickets behind it.
  const bat = [...player.batting].sort((a, b) => b.runs - a.runs)[0];
  const bowl = [...player.bowling].sort((a, b) => b.wickets - a.wickets)[0];
  const line = bat?.runs
    ? `${bat.runs} runs at ${bat.average.toFixed(2)} in ${bat.format}`
    : bowl?.wickets
      ? `${bowl.wickets} wickets at ${bowl.average.toFixed(2)} in ${bowl.format}`
      : null;

  return {
    title: `${player.name} — Profile, Stats & Recent Form`,
    description: [
      `${player.name}${player.countryShortName ? `, ${player.countryShortName}` : ''} — ${player.role.toLowerCase()}.`,
      line && `${line}.`,
      'Career stats, recent form and career debut information.',
    ]
      .filter(Boolean)
      .join(' '),
  };
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Two decimals, but never "0.00" for a figure the player has not earned. */
function fmtRate(value: number): string {
  return value > 0 ? value.toFixed(2) : '—';
}

function fmtCount(value: number | null): string {
  return value === null ? '—' : String(value);
}

/**
 * One innings from the last ten, as a tile.
 *
 * The tile is the page's one bold element, so the milestone tiers are carried
 * here and nowhere else: a hundred or a five-wicket haul fills mint, a fifty or
 * a three-wicket haul outlines it, and everything else stays quiet. That makes a
 * player's form legible as a shape before a single number is read — which is the
 * whole point of putting ten innings in a row.
 */
function FormTile({ entry, discipline }: { entry: PlayerFormEntry; discipline: 'batting' | 'bowling' }) {
  // The figures are already composed, so the tier is read off the leading
  // number: runs scored on a batting tile, wickets taken on a bowling one.
  const lead = Number.parseInt(entry.figures, 10) || 0;
  const tier =
    discipline === 'batting'
      ? lead >= 100
        ? styles.landmark
        : lead >= 50
          ? styles.notable
          : ''
      : lead >= 5
        ? styles.landmark
        : lead >= 3
          ? styles.notable
          : '';

  const body = (
    <>
      <span className={styles.formFigures}>
        {entry.figures}
        {entry.notOut && <span className={styles.formNotOut}>*</span>}
      </span>
      <span className={styles.formFixture}>{entry.fixture}</span>
      {entry.format && <span className={styles.formFormat}>{entry.format}</span>}
    </>
  );

  // An innings whose match crex no longer keys is still worth showing; it just
  // has nothing to open.
  return entry.matchId ? (
    <Link href={`/matches/${entry.matchId}`} className={`${styles.formTile} ${tier}`}>
      {body}
    </Link>
  ) : (
    <div className={`${styles.formTile} ${styles.formInert} ${tier}`}>{body}</div>
  );
}

function FormRail({
  title,
  entries,
  discipline,
}: {
  title: string;
  entries: PlayerFormEntry[];
  discipline: 'batting' | 'bowling';
}) {
  if (!entries.length) return null;

  return (
    <div className={styles.formGroup}>
      <h3 className={styles.formTitle}>{title}</h3>
      <div className={styles.formRail}>
        {entries.map((entry, i) => (
          // crex sends one row per innings, and a Test gives a player two in the
          // same match — the match key is not unique here, the position is.
          <FormTile key={`${entry.matchId}-${i}`} entry={entry} discipline={discipline} />
        ))}
      </div>
    </div>
  );
}

/**
 * Career rows split into international and everything else.
 *
 * crex prints one undifferentiated list, and it reads as a ranking of the
 * player's competitions when it is nothing of the kind — 1,300 T20 Blast runs
 * sitting directly under 3,395 Test runs invites exactly the comparison that
 * makes no sense. Two groups, each with its own subtotal, is the same data
 * saying something true.
 */
function groupCareer<T extends { international: boolean }>(rows: T[]): Array<[string, T[]]> {
  const international = rows.filter((r) => r.international);
  const club = rows.filter((r) => !r.international);
  // One group only: no headings, because there is nothing to tell apart.
  if (!international.length || !club.length) return [['', rows]];
  return [
    ['International', international],
    ['Domestic & franchise', club],
  ];
}

/** Sum one column across every row. */
function total<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((sum, row) => sum + pick(row), 0);
}

/**
 * The highest score, linked to the innings it was made in where crex still keys
 * that match.
 */
function HighScore({ row }: { row: PlayerBattingCareer }) {
  if (!row.highScore) return <>—</>;
  if (!row.highScoreMatchId) return <>{row.highScore}</>;

  return (
    <Link href={`/matches/${row.highScoreMatchId}`} className={styles.cellLink}>
      {row.highScore}
    </Link>
  );
}

function BattingCareer({ rows }: { rows: PlayerBattingCareer[] }) {
  const groups = groupCareer(rows);

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.left} scope="col">
              Format
            </th>
            <th scope="col">Mat</th>
            <th scope="col">Inn</th>
            <th scope="col">Runs</th>
            <th scope="col">HS</th>
            <th scope="col">Avg</th>
            <th scope="col">SR</th>
            <th scope="col">100s</th>
            <th scope="col">50s</th>
            <th scope="col">4s</th>
            <th scope="col">6s</th>
            <th scope="col">Ducks</th>
          </tr>
        </thead>
        {groups.map(([label, group]) => (
          <tbody key={label || 'all'}>
            {label && (
              <tr className={styles.groupRow}>
                <th className={styles.left} colSpan={12} scope="colgroup">
                  {label}
                </th>
              </tr>
            )}
            {group.map((r) => (
              <tr key={r.format}>
                <th className={styles.left} scope="row">
                  {r.format}
                </th>
                <td>{r.matches}</td>
                <td>{r.innings}</td>
                <td className={styles.figure}>{r.runs}</td>
                <td>
                  <HighScore row={r} />
                </td>
                <td>{fmtRate(r.average)}</td>
                <td>{fmtRate(r.strikeRate)}</td>
                <td>{r.hundreds}</td>
                <td>{r.fifties}</td>
                <td>{r.fours}</td>
                <td>{r.sixes}</td>
                <td>{fmtCount(r.ducks)}</td>
              </tr>
            ))}
          </tbody>
        ))}
        {/* Career totals — only where there is more than one row to add up, and
            only the columns that genuinely do: an average and a strike rate would
            need dismissals and balls faced, which crex does not send per format,
            so they are dashed rather than invented from the per-format figures. */}
        {rows.length > 1 && (
        <tfoot>
          <tr className={styles.totalRow}>
            <th className={styles.left} scope="row">
              Career
            </th>
            <td>{total(rows, (r) => r.matches)}</td>
            <td>{total(rows, (r) => r.innings)}</td>
            <td className={styles.figure}>{total(rows, (r) => r.runs)}</td>
            <td>{Math.max(...rows.map((r) => r.highScore)) || '—'}</td>
            <td>—</td>
            <td>—</td>
            <td>{total(rows, (r) => r.hundreds)}</td>
            <td>{total(rows, (r) => r.fifties)}</td>
            <td>{total(rows, (r) => r.fours)}</td>
            <td>{total(rows, (r) => r.sixes)}</td>
            <td>—</td>
          </tr>
        </tfoot>
        )}
      </table>
    </div>
  );
}

function BowlingCareer({ rows }: { rows: PlayerBowlingCareer[] }) {
  const groups = groupCareer(rows);

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.left} scope="col">
              Format
            </th>
            <th scope="col">Mat</th>
            <th scope="col">Inn</th>
            <th scope="col">Wkts</th>
            <th scope="col">Best</th>
            <th scope="col">Avg</th>
            <th scope="col">Econ</th>
            <th scope="col">SR</th>
            <th scope="col">3W</th>
            <th scope="col">5W</th>
          </tr>
        </thead>
        {groups.map(([label, group]) => (
          <tbody key={label || 'all'}>
            {label && (
              <tr className={styles.groupRow}>
                <th className={styles.left} colSpan={10} scope="colgroup">
                  {label}
                </th>
              </tr>
            )}
            {group.map((r) => (
              <tr key={r.format}>
                <th className={styles.left} scope="row">
                  {r.format}
                </th>
                <td>{r.matches}</td>
                <td>{r.innings}</td>
                <td className={styles.figure}>{r.wickets}</td>
                <td>{r.best ?? '—'}</td>
                <td>{fmtRate(r.average)}</td>
                <td>{fmtRate(r.economy)}</td>
                <td>{fmtRate(r.strikeRate)}</td>
                <td>{r.threeWickets}</td>
                <td>{r.fiveWickets}</td>
              </tr>
            ))}
          </tbody>
        ))}
        {rows.length > 1 && (
        <tfoot>
          <tr className={styles.totalRow}>
            <th className={styles.left} scope="row">
              Career
            </th>
            <td>{total(rows, (r) => r.matches)}</td>
            <td>{total(rows, (r) => r.innings)}</td>
            <td className={styles.figure}>{total(rows, (r) => r.wickets)}</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>{total(rows, (r) => r.threeWickets)}</td>
            <td>{total(rows, (r) => r.fiveWickets)}</td>
          </tr>
        </tfoot>
        )}
      </table>
    </div>
  );
}

export default async function PlayerPage({ params }: { params: { id: string } }) {
  const player = await loadPlayer(params.id);
  if (!player) notFound();

  const crest = teamLogoUrl(player.countryKey ?? undefined);

  // crex returns a row per competition it has ever listed the player under,
  // played or not: a squad member who never got a game carries "T20I 0 0 0 —",
  // and a batter carries nine bowling rows of zeros. Neither says anything, so a
  // row has to have a match behind it to appear — and a bowling row has to have
  // an over behind it, not just a cap.
  const batting = player.batting.filter((r) => r.matches > 0);
  const bowling = player.bowling.filter((r) => r.innings > 0 || r.wickets > 0);

  // The "About" block is a list of facts, and half of them are missing on a
  // domestic debutant. Building it as rows keeps the empty ones out rather than
  // printing a column of dashes.
  //
  // The third slot is a casing flag, not decoration: crex writes the traits in
  // lower case ("right handed · opener") and the rest of the fields in their own
  // ("Keighley, Yorkshire", "6 ft 1 in"). Capitalising the block wholesale is
  // what turns a height into "6 Ft 1 In", so only the traits are marked.
  const about: Array<[string, string, boolean?]> = [
    ['Role', player.role],
    player.bats && ['Bats', player.bats, true],
    player.bowls && ['Bowls', player.bowls, true],
    player.dateOfBirth && [
      'Born',
      `${fmtDate(player.dateOfBirth)}${player.age !== null ? ` (${player.age} yrs)` : ''}`,
    ],
    player.birthPlace && ['Birthplace', player.birthPlace],
    player.height && ['Height', player.height],
    player.nationality && ['Nationality', player.nationality],
    player.popularShot && ['Popular shot', player.popularShot, true],
  ].filter(Boolean) as Array<[string, string, boolean?]>;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <PlayerPortrait name={player.name} src={player.image} />

        <div className={styles.identity}>
          <h1 className={styles.name}>{player.name}</h1>

          <p className={styles.meta}>
            {player.countryShortName && (
              <span className={styles.country}>
                {crest && (
                  /* eslint-disable-next-line @next/next/no-img-element -- see PlayerPortrait */
                  <img src={crest} alt="" width={18} height={18} decoding="async" />
                )}
                {player.countryShortName}
              </span>
            )}
            {player.age !== null && <span>{player.age} yrs</span>}
            <span>{player.role}</span>
          </p>

          {/* A live ICC position is the one credential worth putting in a
              header — it dates itself, and it is the only number here that
              compares this player to every other. */}
          {player.rankings.length > 0 && (
            <ul className={styles.ranks}>
              {player.rankings.map((r) => (
                <li key={`${r.format}-${r.discipline}`} className={styles.rank}>
                  <span className={styles.rankPos}>#{r.position}</span>
                  {r.discipline} · {r.format}
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>

      {(player.recentBatting.length > 0 || (bowling.length > 0 && player.recentBowling.length > 0)) && (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Recent form</h2>
          <FormRail title="Batting" entries={player.recentBatting} discipline="batting" />
          {/* Same rule as the career table below: a batter who has bowled two
              overs all season has a bowling rail full of 0-somethings, which is
              not form. */}
          {bowling.length > 0 && (
            <FormRail title="Bowling" entries={player.recentBowling} discipline="bowling" />
          )}
        </section>
      )}

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>About</h2>
        <dl className={styles.about}>
          {about.map(([label, value, capitalize]) => (
            <div key={label} className={styles.aboutRow}>
              <dt>{label}</dt>
              <dd className={capitalize ? styles.capitalize : undefined}>{value}</dd>
            </div>
          ))}
        </dl>

        {player.teams.length > 0 && (
          <div className={styles.teams}>
            <h3 className={styles.teamsTitle}>Teams</h3>
            <ul className={styles.teamList}>
              {player.teams.map((team) => (
                <li key={team}>{team}</li>
              ))}
            </ul>
          </div>
        )}

        {(player.instagram || player.twitter) && (
          <ul className={styles.social}>
            {player.instagram && (
              <li>
                <a
                  href={`https://instagram.com/${player.instagram}`}
                  rel="noopener noreferrer nofollow"
                  target="_blank"
                >
                  Instagram
                </a>
              </li>
            )}
            {player.twitter && (
              <li>
                <a
                  href={`https://x.com/${player.twitter}`}
                  rel="noopener noreferrer nofollow"
                  target="_blank"
                >
                  X / Twitter
                </a>
              </li>
            )}
          </ul>
        )}
      </section>

      {batting.length > 0 && (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Career batting</h2>
          <BattingCareer rows={batting} />
        </section>
      )}

      {bowling.length > 0 && (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Career bowling</h2>
          <BowlingCareer rows={bowling} />
        </section>
      )}

      {player.debuts.length > 0 && (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Career debuts</h2>
          <dl className={styles.debuts}>
            {player.debuts.map((d) => (
              <div key={d.format} className={styles.debutRow}>
                <dt>{d.format}</dt>
                <dd>
                  {d.matchId ? (
                    <Link href={`/matches/${d.matchId}`} className={styles.cellLink}>
                      {d.fixture}
                    </Link>
                  ) : (
                    d.fixture
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {player.bio && (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Profile</h2>
          {/* crex's HTML, stripped to a handful of structural tags with every
              attribute dropped — see `sanitizeBio` in lib/crex. Printed in full:
              the bio carries the domestic career and the story the tables
              cannot, and hiding it behind a toggle was one click between the
              reader and the only prose on the page. */}
          <div className={styles.bioBody} dangerouslySetInnerHTML={{ __html: player.bio }} />
        </section>
      )}
    </div>
  );
}
