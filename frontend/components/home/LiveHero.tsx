'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import type { Match, Team } from '@/types';
import { useCrexMatchExtras } from '@/hooks/useCrexMatches';
import { inningsUnderway, matchStateOf } from '@/lib/matchState';
import { PHASE_LABEL, equationSentence, inningsProgress, inningsStarted, liveEquation } from '@/lib/telemetry';
import { formatTeamScore, inningsFor } from '@/lib/innings';
import { formatProgressShort } from '@/lib/overs';
import { creaseContext } from '@/lib/situation';
import { creaseFromCard } from '@/lib/crease';
import { feedCheckedNote } from '@/lib/crex';
import { groupBalls, toBallEntry } from '@/lib/balls';
import { PULSE_WINDOW, matchPulse, pulseTrace, recentInningsBalls } from '@/lib/pulse';
import TeamBadge from '../ui/TeamBadge';
import Icon from '../ui/Icon';
import LocalTime from '../ui/LocalTime';
import CreaseLine from '../live/CreaseLine';
import Ticker from '../live/Ticker';
import PulseTrace from '../live/PulseTrace';
import MatchPulse from '../live/MatchPulse';
import BallTimeline from '../live/BallTimeline';
import LastBallAge from '../live/LastBallAge';
import styles from './LiveHero.module.scss';

const HERO_INTERVAL_MS = 5_000;

function opponentLine(match: Match, team: Team): string | null {
  const s = formatTeamScore(inningsFor(match, team), match.format === 'TEST');
  return s || null;
}

export default function LiveHero({ match }: { match: Match }) {
  const extras = useCrexMatchExtras(match.id, {
    intervalMs: HERO_INTERVAL_MS,
    ballsPerOver: match.ballsPerOver,
    status: match.status,
  });

  const card = extras.innings.length ? extras.innings : undefined;
  const eq = liveEquation(match, card) ?? liveEquation(match);
  const perOver = match.ballsPerOver || 6;

  // Same check as the match page: crex latches break notes after play resumes.
  const state = matchStateOf(
    match,
    feedCheckedNote(match, { innings: extras.innings, lastBallAt: extras.commentary[0]?.timestamp ?? null, now: extras.fetchedAt }),
  );

  const balls = useMemo(() => extras.commentary.map(toBallEntry), [extras.commentary]);
  const window = useMemo(() => recentInningsBalls(balls), [balls]);
  // A break inside the innings keeps the pulse; before the new innings' first ball it belongs to the last one.
  const pulseOn = inningsUnderway(state) && (eq?.ballsBowled ?? 0) > 0;
  const readings = useMemo(
    () => (pulseOn ? matchPulse(window, match.format, perOver) : null),
    [pulseOn, window, match.format, perOver],
  );
  const trace = useMemo(() => (pulseOn ? pulseTrace(window) : []), [pulseOn, window]);
  const groups = useMemo(() => {
    const chrono = [...balls].reverse();
    const recent = chrono.filter((b) => b.inning === chrono[chrono.length - 1]?.inning).slice(-12);
    return groupBalls(recent, perOver, balls, state.alive).slice(-2);
  }, [balls, perOver, state.alive]);

  const crease = card ? creaseFromCard(match, card, balls[0]?.text ?? null) : null;
  const stand = card ? creaseContext(card) : { partnership: null, lastWicket: null };

  const batting = eq?.battingTeam ?? match.homeTeam;
  const bowling = eq?.bowlingTeam ?? match.awayTeam;
  // An innings with nothing on it yet gets the fixture layout, not a board of dashes.
  const inn = inningsStarted(eq) ? eq.innings : undefined;
  const sentence = eq ? equationSentence(eq) : null;
  const other = opponentLine(match, bowling);
  const tight = eq?.rrr != null && eq.crr != null && eq.rrr > eq.crr;

  return (
    <section className={`${styles.hero} ${styles[state.family]}`} aria-labelledby="hero-title">
      <div className={styles.grid} aria-hidden="true" />

      <header className={styles.top}>
        <span className={styles.liveNow}>
          <span className={styles.liveDot} aria-hidden="true" />
          Live now
        </span>
        <span className={styles.context}>
          <span className={styles.format}>{match.format}</span>
          <Link href={`/series/${match.series.id}`} className={styles.series}>
            {match.series.name}
          </Link>
        </span>
        {state.alive && balls[0]?.timestamp && <LastBallAge iso={balls[0].timestamp} className={styles.age} />}
      </header>

      <div className={`${styles.main} ${inn ? '' : styles.solo}`}>
        <div className={styles.scoreSide}>
          {inn ? (
            <>
              <div className={styles.batting}>
                <TeamBadge name={batting.name} shortName={batting.shortName} logo={batting.logo} size="lg" />
                <h2 id="hero-title" className={styles.teamName}>
                  <span className={styles.teamFull}>{batting.name}</span>
                  <span className={styles.teamCode}>{batting.shortName}</span>
                </h2>
              </div>

              <p className={styles.score} aria-live="polite">
                <Ticker value={inn.runs} className={styles.runs} />
                <span className={styles.slash}>/</span>
                <Ticker value={inn.wickets} className={styles.wkts} />
                <span className={styles.overs}>{formatProgressShort(inn.overs, perOver)}</span>
              </p>

              <p className={styles.versus}>
                <span className={styles.vsWord}>vs</span>
                <TeamBadge name={bowling.name} shortName={bowling.shortName} logo={bowling.logo} size="xs" />
                <span className={styles.vsTeam}>{bowling.name}</span>
                {eq?.target ? (
                  <span className={styles.vsFig}>Target {eq.target}</span>
                ) : other ? (
                  <span className={styles.vsFig}>{other}</span>
                ) : null}
              </p>
            </>
          ) : (
            <h2 id="hero-title" className={styles.matchup}>
              {[match.homeTeam, match.awayTeam].map((t, i) => (
                <span key={t.id} className={styles.matchSide}>
                  {i > 0 && <span className={styles.matchV}>v</span>}
                  <TeamBadge name={t.name} shortName={t.shortName} logo={t.logo} size="md" />
                  <span className={styles.matchName}>{t.name}</span>
                </span>
              ))}
            </h2>
          )}

          {sentence && state.alive && inn && (
            <p className={`${styles.equation} ${tight ? styles.tight : ''}`}>{sentence}</p>
          )}
          {!state.alive ? (
            <p className={styles.stateLine}>{state.label}</p>
          ) : (
            !inn && <p className={styles.stateLine}>{match.note?.label ?? 'Waiting for the first ball'}</p>
          )}
          {!inn && (
            <p className={styles.where}>
              <LocalTime iso={match.startTime} format="dayTime" />
              {match.venue && <span className={styles.whereVenue}>{match.venue}</span>}
            </p>
          )}

          {inn && (
            <dl className={styles.tiles}>
              <div className={styles.tile}>
                <dt>Run rate</dt>
                <dd>{eq?.crr != null ? eq.crr.toFixed(2) : '—'}</dd>
              </div>
              {eq?.rrr != null ? (
                <div className={`${styles.tile} ${tight ? styles.tileTight : ''}`}>
                  <dt>Required</dt>
                  <dd>{eq.rrr.toFixed(2)}</dd>
                </div>
              ) : (
                <div className={styles.tile}>
                  <dt>{match.format === 'TEST' && match.day ? 'Day' : 'Innings'}</dt>
                  <dd>{match.format === 'TEST' && match.day ? match.day : (inn?.inningsNumber ?? 1)}</dd>
                </div>
              )}
              <div className={styles.tile}>
                <dt>Partnership</dt>
                <dd>
                  {stand.partnership ? (
                    <>
                      {stand.partnership.runs}
                      <small>({stand.partnership.balls})</small>
                    </>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              {eq?.phase && (
                <div className={styles.tile}>
                  <dt>Phase</dt>
                  <dd className={styles.phase}>{PHASE_LABEL[eq.phase]}</dd>
                </div>
              )}
            </dl>
          )}

          <div className={styles.signal}>
            {trace.length > 2 && (
              <PulseTrace points={trace} label={`Last ${window.length} deliveries`} still={!state.alive} />
            )}
            <CreaseLine family={state.family} progress={inningsProgress(match, card)} />
          </div>

          <div className={styles.bottom}>
            {groups.length > 0 && (
              <div className={styles.timeline}>
                <BallTimeline groups={groups} perOver={perOver} compact label="Current over" />
              </div>
            )}
            <Link href={`/matches/${match.id}`} className={styles.open}>
              Open match center
              <Icon name="arrowRight" size={17} />
            </Link>
          </div>
        </div>

        {inn && (
          <aside className={styles.side}>
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>At the crease</h3>
              {crease ? (
                <ul className={styles.crease}>
                  {crease.batsmen.map(({ line, onStrike }) => (
                    <li key={line.playerId} className={styles.player}>
                      <Link href={`/players/${line.playerId}`} className={styles.playerName}>
                        {line.name}
                        {onStrike && (
                          <span className={styles.strike} aria-label="on strike">
                            *
                          </span>
                        )}
                      </Link>
                      <span className={styles.playerFig}>
                        <strong>{line.runs}</strong>
                        <span>({line.balls})</span>
                      </span>
                      <span className={styles.playerSub}>
                        {line.fours}×4 · {line.sixes}×6 · SR {line.strikeRate.toFixed(0)}
                      </span>
                    </li>
                  ))}
                  {crease.bowler && (
                    <li className={`${styles.player} ${styles.bowler}`}>
                      <Link href={`/players/${crease.bowler.playerId}`} className={styles.playerName}>
                        {crease.bowler.name}
                      </Link>
                      <span className={styles.playerFig}>
                        <strong>
                          {crease.bowler.wickets}-{crease.bowler.runs}
                        </strong>
                        <span>({crease.bowler.overs})</span>
                      </span>
                      <span className={styles.playerSub}>Bowling · Econ {crease.bowler.economy.toFixed(2)}</span>
                    </li>
                  )}
                </ul>
              ) : (
                <p className={styles.muted}>{extras.loaded ? 'Waiting for the next ball' : 'Syncing the card'}</p>
              )}
            </div>

            {readings && (
              <div className={`${styles.panel} ${styles.pulsePanel}`}>
                <h3 className={styles.panelTitle}>Match pulse</h3>
                <MatchPulse readings={readings} window={Math.min(window.length, PULSE_WINDOW)} compact />
              </div>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}
