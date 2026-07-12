import Link from 'next/link';
import type { Match, Team, InningsScore } from '@crex/shared';
import styles from './MatchCard.module.scss';

// CricAPI innings carry a label like "New Zealand Women Inning 1". Match an
// innings to a team ONLY when that label contains the team's name (or short
// name) — no positional fallback, so a single innings is never handed to the
// wrong team. No match → the team hasn't batted yet.
function inningsFor(match: Match, team: Team): InningsScore | undefined {
  const innings = match.scorecard?.innings ?? [];
  if (!innings.length) return undefined;
  const name = team.name.toLowerCase();
  const short = team.shortName.toLowerCase();
  return innings.find((i) => {
    const label = ((i as { inning?: string }).inning ?? i.teamShortName ?? '').toLowerCase();
    return !!label && (label.includes(name) || label.includes(short));
  });
}

// Deterministic brand color per team from its short name — the DB carries no
// team color, so we derive a stable hue (badge gradient) that never changes
// between renders for the same team.
function teamHue(code: string): number {
  let h = 0;
  for (let i = 0; i < code.length; i += 1) h = (h * 31 + code.charCodeAt(i)) % 360;
  return h;
}

function formatStart(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUS_CLASS: Record<Match['status'], string> = {
  LIVE: 'isLive',
  UPCOMING: 'isUpcoming',
  COMPLETED: 'isCompleted',
};

function TeamRow({ team, innings, dim }: { team: Team; innings?: InningsScore; dim?: boolean }) {
  const hue = teamHue(team.shortName);
  return (
    <div className={`${styles.team} ${dim ? styles.dim : ''}`}>
      <div className={styles.teamLeft}>
        <span
          className={styles.badge}
          style={{
            background: `linear-gradient(135deg, hsl(${hue} 68% 52%), hsl(${(hue + 40) % 360} 62% 40%))`,
            boxShadow: `0 6px 20px -8px hsl(${hue} 68% 52%)`,
          }}
        >
          {team.shortName.slice(0, 3)}
        </span>
        <div className={styles.teamMeta}>
          <div className={styles.teamCode}>{team.shortName}</div>
          {innings && <div className={styles.overs}>{innings.overs} overs</div>}
        </div>
      </div>
      {innings ? (
        <div className={styles.score}>
          {innings.runs}
          <span className={styles.wickets}>/{innings.wickets}</span>
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
  const isCompleted = match.status === 'COMPLETED';
  const homeInn = inningsFor(match, match.homeTeam);
  const awayInn = inningsFor(match, match.awayTeam);

  return (
    <Link href={`/matches/${match.id}`} className={`${styles.card} ${styles[STATUS_CLASS[match.status]]}`}>
      {/* header — format chip + series on the left, status on the right */}
      <div className={styles.header}>
        <div className={styles.headLeft}>
          <span className={styles.format}>{match.format}</span>
          <span className={styles.series}>{match.series.name}</span>
        </div>
        {isLive ? (
          <span className={styles.live}>
            <span className={styles.dot} aria-hidden="true" />
            LIVE
          </span>
        ) : isUpcoming ? (
          <span className={styles.upcoming}>UPCOMING</span>
        ) : (
          <span className={styles.result}>RESULT</span>
        )}
      </div>

      {/* teams */}
      <div className={styles.teams}>
        <TeamRow team={match.homeTeam} innings={homeInn} />
        <TeamRow team={match.awayTeam} innings={awayInn} />
      </div>

      {/* footer */}
      <div className={styles.footer}>
        {isUpcoming ? (
          <div className={styles.footNote}>
            Starts <span className={styles.strong}>{formatStart(match.startTime)}</span>
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
            {match.venue}
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
