import type { BatsmanLine, BowlerLine, InningsScore } from '@/types';
import { ordinal } from '@/lib/text';
import PlayerLink from './PlayerLink';
import mc from './matchCenter.module.scss';
import styles from './TopPerformers.module.scss';

const BATTERS_SHOWN = 2;

const topBatters = (lines: BatsmanLine[]) =>
  lines
    .filter((b) => b.runs > 0)
    .sort((a, b) => b.runs - a.runs || a.balls - b.balls)
    .slice(0, BATTERS_SHOWN);

const topBowler = (lines: BowlerLine[]): BowlerLine | null =>
  lines.filter((b) => b.wickets > 0).sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)[0] ?? null;

/** A finished match's best two bats and best bowler per innings, each a way into the player's page. */
export default function TopPerformers({ innings }: { innings: InningsScore[] }) {
  const twice = innings.some((i) => (i.inningsNumber ?? 1) > 1);
  const cards = innings
    .filter((i) => !i.notStarted)
    .map((inn, index) => ({
      key: `${inn.teamId ?? inn.teamShortName}-${inn.inningsNumber ?? index}`,
      label: twice && inn.inningsNumber ? `${inn.teamShortName} ${ordinal(inn.inningsNumber)} innings` : inn.teamShortName,
      score: `${inn.runs}/${inn.wickets}`,
      batters: topBatters(inn.batting ?? []),
      bowler: topBowler(inn.bowling ?? []),
    }))
    .filter((c) => c.batters.length || c.bowler);

  if (!cards.length) return null;

  return (
    <section className={mc.block} aria-labelledby="top-performers">
      <div className={mc.blockHead}>
        <h2 id="top-performers" className={mc.blockTitle}>
          Top performers
        </h2>
      </div>
      <div className={styles.grid}>
        {cards.map((c) => (
          <article key={c.key} className={styles.card}>
            <header className={styles.head}>
              <h3 className={styles.team}>{c.label}</h3>
              <span className={styles.score}>{c.score}</span>
            </header>
            <ul className={styles.list}>
              {c.batters.map((b) => (
                <li key={b.playerId || b.name} className={styles.row}>
                  <PlayerLink id={b.playerId} name={b.name} className={styles.name} />
                  <span className={styles.figure}>
                    {b.runs}
                    {!b.out && '*'} <span className={styles.sub}>({b.balls})</span>
                  </span>
                </li>
              ))}
              {c.bowler && (
                <li className={`${styles.row} ${styles.bowling}`}>
                  <PlayerLink id={c.bowler.playerId} name={c.bowler.name} className={styles.name} />
                  <span className={styles.figure}>
                    {c.bowler.wickets}/{c.bowler.runs}
                  </span>
                </li>
              )}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
