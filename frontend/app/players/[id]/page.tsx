import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type {
  PlayerBattingCareer,
  PlayerBowlingCareer,
  PlayerFormEntry,
  PlayerProfile,
  PlayerRanking,
} from '@/types';
import { getCrexPlayerProfile, teamLogoUrl } from '@/lib/crex';
import { SERVER_ZONE, formatInZone } from '@/lib/datetime';
import PlayerPortrait from '@/components/player/PlayerPortrait';
import TableScroll from '@/components/ui/TableScroll';
import BackButton from '@/components/ui/BackButton';
import TeamBadge from '@/components/ui/TeamBadge';
import FollowButton from '@/components/follow/FollowButton';
import PlayerSeriesSection, { PlayerSeriesSkeleton } from '@/components/player/PlayerSeriesSection';
import { isSeriesFormatKey, seriesFormatOptions } from '@/lib/playerSeries';
import { SectionHead } from '@/components/ui/Section';
import { RANKINGS_FORMAT_KEYS, type RankingsFormat } from '@/lib/tabs';
import styles from './player.module.scss';

// Per-fetch freshness, not a page-level revalidate: ISR would cache notFound() for unknown keys.
const REVALIDATE = 3600;

async function loadPlayer(id: string): Promise<PlayerProfile | null> {
  return getCrexPlayerProfile(id, { revalidate: REVALIDATE }).catch(() => null);
}

export async function generateMetadata({ params }: { params: { id: string } }) {
  const player = await loadPlayer(params.id);
  if (!player) return { title: 'Player' };

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

// A birth date is a calendar date, so it is formatted in a fixed zone rather than shifted.
const fmtDate = (iso: string) => formatInZone(iso, 'date', SERVER_ZONE);
const fmtRate = (value: number) => (value > 0 ? value.toFixed(2) : '—');
const fmtCount = (value: number | null) => (value === null ? '—' : String(value));

/** crex lists one undifferentiated set; international and club careers are not comparable. */
function groupCareer<T extends { international: boolean }>(rows: T[]): Array<[string, T[]]> {
  const international = rows.filter((r) => r.international);
  const club = rows.filter((r) => !r.international);
  if (!international.length || !club.length) return [['', rows]];
  return [
    ['International', international],
    ['Domestic & franchise', club],
  ];
}

const total = <T,>(rows: T[], pick: (row: T) => number) => rows.reduce((sum, row) => sum + pick(row), 0);

// ---------------------------------------------------------------- Form

const BAR_H = 72;

type Discipline = 'batting' | 'bowling';

/** Leading number of crex's composed figures: runs on "22 (34)", wickets on "3-41". */
const leadOf = (entry: PlayerFormEntry) => Number.parseInt(entry.figures, 10) || 0;

function tierOf(lead: number, discipline: Discipline): 'landmark' | 'notable' | 'plain' {
  const [notable, landmark] = discipline === 'batting' ? [50, 100] : [3, 5];
  return lead >= landmark ? 'landmark' : lead >= notable ? 'notable' : 'plain';
}

function FormStrip({ entries, discipline }: { entries: PlayerFormEntry[]; discipline: Discipline }) {
  // crex sends newest first; the strip reads left to right in time.
  const chrono = [...entries].reverse();
  const scale = Math.max(discipline === 'batting' ? 100 : 5, ...chrono.map(leadOf));
  const guides = (discipline === 'batting' ? [50, 100] : [3, 5]).filter((g) => g <= scale);
  const y = (v: number) => BAR_H - (v / scale) * BAR_H;

  return (
    <div className={styles.strip}>
      <ol className={styles.bars}>
        {chrono.map((entry, i) => {
          const lead = leadOf(entry);
          const h = Math.max(2, (lead / scale) * BAR_H);
          const figure = discipline === 'batting' ? `${lead}${entry.notOut ? '*' : ''}` : entry.figures.split(/\s/)[0];
          const label = `${entry.figures}${entry.notOut ? ' not out' : ''}, ${entry.fixture}${entry.format ? `, ${entry.format}` : ''}`;
          const body = (
            <>
              <svg className={styles.barSvg} viewBox={`0 0 20 ${BAR_H}`} preserveAspectRatio="none" aria-hidden="true">
                {guides.map((g) => (
                  <line key={g} x1="0" x2="20" y1={y(g)} y2={y(g)} className={styles.guide} />
                ))}
                <rect x="3" y={BAR_H - h} width="14" height={h} rx="1.5" className={styles[tierOf(lead, discipline)]} />
              </svg>
              <span className={styles.barFig}>{figure}</span>
            </>
          );
          return (
            <li key={`${entry.matchId}-${i}`} className={styles.barItem}>
              {entry.matchId ? (
                <Link href={`/matches/${entry.matchId}`} className={styles.bar} aria-label={label} title={label}>
                  {body}
                </Link>
              ) : (
                <span className={styles.bar} aria-label={label} title={label} role="img">
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <div className={styles.axis} aria-hidden="true">
        <span>Older</span>
        <span>Latest</span>
      </div>
    </div>
  );
}

function FormList({ entries, discipline }: { entries: PlayerFormEntry[]; discipline: Discipline }) {
  return (
    <ol className={styles.formList}>
      {entries.map((entry, i) => {
        const tier = tierOf(leadOf(entry), discipline);
        const body = (
          <>
            <span className={styles.formFig} data-tier={tier}>
              {entry.figures}
              {entry.notOut && <span className={styles.notOut}>*</span>}
            </span>
            <span className={styles.formFixture}>{entry.fixture}</span>
            {entry.format && <span className={styles.formFormat}>{entry.format}</span>}
            {entry.date && <span className={styles.formDate}>{fmtDate(entry.date)}</span>}
          </>
        );
        return (
          <li key={`${entry.matchId}-${i}`}>
            {entry.matchId ? (
              <Link href={`/matches/${entry.matchId}`} className={styles.formRow}>
                {body}
              </Link>
            ) : (
              <div className={styles.formRow}>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function FormPanel({ title, entries, discipline }: { title: string; entries: PlayerFormEntry[]; discipline: Discipline }) {
  if (!entries.length) return null;
  return (
    <section className={styles.formPanel} aria-label={`${title} form`}>
      <h3 className={styles.panelTitle}>
        {title}
        <span className={styles.panelCount}>{entries.length}</span>
      </h3>
      <FormStrip entries={entries} discipline={discipline} />
      <FormList entries={entries} discipline={discipline} />
    </section>
  );
}

// ---------------------------------------------------------------- Career

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
  return (
    <TableScroll className={styles.tableWrap} label="Batting career by format">
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Format</th>
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
        {groupCareer(rows).map(([label, group]) => (
          <tbody key={label || 'all'}>
            {label && (
              <tr className={styles.groupRow}>
                <th colSpan={12} scope="colgroup">
                  {label}
                </th>
              </tr>
            )}
            {group.map((r) => (
              <tr key={r.format}>
                <th scope="row">{r.format}</th>
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
        {/* Averages and strike rates need dismissals and balls faced, which crex does not send per format. */}
        {rows.length > 1 && (
          <tfoot>
            <tr>
              <th scope="row">Career</th>
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
    </TableScroll>
  );
}

function BowlingCareer({ rows }: { rows: PlayerBowlingCareer[] }) {
  return (
    <TableScroll className={styles.tableWrap} label="Bowling career by format">
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Format</th>
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
        {groupCareer(rows).map(([label, group]) => (
          <tbody key={label || 'all'}>
            {label && (
              <tr className={styles.groupRow}>
                <th colSpan={10} scope="colgroup">
                  {label}
                </th>
              </tr>
            )}
            {group.map((r) => (
              <tr key={r.format}>
                <th scope="row">{r.format}</th>
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
            <tr>
              <th scope="row">Career</th>
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
    </TableScroll>
  );
}

// ---------------------------------------------------------------- Page

const RANK_CATEGORY = { Batter: 'batting', Bowler: 'bowling', 'All Rounder': 'all-rounder' } as const;

/** The rankings list a profile's position comes from, when it is one /rankings shows. */
function rankingHref(r: PlayerRanking, gender: PlayerProfile['gender']): string | null {
  const format = r.format.toLowerCase().replace(/^t20$/, 't20i') as RankingsFormat;
  if (!RANKINGS_FORMAT_KEYS.includes(format)) return null;
  return `/rankings?group=players&format=${format}&gender=${gender === 'Female' ? 'women' : 'men'}&category=${RANK_CATEGORY[r.discipline]}`;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { series?: string | string[]; format?: string | string[] };
}) {
  const player = await loadPlayer(params.id);
  if (!player) notFound();

  const wantFormat = one(searchParams.format);
  const seriesFormat =
    isSeriesFormatKey(wantFormat) && seriesFormatOptions(player.formatCodes).some((f) => f.value === wantFormat)
      ? wantFormat
      : 'all';
  const wantSeries = one(searchParams.series);
  const seriesId = wantSeries && /^[A-Za-z0-9]{1,12}$/.test(wantSeries) ? wantSeries : null;

  const crest = teamLogoUrl(player.countryKey ?? undefined);

  // crex returns a row for every competition a player was ever listed under, played or not.
  const batting = player.batting.filter((r) => r.matches > 0);
  const bowling = player.bowling.filter((r) => r.innings > 0 || r.wickets > 0);
  // A batter's handful of overs is not bowling form.
  const recentBowling = bowling.length > 0 ? player.recentBowling : [];
  const bestRank = player.rankings.length ? Math.min(...player.rankings.map((r) => r.position)) : null;

  // Third slot marks crex's lower-case traits for capitalising; other fields keep their own casing ("6 ft 1 in").
  const about = [
    ['Gender', player.gender],
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
      <BackButton className={styles.back} fallback="/players" />

      <header className={styles.hero}>
        <div className={styles.heroMain}>
          <PlayerPortrait name={player.name} src={player.image} />
          <div className={styles.identity}>
            <span className={styles.eyebrow}>{player.role}</span>
            <h1 className={styles.name}>{player.name}</h1>
            <p className={styles.meta}>
              {player.countryShortName && (
                <span className={styles.country}>
                  <TeamBadge name={player.countryShortName} shortName={player.countryShortName} logo={crest} size="xs" />
                  {player.countryShortName}
                </span>
              )}
              {player.age !== null && <span>{player.age} yrs</span>}
            </p>
          </div>
        </div>
        <FollowButton kind="players" entity={{ id: player.id, name: player.name }} className={styles.follow} />
      </header>

      {player.rankings.length > 0 && (
        <ul className={styles.ranks} aria-label="ICC rankings">
          {player.rankings.map((r) => {
            const href = rankingHref(r, player.gender);
            const body = (
              <>
                <span className={styles.rankLabel}>ICC {r.format}</span>
                <span className={styles.rankPos}>
                  <span className={styles.rankHash}>#</span>
                  {r.position}
                </span>
                <span className={styles.rankRole}>{r.discipline}</span>
              </>
            );
            return (
              <li key={`${r.format}-${r.discipline}`}>
                {href ? (
                  <Link href={href} className={styles.rank} data-best={r.position === bestRank || undefined}>
                    {body}
                  </Link>
                ) : (
                  <span className={styles.rank} data-best={r.position === bestRank || undefined}>
                    {body}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className={styles.layout}>
        <div className={styles.main}>
          {(player.recentBatting.length > 0 || recentBowling.length > 0) && (
            <section className={styles.section}>
              <SectionHead title="Recent form" />
              <div className={styles.formGrid}>
                <FormPanel title="Batting" entries={player.recentBatting} discipline="batting" />
                <FormPanel title="Bowling" entries={recentBowling} discipline="bowling" />
              </div>
            </section>
          )}

          <Suspense fallback={<PlayerSeriesSkeleton className={styles.section} />}>
            <PlayerSeriesSection
              className={styles.section}
              playerId={player.id}
              role={player.role}
              formatCodes={player.formatCodes}
              format={seriesFormat}
              series={seriesId}
            />
          </Suspense>

          {batting.length > 0 && (
            <section className={styles.section}>
              <SectionHead title="Career batting" />
              <BattingCareer rows={batting} />
            </section>
          )}

          {bowling.length > 0 && (
            <section className={styles.section}>
              <SectionHead title="Career bowling" />
              <BowlingCareer rows={bowling} />
            </section>
          )}
        </div>

        <aside className={styles.side}>
          <section className={styles.section}>
            <SectionHead title="About" level={3} />
            <div className={styles.card}>
              <dl className={styles.about}>
                {about.map(([label, value, capitalize]) => (
                  <div key={label} className={styles.aboutRow}>
                    <dt>{label}</dt>
                    <dd className={capitalize ? styles.capitalize : undefined}>{value}</dd>
                  </div>
                ))}
              </dl>

              {player.teams.length > 0 && (
                <div className={styles.cardBlock}>
                  <h4 className={styles.blockLabel}>Teams</h4>
                  <ul className={styles.teamList}>
                    {player.teams.map((team) => (
                      <li key={team}>{team}</li>
                    ))}
                  </ul>
                </div>
              )}

              {(player.instagram || player.twitter) && (
                <ul className={`${styles.cardBlock} ${styles.social}`}>
                  {player.instagram && (
                    <li>
                      <a href={`https://instagram.com/${player.instagram}`} rel="noopener noreferrer nofollow" target="_blank">
                        Instagram
                      </a>
                    </li>
                  )}
                  {player.twitter && (
                    <li>
                      <a href={`https://x.com/${player.twitter}`} rel="noopener noreferrer nofollow" target="_blank">
                        X / Twitter
                      </a>
                    </li>
                  )}
                </ul>
              )}
            </div>
          </section>

          {player.debuts.length > 0 && (
            <section className={styles.section}>
              <SectionHead title="Debuts" level={3} />
              <ol className={styles.debuts}>
                {player.debuts.map((d) => (
                  <li key={d.format} className={styles.debutRow}>
                    <span className={styles.debutFormat}>{d.format}</span>
                    {d.matchId ? (
                      <Link href={`/matches/${d.matchId}`} className={styles.debutFixture}>
                        {d.fixture}
                      </Link>
                    ) : (
                      <span className={styles.debutFixture}>{d.fixture}</span>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
