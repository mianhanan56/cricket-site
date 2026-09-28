import Link from 'next/link';
import type { Match, Team } from '@/types';
import { matchStateOf } from '@/lib/matchState';
import { liveEquation } from '@/lib/telemetry';
import TeamBadge from '../ui/TeamBadge';
import styles from './WhatMatters.module.scss';

const MAX_ITEMS = 4;
const PERFORMERS = 2;

type Item =
  | { kind: 'chase'; match: Match; line: string; sub: string; tight: boolean; ballsLeft: number }
  | { kind: 'performer'; match: Match; name: string; figures: string; sub: string; team: Team | null };

function chases(live: Match[]): Item[] {
  return live
    .flatMap<Item>((m) => {
      const eq = matchStateOf(m).alive ? liveEquation(m) : null;
      if (!eq?.target || eq.need == null || eq.ballsLeft == null || eq.need <= 0 || eq.ballsLeft <= 0) return [];
      const rates = [eq.rrr != null && `RRR ${eq.rrr.toFixed(2)}`, eq.crr != null && `CRR ${eq.crr.toFixed(2)}`].filter(Boolean);
      return [
        {
          kind: 'chase',
          match: m,
          line: `${eq.battingTeam.shortName} need ${eq.need} from ${eq.ballsLeft} ball${eq.ballsLeft === 1 ? '' : 's'}`,
          sub: [`v ${eq.bowlingTeam.shortName}`, ...rates].join(' · '),
          tight: eq.rrr != null && eq.crr != null && eq.rrr > eq.crr,
          ballsLeft: eq.ballsLeft,
        },
      ];
    })
    .sort((a, b) => (a.kind === 'chase' && b.kind === 'chase' ? a.ballsLeft - b.ballsLeft : 0));
}

function performers(results: Match[]): Item[] {
  return results
    .flatMap<Item>((m) => {
      const p = m.playerOfMatch;
      const figures = [p?.batting, p?.bowling].filter(Boolean).join(' · ');
      if (!p || !figures) return [];
      const team = [m.homeTeam, m.awayTeam].find((t) => t.id === p.teamId) ?? null;
      return [
        { kind: 'performer', match: m, name: p.name, figures, team, sub: m.result ?? `${m.homeTeam.shortName} v ${m.awayTeam.shortName}` },
      ];
    })
    .slice(0, PERFORMERS);
}

/** The few things worth knowing right now, from the feed alone. Hidden when there are none. */
export default function WhatMatters({ live, results }: { live: Match[]; results: Match[] }) {
  const items = [...chases(live), ...performers(results)].slice(0, MAX_ITEMS);
  if (!items.length) return null;

  return (
    <section className={styles.wrap} aria-labelledby="what-matters">
      <h2 id="what-matters" className={styles.title}>
        What matters
      </h2>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={`${item.kind}-${item.match.id}`}>
            <Link href={`/matches/${item.match.id}`} className={`${styles.item} ${styles[item.kind]}`}>
              {item.kind === 'chase' ? (
                <>
                  <span className={`${styles.label} ${item.tight ? styles.tight : ''}`}>
                    {item.tight ? 'Chase on' : 'Chase'}
                  </span>
                  <span className={styles.line}>{item.line}</span>
                  <span className={styles.sub}>{item.sub}</span>
                </>
              ) : (
                <>
                  <span className={styles.label}>Top performer</span>
                  <span className={styles.line}>
                    {item.team && (
                      <TeamBadge name={item.team.name} shortName={item.team.shortName} logo={item.team.logo} size="xs" />
                    )}
                    {item.name}
                    <span className={styles.figures}>{item.figures}</span>
                  </span>
                  <span className={styles.sub}>{item.sub}</span>
                </>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
