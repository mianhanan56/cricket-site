import Link from 'next/link';
import type { Match, Team } from '@/types';
import { formatTeamScore, inningsFor } from '@/lib/innings';
import { attributeResult } from '@/lib/api';
import { matchStateOf } from '@/lib/matchState';
import TeamBadge from '../ui/TeamBadge';
import StateChip from '../live/StateChip';
import Icon from '../ui/Icon';
import styles from './ResultList.module.scss';
import { matchFormat } from '@/lib/seriesFormat';

function Side({ match, team, winner }: { match: Match; team: Team; winner: string | null }) {
  const score = formatTeamScore(inningsFor(match, team), match.format === 'TEST');
  const won = winner === team.id;
  return (
    <span className={`${styles.side} ${won ? styles.won : winner ? styles.lost : ''}`}>
      <TeamBadge name={team.name} shortName={team.shortName} logo={team.logo} size="sm" />
      <span className={styles.name}>{team.name}</span>
      <span className={styles.mark}>{won && <Icon name="check" size={15} strokeWidth={2.6} className={styles.check} />}</span>
      <span className={styles.score}>{score}</span>
    </span>
  );
}

/** Finished matches, result first. `inSeries` leaves out the name of the series the page is about. */
export default function ResultList({ matches, inSeries = false }: { matches: Match[]; inSeries?: boolean }) {
  return (
    <ul className={styles.list}>
      {matches.map((m) => {
        const { winnerKey } = attributeResult(m.result, m.homeTeam, m.awayTeam);
        const state = matchStateOf(m);
        return (
          <li key={m.id}>
            <Link href={`/matches/${m.id}`} className={styles.row}>
              <span className={styles.series}>
                <span className={styles.format}>{matchFormat(m)}</span>
                {!inSeries && <span className={styles.seriesName}>{m.series.name}</span>}
              </span>
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
                    {m.result && <span className={styles.resultSub}>{m.result}</span>}
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
