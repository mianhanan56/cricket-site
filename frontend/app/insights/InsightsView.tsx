'use client';

import { useMemo } from 'react';
import type { Match } from '@/types';
import { useCrexMatches } from '@/hooks/useCrexMatches';
import { isLiveNow, matchStateOf } from '@/lib/matchState';
import { liveEquation } from '@/lib/telemetry';
import { rankLive } from '@/lib/featured';
import { useFollows } from '@/lib/follows';
import { PageHeader, SectionHead } from '@/components/ui/Section';
import InsightCard from '@/components/insights/InsightCard';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import { BoardSkeleton } from '@/components/home/HomeSkeleton';
import MatchTile from '@/components/match/MatchTile';
import styles from './insights.module.scss';

const DAY_MS = 24 * 60 * 60 * 1000;

// How close a chase is: 1 is the rates level, higher is harder for the batting side.
function tension(m: Match): number | null {
  const eq = liveEquation(m);
  if (eq?.rrr == null || !eq.crr) return null;
  return eq.rrr / eq.crr;
}

export default function InsightsView({ initial }: { initial: Match[] }) {
  const { matches, isLoading, error, refresh, isRefreshing } = useCrexMatches({ initial });
  const follows = useFollows();

  const live = useMemo(
    () =>
      rankLive(
        matches.filter(isLiveNow),
        new Set(follows.teams.map((t) => t.id)),
      ),
    [matches, follows.teams],
  );

  const vitals = useMemo(() => {
    const states = live.map((m) => matchStateOf(m));
    const chases = live.filter((m) => tension(m) !== null);
    return {
      live: live.length,
      inPlay: states.filter((s) => s.alive).length,
      chases: chases.length,
      tight: chases.filter((m) => (tension(m) ?? 0) > 1).length,
      stopped: states.filter((s) => ['interval', 'transition', 'weather', 'hold', 'dormant'].includes(s.family)).length,
      finished: matches.filter((m) => m.status === 'COMPLETED' && Date.now() - +new Date(m.startTime) < DAY_MS).length,
    };
  }, [live, matches]);

  const close = useMemo(
    () =>
      live
        .filter((m) => {
          const t = tension(m);
          return t !== null && t > 0.8 && t < 1.6;
        })
        .sort((a, b) => Math.abs((tension(a) ?? 0) - 1) - Math.abs((tension(b) ?? 0) - 1)),
    [live],
  );

  return (
    <div className={styles.page}>
      <PageHeader eyebrow="Live intelligence" title="Insights" />

      {live.length > 0 && (
        <dl className={styles.vitals}>
          {(
            [
              ['Live', vitals.live, 'signal'],
              ['Ball in play', vitals.inPlay, 'signal'],
              ['Chases on', vitals.chases, 'data'],
              ['Behind the rate', vitals.tight, 'warn'],
              ['Play stopped', vitals.stopped, 'data'],
              ['Finished today', vitals.finished, 'text'],
            ] as const
          ).map(([label, value, tone]) => (
            <div key={label} className={`${styles.vital} ${styles[tone] ?? ''}`}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {isLoading && !matches.length ? (
        <div className={styles.loading}>
          <BoardSkeleton />
        </div>
      ) : error && !matches.length ? (
        <ErrorState onRetry={refresh} retrying={isRefreshing} />
      ) : live.length ? (
        <>
          {close.length > 0 && (
            <section className={styles.section}>
              <SectionHead title="Tight chases" count={close.length} />
              <div className={styles.grid}>
                {close.map((m) => (
                  <MatchTile key={m.id} match={m} />
                ))}
              </div>
            </section>
          )}
          <section className={styles.section}>
            <SectionHead title="Every live match" count={live.length} />
            <div className={styles.grid}>
              {live.map((m) => (
                <InsightCard key={m.id} match={m} />
              ))}
            </div>
          </section>
        </>
      ) : (
        <EmptyState
          icon="insight"
          title="No live insights right now"
          body="We’ll surface important match situations here when there’s something worth watching."
          action={{ label: 'See what’s next', href: '/?tab=upcoming' }}
        />
      )}
    </div>
  );
}
