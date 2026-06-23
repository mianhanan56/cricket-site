'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type {
  Match,
  InningsScore,
  BatsmanLine,
  BowlerLine,
  ScoreUpdatePayload,
  BallDeliveredPayload,
  WicketFallPayload,
} from '@crex/shared';
import { connectSocket, disconnectSocket, joinMatch, leaveMatch, getSocket } from '../../lib/socket';
import WinProbability from './WinProbability';
import styles from './MatchLiveView.module.scss';

function scoreOf(match: Match, teamId: string): InningsScore | undefined {
  return match.scorecard?.innings?.find((i) => i.teamId === teamId);
}

interface BallEntry {
  id: string;
  over: number;
  ball: number;
  runs: number;
  isWicket: boolean;
  text: string;
}

const MAX_COMMENTARY = 20;
const MAX_DOTS = 12;

function dotKind(b: BallEntry): string {
  if (b.isWicket) return 'wicket';
  if (b.runs === 6) return 'six';
  if (b.runs === 4) return 'four';
  return 'dot';
}
function dotLabel(b: BallEntry): string {
  if (b.isWicket) return 'W';
  return String(b.runs);
}

export default function MatchLiveView({ matchId, initial }: { matchId: string; initial: Match }) {
  const [match, setMatch] = useState<Match>(initial);
  const [connected, setConnected] = useState(false);
  const [wicket, setWicket] = useState<WicketFallPayload | null>(null);

  // Seed commentary + ball dots from the initial server-fetched scorecard.
  const seed: BallEntry[] = (
    (initial.scorecard as unknown as { commentary?: Array<{ id: string; over: number; ball: number; runs: number; isWicket: boolean; text: string }> })
      ?.commentary ?? []
  ).map((c) => ({ id: c.id, over: c.over, ball: c.ball, runs: c.runs, isWicket: c.isWicket, text: c.text }));

  const [commentary, setCommentary] = useState<BallEntry[]>([...seed].reverse());
  const [dots, setDots] = useState<BallEntry[]>(seed.slice(-MAX_DOTS));

  const isLive = match.status === 'LIVE';
  const ballSeq = useRef(0);
  const wicketTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isLive) return;

    const socket = connectSocket();
    joinMatch(matchId);
    setConnected(socket.connected);

    const onConnect = () => {
      setConnected(true);
      joinMatch(matchId); // re-join after a reconnect
    };
    const onDisconnect = () => setConnected(false);

    const onScore = (data: ScoreUpdatePayload) => {
      if (data.matchId !== matchId) return;
      setMatch((prev) => ({ ...prev, scorecard: { ...prev.scorecard, ...data.scorecard } }));
    };

    const onBall = (data: BallDeliveredPayload) => {
      if (data.matchId !== matchId) return;
      const entry: BallEntry = {
        id: `${data.over}.${data.ball}-${ballSeq.current++}`,
        over: data.over,
        ball: data.ball,
        runs: data.runs,
        isWicket: data.isWicket,
        text: data.commentary,
      };
      setCommentary((prev) => [entry, ...prev].slice(0, MAX_COMMENTARY));
      setDots((prev) => [...prev, entry].slice(-MAX_DOTS));
    };

    const onWicket = (data: WicketFallPayload) => {
      if (data.matchId !== matchId) return;
      setWicket(data);
      if (wicketTimer.current) clearTimeout(wicketTimer.current);
      wicketTimer.current = setTimeout(() => setWicket(null), 3000);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('score:update', onScore);
    socket.on('ball:delivered', onBall);
    socket.on('wicket:fall', onWicket);

    return () => {
      const s = getSocket();
      s?.off('connect', onConnect);
      s?.off('disconnect', onDisconnect);
      s?.off('score:update', onScore);
      s?.off('ball:delivered', onBall);
      s?.off('wicket:fall', onWicket);
      if (wicketTimer.current) clearTimeout(wicketTimer.current);
      leaveMatch(matchId);
      disconnectSocket();
    };
  }, [matchId, isLive]);

  const home = scoreOf(match, match.homeTeam.id);
  const away = scoreOf(match, match.awayTeam.id);
  const batting: BatsmanLine[] = match.scorecard?.batting ?? [];
  const bowling: BowlerLine[] = match.scorecard?.bowling ?? [];

  return (
    <div className={styles.page}>
      {/* Wicket alert banner */}
      {wicket && (
        <div className={styles.wicketAlert} role="alert">
          WICKET! {wicket.playerName} out! <span className={styles.wicketScore}>{wicket.score}</span>
        </div>
      )}

      <Link href="/matches" className={styles.back}>
        ← All matches
      </Link>

      {/* Header: teams + scores */}
      <header className={styles.header}>
        <div className={styles.statusRow}>
          {isLive ? (
            <span className={styles.live}>
              <span
                className={`${styles.liveIndicator} ${connected ? styles.connected : ''}`}
                title={connected ? 'Live connection active' : 'Connecting…'}
              />
              LIVE
            </span>
          ) : (
            <span className={styles.status}>{match.status}</span>
          )}
          {isLive && (
            <span className={styles.connLabel}>
              {connected ? 'real-time' : 'connecting…'}
            </span>
          )}
        </div>

        <div className={styles.teams}>
          <div className={styles.team}>
            <span className={styles.teamName}>{match.homeTeam.name}</span>
            <span className={styles.score}>{home ? `${home.runs}/${home.wickets}` : '—'}</span>
            <span className={styles.overs}>{home ? `(${home.overs} ov)` : ''}</span>
          </div>
          <span className={styles.vs}>vs</span>
          <div className={`${styles.team} ${styles.right}`}>
            <span className={styles.teamName}>{match.awayTeam.name}</span>
            <span className={styles.score}>{away ? `${away.runs}/${away.wickets}` : '—'}</span>
            <span className={styles.overs}>{away ? `(${away.overs} ov)` : ''}</span>
          </div>
        </div>

        {/* Recent balls */}
        {dots.length > 0 && (
          <div className={styles.dots} aria-label="Recent balls">
            {dots.map((b) => (
              <span key={b.id} className={`${styles.ballDot} ${styles[dotKind(b)]}`}>
                {dotLabel(b)}
              </span>
            ))}
          </div>
        )}

        {match.result && <p className={styles.result}>{match.result}</p>}
      </header>

      {/* Win probability — recomputes on every score:update */}
      {isLive && <WinProbability match={match} />}

      {/* Match info */}
      <section className={styles.info}>
        <div>
          <span className={styles.infoLabel}>Series</span>
          <span className={styles.infoValue}>{match.series.name}</span>
        </div>
        <div>
          <span className={styles.infoLabel}>Format</span>
          <span className={styles.infoValue}>{match.format}</span>
        </div>
        <div>
          <span className={styles.infoLabel}>Venue</span>
          <span className={styles.infoValue}>{match.venue}</span>
        </div>
      </section>

      {/* Batting */}
      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Batting</h2>
        {batting.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.left}>Batter</th>
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
                      {!b.out && <span className={styles.notout}> *</span>}
                    </td>
                    <td className={styles.num}>{b.runs}</td>
                    <td className={styles.num}>{b.balls}</td>
                    <td className={styles.num}>{b.fours}</td>
                    <td className={styles.num}>{b.sixes}</td>
                    <td className={styles.num}>{b.strikeRate.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.empty}>No batting data yet.</p>
        )}
      </section>

      {/* Bowling */}
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
                    <td className={styles.num}>{b.overs}</td>
                    <td className={styles.num}>{b.maidens}</td>
                    <td className={styles.num}>{b.runs}</td>
                    <td className={styles.num}>{b.wickets}</td>
                    <td className={styles.num}>{b.economy.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.empty}>No bowling data yet.</p>
        )}
      </section>

      {/* Commentary */}
      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Commentary</h2>
        {commentary.length ? (
          <ul className={styles.commentary}>
            {commentary.map((c) => (
              <li key={c.id} className={styles.ball}>
                <span
                  className={`${styles.ballMarker} ${
                    c.isWicket ? styles.wicket : c.runs === 4 || c.runs === 6 ? styles.boundary : ''
                  }`}
                >
                  {c.over}.{c.ball}
                </span>
                <span className={styles.ballText}>{c.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>No commentary yet.</p>
        )}
      </section>
    </div>
  );
}
