import Link from 'next/link';
import type { Match, Team } from '@/types';
import { formatTeamScore, inningsFor } from '@/lib/innings';
import { attributeResult } from '@/lib/crex';
import { matchStateOf } from '@/lib/matchState';
import TeamBadge from '../ui/TeamBadge';
import StateChip from '../live/StateChip';
import Icon from '../ui/Icon';
import styles from './ResultList.module.scss';

function Side({ match, team, winner }: { match: Match; team: Team; winner: string | null }) {
  const score = formatTeamScore(inningsFor(match, team), match.format === 'TEST');
  const won = winner === team.id;
  return (
    <span className={`${styles.side} ${won ? styles.won : winner ? styles.lost : ''}`}>
      <TeamBadge name={team.name} shortName={team.shortName} logo={team.logo} size="xs" />
      <span className={styles.code}>{team.shortName}</span>
      <span className={styles.score}>{score || '—'}</span>
      <span className={styles.mark}>{won && <Icon name="check" size={14} strokeWidth={2.6} className={styles.check} />}</span>
    </span>
  );
}

/**
 * Finished matches, result first. `compact` is the overview's summary: the two
 * scores, the result, and the award — series and figures live on the match page.
 */
export default function ResultList({ matches, variant = 'full' }: { matches: Match[]; variant?: 'full' | 'compact' }) {
  const compact = variant === 'compact';
  return (
    <ul className={`${styles.list} ${compact ? styles.compact : ''}`}>
      {matches.map((m) => {
        const { winnerKey } = attributeResult(m.result, m.homeTeam, m.awayTeam);
        const state = matchStateOf(m);
        const potm = m.playerOfMatch;
        return (
          <li key={m.id}>
            <Link href={`/matches/${m.id}`} className={styles.row}>
              <span className={styles.sides}>
                <Side match={m} team={m.homeTeam} winner={winnerKey} />
                <Side match={m} team={m.awayTeam} winner={winnerKey} />
              </span>
              <span className={styles.outcome}>
                {state.key === 'FINISHED' ? (
                  <span className={styles.result}>{m.result ?? 'Result'}</span>
                ) : (
                  <span className={styles.resultRow}>
                    <StateChip state={state} />
                    {!compact && m.result && <span className={styles.resultSub}>{m.result}</span>}
                  </span>
                )}
                {compact ? (
                  potm && (
                    <span className={styles.potm}>
                      <span className={styles.potmLabel}>Player of the match</span>
                      {potm.name}
                    </span>
                  )
                ) : (
                  <span className={styles.meta}>
                    {potm && (
                      <span className={styles.potm}>
                        <span className={styles.potmLabel}>Player of the match</span>
                        {potm.name}
                        {(potm.batting || potm.bowling) && (
                          <span className={styles.potmFig}>{[potm.batting, potm.bowling].filter(Boolean).join(' · ')}</span>
                        )}
                      </span>
                    )}
                    <span className={styles.series}>
                      {m.format} · {m.series.name}
                    </span>
                  </span>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
