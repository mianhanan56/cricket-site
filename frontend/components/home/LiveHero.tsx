'use client';

import Link from 'next/link';
import { useMemo, type ReactNode } from 'react';
import type { Match, Team } from '@/types';
import { useCrexMatchExtras } from '@/hooks/useCrexMatches';
import { matchStateOf } from '@/lib/matchState';
import { PHASE_LABEL, equationSentence, inningsProgress, inningsStarted, isChaseTight, liveEquation } from '@/lib/telemetry';
import { battedInnings, formatInnings, formatTeamScore, inningsFor, withCard } from '@/lib/innings';
import { DEFAULT_BALLS_PER_OVER, formatProgressShort } from '@/lib/overs';
import { creaseContext, matchSituation } from '@/lib/situation';
import { creaseFromCard } from '@/lib/crease';
import { feedCheckedNote } from '@/lib/crex';
import { groupBalls, toBallEntry } from '@/lib/balls';
import TeamBadge from '../ui/TeamBadge';
import Icon from '../ui/Icon';
import LocalTime from '../ui/LocalTime';
import CreaseLine from '../live/CreaseLine';
import Ticker from '../live/Ticker';
import BallTimeline from '../live/BallTimeline';
import PitchView from '../live/PitchView';
import Skeleton from '../ui/Skeleton';
import styles from './LiveHero.module.scss';
import { venueText } from '@/lib/venue';
import { matchFormat } from '@/lib/seriesFormat';

const HERO_INTERVAL_MS = 5_000;

function opponentLine(match: Match, team: Team): string | null {
  const s = formatTeamScore(inningsFor(match, team), match.format === 'TEST');
  return s || null;
}


export default function LiveHero({ match, switcher }: { match: Match; switcher?: ReactNode }) {
  const extras = useCrexMatchExtras(match.id, {
    intervalMs: HERO_INTERVAL_MS,
    ballsPerOver: match.ballsPerOver,
    status: match.status,
  });

  const card = extras.innings.length ? extras.innings : undefined;
  const eq = liveEquation(match, card) ?? liveEquation(match);
  const perOver = match.ballsPerOver || DEFAULT_BALLS_PER_OVER;

  // Same check as the match page: crex latches break notes after play resumes.
  const state = matchStateOf(
    match,
    feedCheckedNote(match, { innings: extras.innings, lastBallAt: extras.commentary[0]?.timestamp ?? null, now: extras.fetchedAt }),
  );

  const balls = useMemo(() => extras.commentary.map(toBallEntry), [extras.commentary]);
  const groups = useMemo(() => {
    const chrono = [...balls].reverse();
    const recent = chrono.filter((b) => b.inning === chrono[chrono.length - 1]?.inning).slice(-12);
    return groupBalls(recent, perOver, balls, state.alive).slice(-1);
  }, [balls, perOver, state.alive]);

  const crease = card ? creaseFromCard(match, card, balls[0]?.text ?? null) : null;
  const stand = card ? creaseContext(card) : { partnership: null, lastWicket: null };

  const batting = eq?.battingTeam ?? match.homeTeam;
  const bowling = eq?.bowlingTeam ?? match.awayTeam;
  // An innings with nothing on it yet gets the fixture layout, not a board of dashes.
  const inn = inningsStarted(eq) ? eq.innings : undefined;
  const read = withCard(match, card);
  // A Test has no equation; where it stands is the lead, the deficit or the chase. The feed's innings
  // are in batting order too, so it stands in until the card arrives.
  const situation = match.format === 'TEST' ? matchSituation(match, read.scorecard?.innings ?? []) : null;
  const sentence = situation
    ? (situation.target ?? situation.followOn ?? situation.margin)
    : eq
      ? equationSentence(eq)
      : null;
  const other = opponentLine(read, bowling);
  // The batting side's completed innings, before the one in progress (its last, when `inn` came from the feed).
  const mine = inn ? battedInnings(inningsFor(read, batting)) : [];
  const earlier = inn && mine.includes(inn) ? mine.filter((i) => i !== inn) : mine.slice(0, -1);
  const tight = isChaseTight(eq);

  return (
    <div className={styles.stage}>
      {switcher && <div className={styles.switcher}>{switcher}</div>}

      <section className={`${styles.hero} ${styles[state.family] ?? ''}`} aria-labelledby="hero-title">
        <div className={styles.mow} aria-hidden="true" />

        <header className={styles.top}>
          <span className={styles.liveNow}>
            <span className={styles.liveDot} aria-hidden="true" />
            Live now
          </span>
          <span className={styles.format}>{matchFormat(match)}</span>
          <Link href={`/series/${match.series.id}`} className={styles.series}>
            {match.series.name}
          </Link>
        </header>

        {inn ? (
          <div className={styles.faceoff}>
            <div className={styles.batSide}>
              <div className={styles.team}>
                <TeamBadge name={batting.name} shortName={batting.shortName} logo={batting.logo} size="lg" />
                <h2 id="hero-title" className={styles.teamName}>
                  {batting.name}
                </h2>
              </div>
              <p className={styles.score} aria-live="polite">
                {earlier.length > 0 && (
                  <span className={styles.earlier}>{earlier.map(formatInnings).join(' & ')} &amp;</span>
                )}
                <span className={styles.total}>
                  <Ticker value={inn.runs} className={styles.runs} />
                  <span className={styles.slash}>/</span>
                  <Ticker value={inn.wickets} className={styles.wkts} />
                </span>
                <span className={styles.overs}>{formatProgressShort(inn.overs, perOver)}</span>
              </p>
            </div>

            <span className={styles.vs} aria-hidden="true">
              vs
            </span>

            <PitchView latest={state.alive ? balls[0] ?? null : null} className={styles.pitchSlot} />

            <div className={styles.otherSide}>
              <div className={styles.team}>
                <TeamBadge name={bowling.name} shortName={bowling.shortName} logo={bowling.logo} size="md" />
                <span className={styles.otherName}>{bowling.name}</span>
              </div>
              <p className={styles.otherScore}>
                {other ?? <span className={styles.yet}>Yet to bat</span>}
                {eq?.target ? <span className={styles.target}>Target {eq.target}</span> : null}
              </p>
            </div>
          </div>
        ) : (
          <div className={styles.fixture}>
            <h2 id="hero-title" className={styles.matchup}>
              {[match.homeTeam, match.awayTeam].map((t, i) => (
                <span key={t.id} className={styles.matchSide}>
                  {i > 0 && <span className={styles.matchV}>v</span>}
                  <TeamBadge name={t.name} shortName={t.shortName} logo={t.logo} size="md" />
                  <span className={styles.matchName}>{t.name}</span>
                </span>
              ))}
            </h2>
            <p className={styles.where}>
              <LocalTime iso={match.startTime} format="dayTime" />
              <span className={styles.whereVenue}>{venueText(match.venue)}</span>
            </p>
          </div>
        )}

        <div className={styles.banner}>
          {!state.alive && <p className={styles.stateLine}>{state.label}</p>}
          {sentence && inn && (state.alive || situation) ? (
            <p className={`${styles.equation} ${tight ? styles.tight : ''}`}>{sentence}</p>
          ) : (
            state.alive && !inn && <p className={styles.stateLine}>{match.note?.label ?? 'Waiting for the first ball'}</p>
          )}
          <CreaseLine family={state.family} progress={inningsProgress(match, card)} />
        </div>

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
            {match.session && (
              <div className={styles.tile}>
                <dt>Session</dt>
                <dd>{match.session}</dd>
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

        {inn && (
          <div className={styles.lower}>
            {crease ? (
              <ul className={styles.crease} aria-label="At the crease">
                {crease.batsmen.map(({ line, onStrike }) => (
                  <li key={line.playerId} className={`${styles.player} ${onStrike ? styles.onStrike : ''}`}>
                    <span className={styles.role}>{onStrike ? 'On strike' : 'Batting'}</span>
                    <Link href={`/players/${line.playerId}`} className={styles.playerName}>
                      {line.name}
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
                    <span className={styles.role}>Bowling</span>
                    <Link href={`/players/${crease.bowler.playerId}`} className={styles.playerName}>
                      {crease.bowler.name}
                    </Link>
                    <span className={styles.playerFig}>
                      <strong>
                        {crease.bowler.wickets}-{crease.bowler.runs}
                      </strong>
                      <span>({crease.bowler.overs})</span>
                    </span>
                    <span className={styles.playerSub}>Econ {crease.bowler.economy.toFixed(2)}</span>
                  </li>
                )}
              </ul>
            ) : extras.loaded ? null : (
              <div className={styles.creaseLoading} aria-busy="true" aria-label="Loading the crease">
                {[0, 1, 2].map((i) => (
                  <div key={i} className={styles.player}>
                    <Skeleton variant="body" width="40" />
                    <Skeleton variant="body" width="70" />
                    <Skeleton variant="body" width="50" />
                  </div>
                ))}
              </div>
            )}

            <div className={styles.actions}>
              {groups.length > 0 && (
                <div className={styles.timeline}>
                  <BallTimeline groups={groups} perOver={perOver} compact label="This over" />
                </div>
              )}
              <Link href={`/matches/${match.id}`} className={styles.open}>
                Open match centre
                <Icon name="arrowRight" size={17} />
              </Link>
            </div>
          </div>
        )}

        {!inn && (
          <Link href={`/matches/${match.id}`} className={`${styles.open} ${styles.openSolo}`}>
            Open match centre
            <Icon name="arrowRight" size={17} />
          </Link>
        )}
      </section>
    </div>
  );
}
