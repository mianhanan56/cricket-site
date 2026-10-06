'use client';

import Link from 'next/link';
import type { Match } from '@/types';
import type { MatchStateView } from '@/lib/matchState';
import { useCrexMatchSquads } from '@/hooks/useCrexMatches';
import LocalTime from '../ui/LocalTime';
import Countdown from '../live/Countdown';
import mc from './matchCenter.module.scss';
import styles from './PreStart.module.scss';
import { venueText } from '@/lib/venue';

/** The Live tab before the first ball: what is known about the start, from the feed. */
export default function PreStart({ match, state }: { match: Match; state: MatchStateView }) {
  const { conditions } = useCrexMatchSquads(match.id);
  const weather = conditions?.weather;
  const ground = conditions?.venue;
  const status = state.alive ? match.note?.label ?? 'Waiting for the first ball' : state.label;

  const figures = [
    weather?.temperature && { label: 'Weather', value: weather.temperature, note: weather.condition },
    weather?.rainChance && { label: 'Rain', value: weather.rainChance },
    ground?.averages[0] != null && { label: 'Avg 1st inns', value: String(ground.averages[0]), note: ground.label },
    ground?.wonBattingFirst != null &&
      ground.wonBowlingFirst != null && {
        label: 'Bat first · chase',
        value: `${ground.wonBattingFirst}–${ground.wonBowlingFirst}`,
        note: ground.matches != null ? `of ${ground.matches}` : null,
      },
  ].filter((f): f is { label: string; value: string; note?: string | null } => Boolean(f));

  return (
    <section className={mc.block} aria-labelledby="prestart-status">
      <div className={`${mc.surface} ${styles.card}`}>
        <p id="prestart-status" className={`${styles.status} ${styles[state.family] ?? ''}`}>
          {status}
        </p>
        <p className={styles.when}>
          <LocalTime iso={match.startTime} format="dayTime" />
          {state.family === 'upcoming' && <Countdown iso={match.startTime} className={styles.count} />}
          {match.venue &&
            (match.venueId ? (
              <Link href={`/venues/${match.venueId}`} className={styles.venue}>
                {venueText(match.venue)}
              </Link>
            ) : (
              <span className={styles.venue}>{venueText(match.venue)}</span>
            ))}
        </p>
        {figures.length > 0 && (
          <dl className={styles.figs}>
            {figures.map((f) => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd>
                  {f.value}
                  {f.note && <small>{f.note}</small>}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
