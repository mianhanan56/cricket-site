import Link from 'next/link';
import type { Match, Team } from '@/types';
import type { MatchStateView } from '@/lib/matchState';
import type { MatchSituation, CreaseContext } from '@/lib/situation';
import type { LiveEquation } from '@/lib/telemetry';
import { PHASE_LABEL, equationSentence } from '@/lib/telemetry';
import { ballKind, ballPosition, runsLabel, shortLabel, type BallEntry } from '@/lib/balls';
import TeamBadge from '../ui/TeamBadge';
import LocalTime from '../ui/LocalTime';
import CreaseLine from '../live/CreaseLine';
import StateChip from '../live/StateChip';
import LastBallAge from '../live/LastBallAge';
import Ticker from '../live/Ticker';
import Countdown from '../live/Countdown';
import PlayerLink from './PlayerLink';
import styles from './ScoreHeader.module.scss';
import { venueText } from '@/lib/venue';

export interface ScoreParts {
  runs: string;
  overs: string;
}

const FORMAT_LABEL: Record<Match['format'], string> = { TEST: 'Test', ODI: 'ODI', T20: 'T20' };

export function ordinal(n: number): string {
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

function Side({
  team,
  score,
  batting,
  won,
  dim,
  align,
  started,
}: {
  team: Team;
  score: ScoreParts | null;
  /** A live match where someone has batted — otherwise an empty score slot says nothing. */
  started: boolean;
  batting: boolean;
  won: boolean;
  dim: boolean;
  align: 'left' | 'right';
}) {
  return (
    <div className={`${styles.side} ${styles[align]} ${batting ? styles.batting : ''} ${dim ? styles.dim : ''}`}>
      <Link href={`/teams/${team.id}`} className={styles.team}>
        <TeamBadge name={team.name} shortName={team.shortName} logo={team.logo} size="md" />
        <span className={styles.teamName}>
          <span className={styles.teamFull}>{team.name}</span>
          <span className={styles.teamCode}>{team.shortName}</span>
        </span>
        {won && <span className={styles.won}>Won</span>}
      </Link>
      {score ? (
        <span className={styles.score}>
          <Ticker value={score.runs} />
        </span>
      ) : (
        started && <span className={styles.noScore}>Yet to bat</span>
      )}
      {score && <span className={styles.overs}>{score.overs}</span>}
    </div>
  );
}

export default function ScoreHeader({
  match,
  state,
  home,
  away,
  battingId,
  winnerId,
  lastBall,
  eq,
  situation,
  stand,
  progress,
  connecting,
  interrupted = false,
  perOver,
}: {
  match: Match;
  state: MatchStateView;
  home: ScoreParts | null;
  away: ScoreParts | null;
  battingId: string | null;
  winnerId: string | null;
  lastBall: BallEntry | null;
  eq: LiveEquation | null;
  situation: MatchSituation;
  stand: CreaseContext;
  progress: number | null;
  connecting: boolean;
  /** Neither the API nor the live socket is answering. */
  interrupted?: boolean;
  perOver: number;
}) {
  const live = match.status === 'LIVE';
  const sentence = eq && state.alive ? equationSentence(eq) : null;
  const tight = eq?.rrr != null && eq.crr != null && eq.rrr > eq.crr;
  const kind = lastBall ? ballKind(lastBall) : null;
  // Only the note that set the state may qualify it — a drinks break read off the feed is not "(wet outfield)".
  const detail = match.note?.detail && match.note.label === state.label ? match.note.detail : null;

  const meta = [
    match.matchNumber ? `${ordinal(match.matchNumber)} ${FORMAT_LABEL[match.format]}` : match.format,
    live && match.day && match.day > 1 ? `Day ${match.day}` : null,
  ].filter(Boolean);

  return (
    <header className={`${styles.header} ${styles[state.family]}`}>
      <div className={styles.grid} aria-hidden="true" />

      <div className={styles.top}>
        <StateChip state={state} full={!state.alive && state.key !== 'FINISHED'} />
        {(connecting || interrupted) && (
          <span className={styles.connecting} role="status">
            {interrupted ? 'Reconnecting' : 'Updating'}
          </span>
        )}
        {lastBall?.timestamp && <LastBallAge iso={lastBall.timestamp} className={styles.age} />}
        <span className={styles.meta}>
          <Link href={`/series/${match.series.id}`} className={styles.series}>
            {match.series.name}
          </Link>
          {meta.map((m) => (
            <span key={m as string}>{m}</span>
          ))}
          {match.venueId ? (
            <Link href={`/venues/${match.venueId}`} className={styles.venue}>
              {venueText(match.venue)}
            </Link>
          ) : (
            <span className={styles.venue}>{venueText(match.venue)}</span>
          )}
        </span>
      </div>

      <div className={styles.teams}>
        <Side
          team={match.homeTeam}
          score={home}
          batting={live && battingId === match.homeTeam.id}
          won={winnerId === match.homeTeam.id}
          started={live && Boolean(home || away)}
          dim={(live && Boolean(battingId) && battingId !== match.homeTeam.id) || (Boolean(winnerId) && winnerId !== match.homeTeam.id)}
          align="left"
        />

        <div className={styles.center}>
          {match.status === 'UPCOMING' ? (
            <div className={styles.startClock}>
              <span className={styles.clockLabel}>Starts in</span>
              <Countdown iso={match.startTime} className={styles.clock} pastLabel="Any moment" />
              <LocalTime iso={match.startTime} format="dayTime" className={styles.clockWhen} />
            </div>
          ) : live && !state.alive ? (
            <div className={styles.pause} role="status">
              <span className={styles.pauseLabel}>{state.label}</span>
              {lastBall && (
                <span className={styles.lastBallAt}>
                  <span className={styles.lastBallLabel}>Last ball</span> {ballPosition(lastBall, perOver)}
                </span>
              )}
            </div>
          ) : lastBall && kind ? (
            <div className={styles.lastBall}>
              <span
                key={lastBall.id}
                className={`${styles.impact} ${styles[`k_${kind}`]} ${shortLabel(lastBall).length > 2 ? styles.long : ''}`}
                aria-label={`Last ball: ${runsLabel(lastBall)}`}
              >
                {shortLabel(lastBall)}
              </span>
              <span className={styles.lastBallAt}>
                <span className={styles.lastBallLabel}>Last ball</span> {ballPosition(lastBall, perOver)}
              </span>
            </div>
          ) : (
            <span className={styles.vs}>vs</span>
          )}
        </div>

        <Side
          team={match.awayTeam}
          score={away}
          batting={live && battingId === match.awayTeam.id}
          won={winnerId === match.awayTeam.id}
          started={live && Boolean(home || away)}
          dim={(live && Boolean(battingId) && battingId !== match.awayTeam.id) || (Boolean(winnerId) && winnerId !== match.awayTeam.id)}
          align="right"
        />
      </div>

      {sentence && <p className={`${styles.headline} ${tight ? styles.tight : ''}`}>{sentence}</p>}
      {match.result && <p className={styles.headline}>{match.result}</p>}
      {!state.alive && !match.result && state.family !== 'upcoming' &&
        // Live, the centre already names the stoppage; only the detail is left to say.
        (live ? (
          detail && <p className={styles.sub}>{detail}</p>
        ) : (
          <p className={`${styles.headline} ${styles.stateLine}`}>
            {state.label}
            {detail && <span className={styles.detail}> {detail}</span>}
          </p>
        ))}
      {(state.key === 'TOSS' || (live && !home && !away && match.note?.kind === 'TOSS')) && match.note && (
        <p className={styles.sub}>{match.note.label}</p>
      )}

      {(situation.margin || situation.followOn || situation.target) && (
        <div className={styles.situation}>
          {situation.margin && <p>{situation.margin}</p>}
          {situation.target && <p className={styles.tight}>{situation.target}</p>}
          {situation.followOn && <p className={styles.warn}>{situation.followOn}</p>}
        </div>
      )}

      {live && eq && (
        <dl className={styles.tiles}>
          <div className={styles.tile}>
            <dt>CRR</dt>
            <dd>{eq.crr != null ? eq.crr.toFixed(2) : '—'}</dd>
          </div>
          {eq.rrr != null && (
            <div className={`${styles.tile} ${tight ? styles.tileTight : ''}`}>
              <dt>RRR</dt>
              <dd>{eq.rrr.toFixed(2)}</dd>
            </div>
          )}
          {stand.partnership && (
            <div className={styles.tile}>
              <dt>Partnership</dt>
              <dd>
                {stand.partnership.runs}
                <small>({stand.partnership.balls})</small>
              </dd>
            </div>
          )}
          {stand.lastWicket && (
            <div className={`${styles.tile} ${styles.tileWide}`}>
              <dt>Last wicket</dt>
              <dd className={styles.lastWicket}>
                <PlayerLink id={stand.lastWicket.playerId} name={stand.lastWicket.name} />
                <small>
                  {stand.lastWicket.playerRuns}({stand.lastWicket.playerBalls}) · {stand.lastWicket.runs}/{stand.lastWicket.wicket}
                </small>
              </dd>
            </div>
          )}
          {eq.phase && (
            <div className={styles.tile}>
              <dt>Phase</dt>
              <dd className={styles.phase}>{PHASE_LABEL[eq.phase]}</dd>
            </div>
          )}
        </dl>
      )}

      <CreaseLine family={state.family} progress={progress} />
    </header>
  );
}
