import Link from 'next/link';
import type { Match, Team, InningsScore } from '@/types';
import { formatProgress } from '@/lib/overs';
import { battedInnings, formatInnings, inningsFor, isClosed } from '@/lib/innings';
import { pausedWord } from '../match/MatchState';
import TeamBadge from './TeamBadge';
import LocalTime from '../ui/LocalTime';
import styles from './MatchCard.module.scss';

/**
 * A side's innings for its row, oldest first.
 *
 * Usually one. A Test gives two, and both belong in the score the row already
 * has — "462 & 193/10" — rather than in a second box: the reader is looking at
 * one number for one side, and the innings before it is part of that number.
 */
function rowInnings(match: Match, team: Team): InningsScore[] {
  return battedInnings(inningsFor(match, team));
}

const STATUS_CLASS: Record<Match['status'], string> = {
  LIVE: 'isLive',
  UPCOMING: 'isUpcoming',
  COMPLETED: 'isCompleted',
};

function TeamRow({
  team,
  innings,
  ballsPerOver,
  multiInnings,
  dim,
}: {
  team: Team;
  /** Every innings the side has batted, oldest first. */
  innings: InningsScore[];
  ballsPerOver?: number;
  /** Format where a side bats twice, i.e. a Test. */
  multiInnings?: boolean;
  dim?: boolean;
}) {
  // The innings the row's figures describe: the latest one. Its predecessors are
  // written in front of it, closed and abbreviated the way a scorecard does it.
  const latest = innings[innings.length - 1];
  const earlier = innings.slice(0, -1);

  // A closed innings on a Test card is written as the runs alone ("350"), which
  // is both how a scorecard writes it and what keeps a two-innings line short.
  // Only on Tests: a single-innings card has always shown "168/7" and still does.
  const closed = Boolean(multiInnings && latest && isClosed(latest));
  return (
    <div className={`${styles.team} ${dim ? styles.dim : ''}`}>
      <div className={styles.teamLeft}>
        <TeamBadge name={team.name} shortName={team.shortName} logo={team.logo} />
        <div className={styles.teamMeta}>
          <div className={styles.teamCode}>{team.shortName}</div>
          {/* Full name under the code — the short code alone is meaningless for
              domestic sides. Hidden when it would just repeat the code. */}
          {team.name && team.name !== team.shortName && (
            <div className={styles.teamName}>{team.name}</div>
          )}
          {/* Overs on all but The Hundred, which is scored in balls — see
              lib/overs. Always the innings in progress, never a closed one. */}
          {latest && (
            <div className={styles.overs}>{formatProgress(latest.overs, ballsPerOver)}</div>
          )}
        </div>
      </div>
      {latest ? (
        <div className={styles.score}>
          {/* A Test's earlier innings, joined with "&". Ten wickets down is
              written as the runs alone — every all-out innings ends on ten, so
              the figure says nothing and the line reads shorter without it. */}
          {earlier.map((inn, i) => (
            <span key={inn.inningsNumber ?? i} className={styles.priorInnings}>
              {formatInnings(inn)}
              <span className={styles.ampersand}> &amp; </span>
            </span>
          ))}
          {closed ? (
            formatInnings(latest)
          ) : (
            <>
              {latest.runs}
              <span className={styles.wickets}>/{latest.wickets}</span>
            </>
          )}
        </div>
      ) : (
        <div className={styles.yetToBat}>Yet to bat</div>
      )}
    </div>
  );
}

export default function MatchCard({ match }: { match: Match }) {
  const isLive = match.status === 'LIVE';
  const isUpcoming = match.status === 'UPCOMING';
  const homeInn = rowInnings(match, match.homeTeam);
  const awayInn = rowInnings(match, match.awayTeam);
  const multiInnings = match.format === 'TEST';
  // One word when a live match has stopped — STUMPS at the end of a Test day,
  // DELAY for rain or bad light, BREAK for an interval. Null while the ball is in
  // play, which is when the card shows LIVE and its dot instead.
  const stopped = pausedWord(match.status, match.note);

  return (
    <Link href={`/matches/${match.id}`} className={`${styles.card} ${styles[STATUS_CLASS[match.status]]}`}>
      {/* header — format chip + series on the left, status on the right */}
      <div className={styles.header}>
        <div className={styles.headLeft}>
          <span className={styles.format}>{match.format}</span>
          <span className={styles.series}>{match.series.name}</span>
        </div>
        {/* Status, in a word. A stopped match names the stoppage rather than
            claiming to be live; the wording in full is on the match page. */}
        {isLive ? (
          stopped ? (
            <span className={styles.paused}>{stopped}</span>
          ) : (
            <span className={styles.live}>
              <span className={styles.dot} aria-hidden="true" />
              LIVE
            </span>
          )
        ) : isUpcoming ? (
          <span className={styles.upcoming}>UPCOMING</span>
        ) : (
          <span className={styles.result}>RESULT</span>
        )}
      </div>

      {/* teams */}
      <div className={styles.teams}>
        <TeamRow
          team={match.homeTeam}
          innings={homeInn}
          ballsPerOver={match.ballsPerOver}
          multiInnings={multiInnings}
        />
        <TeamRow
          team={match.awayTeam}
          innings={awayInn}
          ballsPerOver={match.ballsPerOver}
          multiInnings={multiInnings}
        />
      </div>

      {/* footer */}
      <div className={styles.footer}>
        {isUpcoming ? (
          <div className={styles.footNote}>
            Starts{' '}
            <LocalTime iso={match.startTime} format="dayTime" className={styles.strong} />
          </div>
        ) : match.result ? (
          <div className={`${styles.footNote} ${isLive ? styles.footLive : styles.footResult}`}>
            {match.result}
          </div>
        ) : null}

        <div className={styles.meta}>
          <span className={styles.venue}>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            {/* The text needs its own box: `text-overflow` has no effect on the
                anonymous item a flex container wraps a bare text node in, so
                without this the venue is cut off mid-word with no ellipsis. */}
            <span className={styles.venueText}>{match.venue}</span>
          </span>
          <span className={styles.view}>
            View
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
}
