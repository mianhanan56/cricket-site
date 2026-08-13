'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type {
  Match,
  Team,
  InningsScore,
  BatsmanLine,
  BowlerLine,
  TeamFormEntry,
  SquadPlayer,
} from '@/types';
import { useCrexMatch, useCrexMatchExtras } from '@/hooks/useCrexMatches';
import WinProbability from './WinProbability';
import {
  BowlingSkeleton,
  CommentarySkeleton,
  ScorecardSkeleton,
} from './MatchDetailSkeleton';
import styles from './MatchDetail.module.scss';

type TabKey = 'info' | 'scorecard' | 'commentary';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'info', label: 'Match Info' },
  { key: 'scorecard', label: 'Scorecard' },
  { key: 'commentary', label: 'Commentary' },
];

interface BallEntry {
  id: string;
  over: number;
  ball: number;
  runs: number;
  isWicket: boolean;
  text: string;
}

const MAX_COMMENTARY = 60;
// Three overs of the recent-balls strip. Two is too short to read the shape of
// a spell; the feed is paged back far enough to fill it (see getCrexCommentary).
const MAX_DOTS = 18;

// CricAPI innings carry a label like "India Inning 1". Match an innings to a
// team ONLY when that label contains the team's name (or short name) — no
// positional fallback (same rule as MatchCard). No match → yet to bat.
function inningsListFor(match: Match, team: Team): InningsScore[] {
  const innings = match.scorecard?.innings ?? [];
  const name = team.name.toLowerCase();
  const short = team.shortName.toLowerCase();
  return innings.filter((i) => {
    if (i.teamId) return i.teamId === team.id;
    const label = (i.inning ?? i.teamShortName ?? '').toLowerCase();
    return !!label && (label.includes(name) || label.includes(short));
  });
}

// "287/4" (+ "120/2 & 287/4" across Test innings) with the current innings'
// overs on their own line so the header never wraps mid-score on mobile.
//
// An innings crex lists before it starts is skipped: its XI belongs on the
// scorecard, but a "0/0" next to a side that has not batted is a wrong score.
function scoreParts(list: InningsScore[]): { runs: string; overs: string } | null {
  const batted = list.filter((i) => !i.notStarted);
  if (!batted.length) return null;
  return {
    runs: batted.map((i) => `${i.runs}/${i.wickets}`).join(' & '),
    overs: `(${batted[batted.length - 1].overs} ov)`,
  };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function dismissalOf(b: BatsmanLine): string {
  if (b.dismissal) return b.dismissal;
  return b.out ? 'out' : 'not out';
}

// The `*` means "unbeaten at the crease". A retired batsman is also not out,
// but has left the middle — their card says so in words instead.
function atCrease(b: BatsmanLine): boolean {
  return !b.out && dismissalOf(b) === 'not out';
}

// crex counts balls; overs are sixths, so 27 balls is 4.3 — always one decimal
// so a completed spell reads "4.0", not "4".
function fmtOvers(overs: number): string {
  return overs.toFixed(1);
}

function dotKind(b: BallEntry): 'wicket' | 'six' | 'four' | 'dot' {
  if (b.isWicket) return 'wicket';
  if (b.runs === 6) return 'six';
  if (b.runs === 4) return 'four';
  return 'dot';
}

function runsLabel(b: BallEntry): string {
  if (b.isWicket) return 'W';
  return b.runs === 1 ? '1 run' : `${b.runs} runs`;
}

// Plain deliveries ('dot') have no extra class — avoid className "undefined".
function kindClass(b: BallEntry): string {
  return styles[dotKind(b)] ?? '';
}

export default function MatchDetail({
  matchId,
  initial,
}: {
  matchId: string;
  initial: Match;
}) {
  const [match, setMatch] = useState<Match>(initial);
  const [tab, setTab] = useState<TabKey>('info');

  // Seed commentary + ball dots from the initial server-fetched scorecard.
  const seed: BallEntry[] = (initial.scorecard?.commentary ?? []).map((c) => ({
    id: c.id,
    over: c.over,
    ball: c.ball,
    runs: c.runs,
    isWicket: c.isWicket,
    text: c.text,
  }));
  const [commentary, setCommentary] = useState<BallEntry[]>([...seed].reverse());
  const [dots, setDots] = useState<BallEntry[]>(seed.slice(-MAX_DOTS));

  const isLive = match.status === 'LIVE';

  // Every match now comes from crex, which has no push channel — the Worker is
  // polled instead. There used to be a socket path here for backend-sourced
  // matches; the socket server was dropped in the move to Workers, so it was
  // connecting to nothing.
  const { match: polled, lastUpdated } = useCrexMatch(matchId, {
    initial,
    enabled: match.status === 'LIVE',
  });

  // Scorecard + ball-by-ball, but only while the match is live or recently
  // finished — an upcoming fixture has neither.
  const extrasEnabled = match.status !== 'UPCOMING';
  const crexExtras = useCrexMatchExtras(matchId, {
    enabled: extrasEnabled,
    ballsPerOver: match.ballsPerOver,
  });

  // A crex match arrives with a header score but no card or feed — those are two
  // more round trips. Until the first one lands, the Scorecard and Commentary
  // tabs are loading, not empty, and have to say so with placeholders instead of
  // "No batting data yet".
  const extrasPending = extrasEnabled && !crexExtras.loaded;

  // Fold each poll into local state. The crex scorecard replaces the innings
  // wholesale — it is a complete card each time, not a delta.
  useEffect(() => {
    if (!polled) return;

    setMatch(
      crexExtras.innings.length
        ? { ...polled, scorecard: { ...polled.scorecard, innings: crexExtras.innings } }
        : polled
    );
  }, [polled, crexExtras.innings]);

  // crex commentary arrives newest-first already, which is the order this
  // component renders in — no reversing.
  useEffect(() => {
    if (!crexExtras.commentary.length) return;

    const entries: BallEntry[] = crexExtras.commentary.map((c) => ({
      id: c.id,
      over: c.over,
      ball: c.ball,
      runs: c.runs,
      isWicket: c.isWicket,
      text: c.text,
    }));
    setCommentary(entries.slice(0, MAX_COMMENTARY));
    // Dots read oldest-to-newest, so the tail of the feed reversed.
    setDots([...entries].reverse().slice(-MAX_DOTS));
  }, [crexExtras.commentary]);

  // A landed poll is this page's equivalent of "connected" — without it the
  // header would sit on "connecting…" forever while updating perfectly well.
  const isConnected = Boolean(lastUpdated);

  const innings = match.scorecard?.innings ?? [];
  const homeScore = scoreParts(inningsListFor(match, match.homeTeam));
  const awayScore = scoreParts(inningsListFor(match, match.awayTeam));

  // Commentary grouped by over, newest over first (entries are newest-first).
  const overs = useMemo(() => {
    const map = new Map<number, BallEntry[]>();
    for (const b of commentary) {
      const group = map.get(b.over);
      if (group) group.push(b);
      else map.set(b.over, [b]);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [commentary]);

  return (
    <div className={styles.page}>
      {/* The wicket-alert banner lived here. It was driven by the socket's
          `wicket:fall` event; crex's feed has no equivalent push, and inferring
          a wicket from a poll would fire it late and sometimes twice. Dropped
          rather than faked — the commentary tab still reports the wicket. */}

      <Link href="/" className={styles.back}>
        ← All matches
      </Link>

      {/* ------------------------------------------------ Match header */}
      <header className={styles.header}>
        <div className={styles.statusRow}>
          {isLive ? (
            <span
              className={styles.liveBadge}
              title={isConnected ? 'Live connection active' : 'Connecting…'}
            >
              LIVE
            </span>
          ) : (
            <span
              className={`${styles.statusBadge} ${
                match.status === 'COMPLETED' ? styles.completed : styles.upcoming
              }`}
            >
              {match.status}
            </span>
          )}
          {isLive && (
            <span className={styles.connLabel}>{isConnected ? 'real-time' : 'connecting…'}</span>
          )}
        </div>

        <div className={styles.teams}>
          <div className={styles.team}>
            <span className={styles.teamName}>{match.homeTeam.name}</span>
            <span className={styles.teamShort}>{match.homeTeam.shortName}</span>
            <span className={styles.score}>{homeScore?.runs ?? '—'}</span>
            {homeScore && <span className={styles.scoreOvers}>{homeScore.overs}</span>}
          </div>
          <span className={styles.vs}>VS</span>
          <div className={`${styles.team} ${styles.right}`}>
            <span className={styles.teamName}>{match.awayTeam.name}</span>
            <span className={styles.teamShort}>{match.awayTeam.shortName}</span>
            <span className={styles.score}>{awayScore?.runs ?? '—'}</span>
            {awayScore && <span className={styles.scoreOvers}>{awayScore.overs}</span>}
          </div>
        </div>

        {match.result && <p className={styles.result}>{match.result}</p>}

        {/* Recent balls */}
        {isLive && dots.length > 0 && (
          <div className={styles.dots} aria-label="Recent balls">
            {dots.map((b) => (
              <span key={b.id} className={`${styles.ballDot} ${kindClass(b)}`}>
                {b.isWicket ? 'W' : b.runs}
              </span>
            ))}
          </div>
        )}

        <p className={styles.headerMeta}>
          {match.series.name} · {match.format} · {match.venue}
        </p>
      </header>

      {isLive && <WinProbability match={match} />}

      {/* ------------------------------------------------ Sticky tabs */}
      <nav className={styles.tabs} aria-label="Match sections">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`${styles.tab} ${tab === t.key ? styles.active : ''}`}
            aria-current={tab === t.key ? 'page' : undefined}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'info' && <InfoTab match={match} />}
      {tab === 'scorecard' && (
        <ScorecardTab match={match} innings={innings} pending={extrasPending} />
      )}
      {tab === 'commentary' && (
        <CommentaryTab
          overs={overs}
          isLive={isLive}
          connected={isConnected}
          pending={extrasPending}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Match Info

function FormStrip({ team, form }: { team: Team; form: TeamFormEntry[] }) {
  return (
    <div className={styles.formRow}>
      <span className={styles.formTeam}>{team.name}</span>
      <div className={styles.formChips}>
        {form.length ? (
          form.map((f) => (
            <span
              key={f.matchId}
              className={`${styles.formChip} ${styles[`form${f.result}`]}`}
              title={`vs ${f.opponent}`}
            >
              {f.result}
            </span>
          ))
        ) : (
          <span className={styles.emptyInline}>No recent matches</span>
        )}
      </div>
    </div>
  );
}

function SquadColumn({ team, players }: { team: Team; players: SquadPlayer[] }) {
  return (
    <div className={styles.squadCol}>
      <h3 className={styles.squadTeam}>{team.name}</h3>
      <ul className={styles.squadList}>
        {players.map((p) => (
          <li key={p.id} className={styles.squadPlayer}>
            <span>{p.name}</span>
            <span className={styles.squadRole}>{p.role.replace('_', ' ')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InfoTab({ match }: { match: Match }) {
  const details: Array<[string, string]> = [
    ['Date', fmtDate(match.startTime)],
    ['Time', fmtTime(match.startTime)],
    ['Venue', match.venue],
    ['Format', match.format],
    ['Series', match.series.name],
  ];

  return (
    <div className={styles.panel}>
      {match.teamForm && (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Team Form <span className={styles.blockHint}>last 5 · latest first</span></h2>
          <FormStrip team={match.homeTeam} form={match.teamForm.home} />
          <FormStrip team={match.awayTeam} form={match.teamForm.away} />
        </section>
      )}

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Match Details</h2>
        <dl className={styles.details}>
          {details.map(([label, value]) => (
            <div key={label} className={styles.detailRow}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {match.squads && (match.squads.home.length > 0 || match.squads.away.length > 0) && (
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Squads</h2>
          <div className={styles.squads}>
            <SquadColumn team={match.homeTeam} players={match.squads.home} />
            <SquadColumn team={match.awayTeam} players={match.squads.away} />
          </div>
        </section>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- Scorecard

function ScorecardTab({
  match,
  innings,
  pending,
}: {
  match: Match;
  innings: InningsScore[];
  /** The card is still being fetched — show placeholders, not an empty state. */
  pending?: boolean;
}) {
  const [selected, setSelected] = useState(Math.max(0, innings.length - 1));
  const current = innings[Math.min(selected, Math.max(0, innings.length - 1))];

  // Per-innings lines when the scorecard carries them; otherwise the top-level
  // batting/bowling arrays describe the latest (in-progress) innings only.
  const isLatest = innings.length === 0 || current === innings[innings.length - 1];
  const batting: BatsmanLine[] =
    current?.batting ?? (isLatest ? match.scorecard?.batting ?? [] : []);
  const bowling: BowlerLine[] =
    current?.bowling ?? (isLatest ? match.scorecard?.bowling ?? [] : []);
  const extras = current?.extras ?? (isLatest ? match.scorecard?.extras : undefined);
  const yetToBat = current?.yetToBat ?? [];

  return (
    <div className={styles.panel}>
      {innings.length >= 2 && (
        <div className={styles.inningsPicker} role="tablist" aria-label="Innings">
          {innings.map((inn, i) => (
            <button
              key={inn.inning ?? `${inn.teamShortName}-${i}`}
              type="button"
              className={`${styles.inningsBtn} ${i === selected ? styles.active : ''}`}
              onClick={() => setSelected(i)}
            >
              {inn.inning ?? `${inn.teamShortName} — Innings ${i + 1}`}
            </button>
          ))}
        </div>
      )}

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Batting</h2>
        {batting.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.left}>Batsman</th>
                  <th className={styles.left}>How Out</th>
                  <th>R</th>
                  <th>B</th>
                  <th>4s</th>
                  <th>6s</th>
                  <th>SR</th>
                </tr>
              </thead>
              <tbody>
                {batting.map((b) => (
                  <tr key={b.playerId}>
                    <td className={styles.left}>
                      {b.name}
                      {atCrease(b) && <span className={styles.notout}> *</span>}
                    </td>
                    <td className={`${styles.left} ${styles.dismissal}`}>{dismissalOf(b)}</td>
                    <td className={styles.num}>{b.runs}</td>
                    <td className={styles.num}>{b.balls}</td>
                    <td className={styles.num}>{b.fours}</td>
                    <td className={styles.num}>{b.sixes}</td>
                    <td className={styles.num}>{b.strikeRate.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {extras !== undefined && (
                  <tr className={styles.extrasRow}>
                    <td className={styles.left} colSpan={2}>
                      Extras
                    </td>
                    <td className={styles.num}>{extras}</td>
                    <td colSpan={4} />
                  </tr>
                )}
                {current && (
                  <tr className={styles.totalRow}>
                    <td className={styles.left} colSpan={2}>
                      Total
                    </td>
                    <td className={styles.num} colSpan={5}>
                      {current.runs}/{current.wickets} ({current.overs} ov)
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        ) : pending ? (
          <ScorecardSkeleton />
        ) : yetToBat.length ? null : (
          <p className={styles.empty}>
            {current
              ? `No ball-by-ball batting data for this innings — total ${current.runs}/${current.wickets} (${current.overs} ov).`
              : 'No batting data yet.'}
          </p>
        )}

        {/* Before an innings starts its whole XI arrives as bare names — that
            is the side's playing eleven, and it is worth showing rather than
            an empty card. Once they start batting the same list is what's
            left to come in. */}
        {yetToBat.length > 0 && (
          <div className={styles.yetToBat}>
            <h3 className={styles.yetToBatTitle}>
              {batting.length ? 'Yet to bat' : 'Playing XI'}
            </h3>
            <ul className={styles.yetToBatList}>
              {yetToBat.map((p, i) => (
                <li key={p.playerId}>
                  {/* Numbers continue the card above, so a side three down
                      starts at 4 rather than restarting at 1. */}
                  <span className={styles.yetToBatNum}>{batting.length + i + 1}</span>
                  <span>{p.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* An innings that has not begun has no bowling to report and no
          promise worth making about it — the section is dropped, not emptied. */}
      {!current?.notStarted && (
      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Bowling</h2>
        {bowling.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.left}>Bowler</th>
                  <th>O</th>
                  <th>M</th>
                  <th>R</th>
                  <th>W</th>
                  <th>Econ</th>
                </tr>
              </thead>
              <tbody>
                {bowling.map((b) => (
                  <tr key={b.playerId}>
                    <td className={styles.left}>{b.name}</td>
                    <td className={styles.num}>{fmtOvers(b.overs)}</td>
                    <td className={styles.num}>{b.maidens}</td>
                    <td className={styles.num}>{b.runs}</td>
                    <td className={styles.num}>{b.wickets}</td>
                    <td className={styles.num}>{b.economy.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : pending ? (
          <BowlingSkeleton />
        ) : (
          <p className={styles.empty}>No bowling data yet.</p>
        )}
      </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Commentary

function CommentaryTab({
  overs,
  isLive,
  connected,
  pending,
}: {
  overs: Array<[number, BallEntry[]]>;
  isLive: boolean;
  connected: boolean;
  /** The feed is still being fetched — show placeholders, not an empty state. */
  pending?: boolean;
}) {
  return (
    <div className={styles.panel}>
      <section className={styles.block}>
        <h2 className={styles.blockTitle}>
          Ball by Ball
          {isLive && (
            <span className={styles.blockHint}>{connected ? 'updating live' : 'connecting…'}</span>
          )}
        </h2>
        {overs.length ? (
          <div className={styles.commentary}>
            {overs.map(([over, balls]) => (
              <div key={over} className={styles.overGroup}>
                <h3 className={styles.overHeader}>Over {over}</h3>
                <ul>
                  {balls.map((b) => (
                    <li key={b.id} className={styles.ballRow}>
                      <span
                        className={`${styles.ballMarker} ${
                          b.isWicket
                            ? styles.wicket
                            : b.runs === 4 || b.runs === 6
                              ? styles.boundary
                              : ''
                        }`}
                      >
                        {b.over}.{b.ball}
                      </span>
                      <span className={styles.ballText}>{b.text}</span>
                      <span className={`${styles.ballRuns} ${kindClass(b)}`}>
                        {runsLabel(b)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : pending ? (
          <CommentarySkeleton />
        ) : (
          <p className={styles.empty}>No commentary yet.</p>
        )}
      </section>
    </div>
  );
}
