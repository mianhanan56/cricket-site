'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import type { Team } from '@/types';
import { attributeResult, type SeriesScheduleMatch } from '@/lib/api';
import { matchFormat } from '@/lib/seriesFormat';
import { ordinal } from '@/lib/text';
import { useScrollFade } from '@/hooks/useScrollFade';
import TeamBadge from '../ui/TeamBadge';
import LocalTime from '../ui/LocalTime';
import Icon from '../ui/Icon';
import styles from './SeriesMatchStrip.module.scss';

type ChipState = 'finished' | 'void' | 'live' | 'next' | 'upcoming';

const STATE_WORD: Record<ChipState, string> = {
  finished: 'finished',
  void: 'no result',
  live: 'live now',
  next: 'next match',
  upcoming: 'upcoming',
};

const WON_BY = /\s+won\s+by\s+/i;

/** "37 runs", "5 wickets (DLS)" — the margin, short enough for a card. */
function marginOf(result: string | null): string | undefined {
  const margin = result?.split(WON_BY)[1];
  return margin?.replace(/\s+method\)/i, ')').replace(/^an innings and /i, 'inns & ');
}

function chipState(m: SeriesScheduleMatch, nextKey: string | undefined): ChipState {
  if (m.status === 'LIVE') return 'live';
  if (m.status === 'UPCOMING') return m.key === nextKey ? 'next' : 'upcoming';
  return /abandon|no result|cancel/i.test(m.result ?? '') ? 'void' : 'finished';
}

function Side({ team, outcome }: { team: Team; outcome?: 'won' | 'lost' }) {
  return (
    <span className={styles.side} data-outcome={outcome}>
      <TeamBadge name={team.name} shortName={team.shortName} logo={team.logo} size="xs" />
      <span className={styles.code}>{team.shortName}</span>
      {outcome === 'won' && <Icon name="check" size={14} strokeWidth={2.6} className={styles.check} />}
    </span>
  );
}

/**
 * Every match of a series as a small card — who won, by what, or when it starts —
 * scrolled on arrival to the match in play or the next one up.
 */
export default function SeriesMatchStrip({
  matches,
  multiFormat,
  className,
}: {
  matches: SeriesScheduleMatch[];
  /** A tour of T20s then ODIs numbers each format from 1, so cards say "2nd ODI". */
  multiFormat: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLOListElement>(null);
  useScrollFade(ref);

  const nextKey = matches.find((m) => m.status === 'UPCOMING')?.key;
  const currentKey = (matches.find((m) => m.status === 'LIVE')?.key ?? nextKey ?? matches[matches.length - 1]?.key) || '';

  useEffect(() => {
    const row = ref.current;
    const current = row?.querySelector<HTMLElement>('[data-current]');
    if (!row || !current || row.scrollWidth <= row.clientWidth) return;
    // The last result stays in view beside it.
    const from = (current.previousElementSibling as HTMLElement | null) ?? current;
    const inset = row.getBoundingClientRect().left + parseFloat(getComputedStyle(row).paddingLeft);
    row.scrollLeft += from.getBoundingClientRect().left - inset;
  }, [currentKey]);

  const perFormat = new Map<string, number>();

  return (
    <ol ref={ref} className={`${styles.strip} ${className ?? ''}`} aria-label="Every match">
      {matches.map((m, i) => {
        const format = matchFormat(m);
        const nth = (perFormat.get(format) ?? 0) + 1;
        perFormat.set(format, nth);
        const newRun = multiFormat && i > 0 && matches[i - 1].format !== m.format;

        const no = m.matchNo?.trim();
        const n = no && /^\d+$/.test(no) ? Number(no) : no ? null : multiFormat ? nth : i + 1;
        const label =
          n === null ? (no as string) : multiFormat ? `${ordinal(n)} ${format === 'TEST' ? 'Test' : format}` : `Match ${n}`;

        const state = chipState(m, nextKey);
        const { winnerKey } = attributeResult(m.result, m.homeTeam, m.awayTeam);
        const outcome = (team: Team) => (winnerKey ? (winnerKey === team.id ? 'won' : 'lost') : undefined);
        const margin = winnerKey ? marginOf(m.result) : undefined;
        const title = `${label}: ${m.homeTeam.shortName} v ${m.awayTeam.shortName}, ${m.result ?? STATE_WORD[state]}`;

        return (
          <li key={m.key} data-current={m.key === currentKey || undefined} data-run={newRun || undefined}>
            <Link href={`/matches/${m.id}`} className={styles.chip} data-state={state} title={title} aria-label={title}>
              <span className={styles.label}>{label}</span>
              <Side team={m.homeTeam} outcome={outcome(m.homeTeam)} />
              <Side team={m.awayTeam} outcome={outcome(m.awayTeam)} />
              <span className={styles.foot}>
                {state === 'live' ? (
                  <span className={styles.live}>Live now</span>
                ) : state === 'next' || state === 'upcoming' ? (
                  <>
                    {state === 'next' && <span className={styles.nextWord}>Next</span>}
                    <LocalTime iso={m.startTime} format="dateShort" />
                    <span className={styles.clock}>
                      <span aria-hidden="true"> · </span>
                      <LocalTime iso={m.startTime} format="time" lower />
                    </span>
                  </>
                ) : margin ? (
                  `by ${margin}`
                ) : (
                  (m.result ?? 'Result')
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
