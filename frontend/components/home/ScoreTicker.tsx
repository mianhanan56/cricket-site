import type { Match } from '@/types';
import { matchStateOf } from '@/lib/matchState';
import { liveEquation } from '@/lib/telemetry';
import Ticker from '../live/Ticker';
import styles from './ScoreTicker.module.scss';

/** Every live match as a switch — picks which one holds the stage. */
export default function ScoreTicker({
  matches,
  activeId,
  onSelect,
}: {
  matches: Match[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className={styles.rail} role="group" aria-label="Live matches">
      {matches.map((m) => {
        const state = matchStateOf(m);
        const eq = liveEquation(m);
        const inn = eq?.innings;
        const active = m.id === activeId;
        const reading = [inn && `${inn.runs}/${inn.wickets} in ${inn.overs} ${inn.overs === 1 ? 'over' : 'overs'}`, !state.alive || !inn ? state.word : null];
        return (
          <button
            key={m.id}
            type="button"
            className={`${styles.item} ${styles[state.family] ?? ''} ${active ? styles.active : ''}`}
            aria-pressed={active}
            aria-label={[`${m.homeTeam.name} v ${m.awayTeam.name}`, ...reading].filter(Boolean).join(', ')}
            onClick={() => onSelect(m.id)}
          >
            <span className={styles.glyph} aria-hidden="true" />
            <span className={styles.teams}>
              <span className={eq?.battingTeam.id === m.homeTeam.id ? styles.bat : undefined}>{m.homeTeam.shortName}</span>
              <span className={styles.v}>v</span>
              <span className={eq?.battingTeam.id === m.awayTeam.id ? styles.bat : undefined}>{m.awayTeam.shortName}</span>
            </span>
            {inn ? (
              <span className={styles.score}>
                <Ticker value={`${inn.runs}/${inn.wickets}`} />
                {state.alive ? (
                  <span className={styles.ov}>{inn.overs}</span>
                ) : (
                  <span className={styles.word}>{state.word}</span>
                )}
              </span>
            ) : (
              <span className={styles.word}>{state.word}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
