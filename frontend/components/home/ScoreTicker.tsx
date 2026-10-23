'use client';

import { useEffect, useRef } from 'react';
import type { Match } from '@/types';
import { matchStateOf } from '@/lib/matchState';
import { liveEquation } from '@/lib/telemetry';
import { battedInnings } from '@/lib/innings';
import Ticker from '../live/Ticker';
import TeamBadge from '../ui/TeamBadge';
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
  const rail = useRef<HTMLDivElement>(null);

  // The stage remounts on every pick, so bring the picked match back into view.
  useEffect(() => {
    const el = rail.current;
    const on = el?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!el || !on) return;
    const left = on.offsetLeft;
    if (left < el.scrollLeft || left + on.offsetWidth > el.scrollLeft + el.clientWidth) {
      el.scrollLeft = left - (el.clientWidth - on.offsetWidth) / 2;
    }
  }, [activeId]);

  return (
    <div ref={rail} className={styles.rail} role="group" aria-label="Live matches">
      {matches.map((m) => {
        const state = matchStateOf(m);
        const eq = liveEquation(m);
        // Without an equation (no innings marked current) the latest score still beats a bare "Live".
        const batted = battedInnings(m.scorecard?.innings ?? []);
        const inn = eq?.innings ?? batted.find((i) => i.phase === 'CURRENT') ?? batted[batted.length - 1];
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
            <span className={styles.flags} aria-hidden="true">
              <TeamBadge name={m.homeTeam.name} shortName={m.homeTeam.shortName} logo={m.homeTeam.logo} size="sm" />
              <TeamBadge name={m.awayTeam.name} shortName={m.awayTeam.shortName} logo={m.awayTeam.logo} size="sm" />
            </span>
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
