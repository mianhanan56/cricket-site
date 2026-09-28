import Link from 'next/link';
import type { Match } from '@/types';
import { matchStateOf } from '@/lib/matchState';
import TeamBadge from '../ui/TeamBadge';
import Icon from '../ui/Icon';
import LocalTime from '../ui/LocalTime';
import Countdown from '../live/Countdown';
import CreaseLine from '../live/CreaseLine';
import StateChip from '../live/StateChip';
import styles from './NextUpHero.module.scss';

/** The stage when nothing is live: the next first ball, counting down. */
export default function NextUpHero({ match }: { match: Match }) {
  const state = matchStateOf(match);

  return (
    <section className={styles.hero} aria-labelledby="next-title">
      <div className={styles.grid} aria-hidden="true" />
      <header className={styles.top}>
        <span className={styles.label}>Next first ball</span>
        {state.key !== 'UPCOMING' && <StateChip state={state} full />}
      </header>

      <div className={styles.body}>
        <h2 id="next-title" className={styles.matchup}>
          <span className={styles.side}>
            <TeamBadge name={match.homeTeam.name} shortName={match.homeTeam.shortName} logo={match.homeTeam.logo} size="lg" />
            <span className={styles.name}>{match.homeTeam.name}</span>
          </span>
          <span className={styles.vs}>vs</span>
          <span className={styles.side}>
            <TeamBadge name={match.awayTeam.name} shortName={match.awayTeam.shortName} logo={match.awayTeam.logo} size="lg" />
            <span className={styles.name}>{match.awayTeam.name}</span>
          </span>
        </h2>

        <div className={styles.clock}>
          <span className={styles.clockLabel}>Starts in</span>
          <Countdown iso={match.startTime} className={styles.count} pastLabel="Any moment" />
          <LocalTime iso={match.startTime} format="dayTime" className={styles.when} />
        </div>
      </div>

      <CreaseLine family="upcoming" />

      <footer className={styles.foot}>
        <span className={styles.meta}>
          <span className={styles.format}>{match.format}</span>
          <span>{match.series.name}</span>
          <span className={styles.venue}>{match.venue}</span>
        </span>
        <Link href={`/matches/${match.id}`} className={styles.open}>
          Match preview
          <Icon name="arrowRight" size={17} />
        </Link>
      </footer>
    </section>
  );
}
