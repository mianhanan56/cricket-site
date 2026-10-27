'use client';

import type { Match, Team } from '@/types';
import { useApiMatches } from '@/hooks/useApiMatches';
import { formatTeamScore, inningsFor } from '@/lib/innings';
import { isLiveNow } from '@/lib/matchState';
import { matchFormat } from '@/lib/seriesFormat';
import TeamBadge from '../ui/TeamBadge';
import Skeleton from '../ui/Skeleton';
import Icon from '../ui/Icon';
import type { PickedEntity } from './EntityPicker';
import styles from './LiveMatchPicker.module.scss';

const matchName = (m: Match) => `${m.homeTeam.name} vs ${m.awayTeam.name}`;

function Side({ match, team }: { match: Match; team: Team }) {
  return (
    <span className={styles.side}>
      <TeamBadge name={team.name} shortName={team.shortName} logo={team.logo} size="xs" />
      <span className={styles.name}>{team.name}</span>
      <span className={styles.score}>{formatTeamScore(inningsFor(match, team), match.format === 'TEST')}</span>
    </span>
  );
}

/** The matches on now, one to pick. */
export default function LiveMatchPicker({
  value,
  onChange,
}: {
  value: PickedEntity | null;
  onChange: (next: PickedEntity | null) => void;
}) {
  const { matches, isLoading } = useApiMatches({ intervalMs: 30_000 });
  const live = matches.filter(isLiveNow);
  // An alert being edited can outlive its match; keep it on screen as the current pick.
  const gone = value && !live.some((m) => m.id === value.id) ? value : null;

  if (isLoading) {
    return (
      <div className={styles.grid} role="status" aria-label="Loading live matches">
        <Skeleton className={styles.placeholder} />
        <Skeleton className={styles.placeholder} />
      </div>
    );
  }

  if (!live.length && !gone) {
    return (
      <p className={styles.none}>
        <Icon name="live" size={17} />
        No matches are live right now.
      </p>
    );
  }

  return (
    <div className={styles.grid} role="group" aria-label="Live matches">
      {gone && (
        <button type="button" aria-pressed="true" className={`${styles.card} ${styles.on}`} onClick={() => onChange(null)}>
          <span className={styles.top}>
            <span className={styles.name}>{gone.name}</span>
            <Icon name="check" size={16} className={styles.tick} />
          </span>
        </button>
      )}
      {live.map((m) => {
        const on = value?.id === m.id;
        return (
          <button
            key={m.id}
            type="button"
            aria-pressed={on}
            className={`${styles.card} ${on ? styles.on : ''}`}
            onClick={() => onChange(on ? null : { id: m.id, name: matchName(m) })}
          >
            <span className={styles.top}>
              <span className={styles.format}>{matchFormat(m)}</span>
              <span className={styles.series}>{m.series.name}</span>
              {on && <Icon name="check" size={16} className={styles.tick} />}
            </span>
            <Side match={m} team={m.homeTeam} />
            <Side match={m} team={m.awayTeam} />
          </button>
        );
      })}
    </div>
  );
}
