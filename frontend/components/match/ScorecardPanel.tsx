'use client';

import { useState } from 'react';
import type { BatsmanLine, BowlerLine, ExtrasBreakdown, InningsScore, Match, MatchSquads } from '@/types';
import { DEFAULT_BALLS_PER_OVER, HUNDRED_BALLS_PER_OVER, ballsFrom, formatProgressShort } from '@/lib/overs';
import { atCrease, dismissalOf } from '@/lib/crease';
import TableScroll from '../ui/TableScroll';
import Segmented from '../ui/Segmented';
import PlayerLink from './PlayerLink';
import { ordinal } from './ScoreHeader';
import { BowlingSkeleton, ScorecardSkeleton } from './MatchDetailSkeleton';
import mc from './matchCenter.module.scss';
import styles from './ScorecardPanel.module.scss';

// Four standing lines always, so the row keeps its shape; penalty only when awarded.
function formatExtras(e: ExtrasBreakdown | undefined): string | null {
  if (!e) return null;
  const parts = [`b ${e.byes}`, `lb ${e.legByes}`, `w ${e.wides}`, `nb ${e.noBalls}`];
  if (e.penalty) parts.push(`p ${e.penalty}`);
  return parts.join(' · ');
}

export function fmtOvers(overs: number, perOver: number): string {
  if (perOver === HUNDRED_BALLS_PER_OVER) return String(ballsFrom(overs, perOver));
  return overs.toFixed(1);
}

// Where a side bats twice, its own innings count is what a reader looks for.
function inningsLabel(inn: InningsScore, index: number, all: InningsScore[]): string {
  if (inn.inning) return inn.inning;
  const twice = all.some((i) => (i.inningsNumber ?? 1) > 1);
  return twice && inn.inningsNumber
    ? `${inn.teamShortName} ${ordinal(inn.inningsNumber)}`
    : `${inn.teamShortName} · Inn ${index + 1}`;
}

export default function ScorecardPanel({
  match,
  innings,
  squads,
  pending,
  onShowSquads,
}: {
  match: Match;
  innings: InningsScore[];
  squads: MatchSquads | null;
  pending?: boolean;
  onShowSquads: () => void;
}) {
  const [selected, setSelected] = useState(Math.max(0, innings.length - 1));
  const current = innings[Math.min(selected, Math.max(0, innings.length - 1))];
  const perOver = match.ballsPerOver || DEFAULT_BALLS_PER_OVER;
  const isHundred = perOver === HUNDRED_BALLS_PER_OVER;

  // Per-innings lines when the card carries them; otherwise the top-level arrays describe the latest.
  const isLatest = innings.length === 0 || current === innings[innings.length - 1];
  const batting: BatsmanLine[] = current?.batting ?? (isLatest ? match.scorecard?.batting ?? [] : []);
  const bowling: BowlerLine[] = current?.bowling ?? (isLatest ? match.scorecard?.bowling ?? [] : []);
  const extras = current?.extras ?? (isLatest ? match.scorecard?.extras : undefined);
  const extrasBreakdown = current?.extrasBreakdown ?? (isLatest ? match.scorecard?.extrasBreakdown : undefined);
  const yetToBat = current?.yetToBat ?? [];
  const inProgress = match.status === 'LIVE' && isLatest && !match.note?.betweenInnings;
  const fallOfWickets = current?.fallOfWickets ?? [];
  const partnerships = current?.partnerships ?? [];

  // crex opens no innings slot until the first delivery.
  const awaitingFirstBall = !pending && !batting.length && !bowling.length && !yetToBat.length;

  if (awaitingFirstBall) {
    return (
      <div className={mc.panel}>
        <p className={mc.empty}>
          The card opens with the first ball.
          {squads && (
            <>
              {' '}
              <button type="button" className={mc.emptyLink} onClick={onShowSquads}>
                See the squads
              </button>
            </>
          )}
        </p>
      </div>
    );
  }

  const topScore = Math.max(0, ...batting.map((b) => b.runs));

  return (
    <div className={mc.panel}>
      {current && (
        <div className={styles.inningsHead}>
          {innings.length >= 2 ? (
            <Segmented
              label="Innings"
              value={String(selected)}
              onChange={(v) => setSelected(Number(v))}
              options={innings.map((inn, i) => ({ value: String(i), label: inningsLabel(inn, i, innings) }))}
            />
          ) : (
            <h2 className={styles.inningsName}>{inningsLabel(current, 0, innings)}</h2>
          )}
          {!current.notStarted && (
            <p className={styles.inningsScore}>
              <span className={styles.inningsRuns}>
                {current.runs}/{current.wickets}
              </span>
              <span className={styles.inningsOvers}>{formatProgressShort(current.overs, perOver)}</span>
            </p>
          )}
        </div>
      )}

      <section className={mc.block}>
        <h2 className={mc.blockTitle}>Batting</h2>
        {batting.length ? (
          <TableScroll className={mc.tableWrap} label={`${current?.teamShortName ?? ''} batting scorecard`.trim()}>
            <table className={mc.table}>
              <thead>
                <tr>
                  <th scope="col" className={mc.left}>Batter</th>
                  <th scope="col">R</th>
                  <th scope="col">B</th>
                  <th scope="col">4s</th>
                  <th scope="col">6s</th>
                  <th scope="col">SR</th>
                </tr>
              </thead>
              <tbody>
                {batting.map((b) => {
                  const in_ = atCrease(b);
                  return (
                    <tr key={b.playerId} className={in_ ? styles.atCrease : undefined}>
                      <td className={`${mc.left} ${styles.batter}`}>
                        <PlayerLink id={b.playerId} name={b.name} className={styles.batterName}>
                          {in_ && <span className={styles.notOut}>*</span>}
                        </PlayerLink>
                        <span className={styles.dismissal}>{dismissalOf(b)}</span>
                      </td>
                      <td className={`${mc.num} ${mc.strong} ${b.runs === topScore && b.runs >= 30 ? styles.top : ''}`}>{b.runs}</td>
                      <td className={mc.num}>{b.balls}</td>
                      <td className={mc.num}>{b.fours}</td>
                      <td className={mc.num}>{b.sixes}</td>
                      <td className={mc.num}>{b.strikeRate.toFixed(1)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {extras !== undefined && (
                  <tr className={styles.extrasRow}>
                    <td className={mc.left}>
                      Extras <span className={styles.extrasDetail}>{formatExtras(extrasBreakdown)}</span>
                    </td>
                    <td className={mc.num}>{extras}</td>
                    <td colSpan={4} />
                  </tr>
                )}
                {current && (
                  <tr className={styles.totalRow}>
                    <td className={mc.left}>Total</td>
                    <td className={`${mc.num} ${mc.strong}`} colSpan={5}>
                      {current.runs}/{current.wickets} ({formatProgressShort(current.overs, perOver)})
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>
          </TableScroll>
        ) : pending ? (
          <ScorecardSkeleton />
        ) : yetToBat.length ? null : (
          <p className={mc.empty}>
            {current
              ? `No batting card for this innings — total ${current.runs}/${current.wickets} (${formatProgressShort(current.overs, perOver)}).`
              : 'No batting data yet.'}
          </p>
        )}

        {yetToBat.length > 0 && (
          <div className={styles.yetToBat}>
            <h3 className={styles.subTitle}>{!batting.length ? 'Playing XI' : inProgress ? 'Yet to bat' : 'Did not bat'}</h3>
            <ol className={styles.ytbList}>
              {yetToBat.map((p, i) => (
                <li key={p.playerId}>
                  <span className={styles.ytbNum}>{batting.length + i + 1}</span>
                  <PlayerLink id={p.playerId} name={p.name} />
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      {!current?.notStarted && (
        <section className={mc.block}>
          <h2 className={mc.blockTitle}>Bowling</h2>
          {bowling.length ? (
            <TableScroll className={mc.tableWrap} label={`${current?.teamShortName ?? ''} bowling figures`.trim()}>
              <table className={mc.table}>
                <thead>
                  <tr>
                    <th scope="col" className={mc.left}>Bowler</th>
                    <th scope="col">{isHundred ? 'B' : 'O'}</th>
                    <th scope="col">M</th>
                    <th scope="col">R</th>
                    <th scope="col">W</th>
                    <th scope="col">Econ</th>
                  </tr>
                </thead>
                <tbody>
                  {bowling.map((b) => (
                    <tr key={b.playerId}>
                      <td className={mc.left}>
                        <PlayerLink id={b.playerId} name={b.name} className={styles.batterName} />
                      </td>
                      <td className={mc.num}>{fmtOvers(b.overs, perOver)}</td>
                      <td className={mc.num}>{b.maidens}</td>
                      <td className={mc.num}>{b.runs}</td>
                      <td className={`${mc.num} ${mc.strong} ${b.wickets >= 3 ? styles.haul : ''}`}>{b.wickets}</td>
                      <td className={mc.num}>{b.economy.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          ) : pending ? (
            <BowlingSkeleton />
          ) : (
            <p className={mc.empty}>No bowling data yet.</p>
          )}
        </section>
      )}

      {fallOfWickets.length > 0 && (
        <section className={mc.block}>
          <h2 className={mc.blockTitle}>Fall of wickets</h2>
          <ol className={styles.fow}>
            {fallOfWickets.map((w) => (
              <li key={`${w.wicket}-${w.playerId}`} className={styles.fowItem}>
                <span className={styles.fowScore}>
                  {w.runs}
                  <span>/{w.wicket}</span>
                </span>
                <PlayerLink id={w.playerId} name={w.name} className={styles.fowName} />
                <span className={styles.fowFig}>
                  {w.playerRuns}({w.playerBalls}) · {formatProgressShort(w.overs, perOver)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {partnerships.length > 0 && (
        <section className={mc.block}>
          <h2 className={mc.blockTitle}>Partnerships</h2>
          <ul className={styles.stands}>
            {partnerships.map((p, i) => {
              const total = Math.max(p.a.runs + p.b.runs, 1);
              const aShare = Math.round((Math.max(p.a.runs, 0) / total) * 100);
              return (
                <li key={`${p.a.playerId}-${p.b.playerId}-${i}`} className={styles.stand}>
                  <span className={styles.standWkt}>{ordinal(i + 1)}</span>
                  <span className={styles.standSide}>
                    <PlayerLink id={p.a.playerId} name={p.a.name} className={styles.standName} />
                    <span className={styles.standFig}>
                      {p.a.runs}({p.a.balls})
                    </span>
                  </span>
                  <span className={styles.standCenter}>
                    <span className={styles.standRuns}>
                      {p.runs}
                      <small>({p.balls})</small>
                    </span>
                    {/* Split by runs: who made the stand, not who faced it. */}
                    <svg className={styles.standBar} viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true">
                      <rect className={styles.barA} x="0" y="0" width={aShare} height="4" />
                      <rect className={styles.barB} x={aShare} y="0" width={100 - aShare} height="4" />
                    </svg>
                    {p.unbroken && <span className={styles.unbroken}>Unbroken</span>}
                  </span>
                  <span className={`${styles.standSide} ${styles.standRight}`}>
                    <PlayerLink id={p.b.playerId} name={p.b.name} className={styles.standName} />
                    <span className={styles.standFig}>
                      {p.b.runs}({p.b.balls})
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
