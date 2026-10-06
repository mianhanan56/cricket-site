'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { Match } from '@/types';
import { formatInZone, readerZone, SERVER_ZONE } from '@/lib/datetime';
import { matchStateOf } from '@/lib/matchState';
import TeamBadge from '../ui/TeamBadge';
import Countdown from '../live/Countdown';
import StateChip from '../live/StateChip';
import styles from './UpcomingRail.module.scss';
import { venueText } from '@/lib/venue';
import { matchFormat } from '@/lib/seriesFormat';

function dayKeyIn(iso: string, zone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(iso)
  );
}

function dayHeading(key: string, today: string, tomorrow: string): string {
  if (key === today) return 'Today';
  if (key === tomorrow) return 'Tomorrow';
  // `key` is already the reader's date; read it back in UTC, as noon UTC is tomorrow east of +12.
  return formatInZone(`${key}T12:00:00Z`, 'dayDate', 'UTC').replace(/\s\d{4}$/, '');
}

/** Upcoming fixtures on a time rail, grouped by the reader's own day. */
export default function UpcomingRail({
  matches,
  limit,
  timeline = false,
}: {
  matches: Match[];
  limit?: number;
  /** Draw the time rail — the schedule views only. */
  timeline?: boolean;
}) {
  const [zone, setZone] = useState(SERVER_ZONE);
  useEffect(() => setZone(readerZone()), []);

  const days = useMemo(() => {
    const now = new Date();
    const today = dayKeyIn(now.toISOString(), zone);
    const tomorrow = dayKeyIn(new Date(now.getTime() + 86_400_000).toISOString(), zone);
    const list = [...matches]
      .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime))
      .slice(0, limit ?? matches.length);
    const groups = new Map<string, Match[]>();
    for (const m of list) {
      const k = dayKeyIn(m.startTime, zone);
      groups.set(k, [...(groups.get(k) ?? []), m]);
    }
    return [...groups.entries()].map(([key, items]) => ({
      key,
      heading: dayHeading(key, today, tomorrow),
      items,
    }));
  }, [matches, zone, limit]);

  return (
    <div className={`${styles.rail} ${timeline ? '' : styles.plain}`}>
      {days.map((day) => (
        <section key={day.key} className={styles.day} aria-label={day.heading}>
          <header className={styles.dayHead}>
            <h3 className={styles.dayTitle}>{day.heading}</h3>
            <span className={styles.dayCount}>
              {day.items.length} {day.items.length === 1 ? 'match' : 'matches'}
            </span>
          </header>
          <ol className={styles.list}>
            {day.items.map((m) => {
              const state = matchStateOf(m);
              return (
                <li key={m.id} className={styles.item}>
                  <Link href={`/matches/${m.id}`} className={styles.link}>
                    <span className={styles.time}>
                      <time dateTime={m.startTime} suppressHydrationWarning>
                        {formatInZone(m.startTime, 'time', zone)}
                      </time>
                      {m.status === 'UPCOMING' && (
                        <Countdown iso={m.startTime} className={styles.countdown} soonClassName={styles.soon} />
                      )}
                    </span>
                    <span className={styles.node} aria-hidden="true" />
                    <span className={styles.body}>
                      <span className={styles.teams}>
                        <span className={styles.side}>
                          <TeamBadge name={m.homeTeam.name} shortName={m.homeTeam.shortName} logo={m.homeTeam.logo} size="xs" />
                          <span className={styles.code}>{m.homeTeam.shortName}</span>
                          <span className={styles.full}>{m.homeTeam.name}</span>
                        </span>
                        <span className={styles.vs}>vs</span>
                        <span className={styles.side}>
                          <TeamBadge name={m.awayTeam.name} shortName={m.awayTeam.shortName} logo={m.awayTeam.logo} size="xs" />
                          <span className={styles.code}>{m.awayTeam.shortName}</span>
                          <span className={styles.full}>{m.awayTeam.name}</span>
                        </span>
                      </span>
                      <span className={styles.meta}>
                        <span className={styles.format}>{matchFormat(m)}</span>
                        <span className={styles.series}>{m.series.name}</span>
                        <span className={styles.venue}>{venueText(m.venue)}</span>
                      </span>
                    </span>
                    {state.key !== 'UPCOMING' && <StateChip state={state} className={styles.state} />}
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
