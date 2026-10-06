'use client';

import type { SeriesLeaders } from '@/types';
import { useSeriesLeaders } from '@/hooks/useSeriesLeaders';
import { LeaderFigure, SeriesLeadersBoard, rankedLeaders } from './SeriesLeaders';

interface Props {
  seriesId: string;
  initial: SeriesLeaders;
  /** A match in the series is in play, so the figures move by the ball. */
  live: boolean;
}

/** Most runs and most wickets, for the series control center's side column. */
export function LiveLeaderFigures({ seriesId, initial, live, className }: Props & { className?: string }) {
  const leaders = useSeriesLeaders(seriesId, initial, live);
  const shown = leaders ? rankedLeaders(leaders) : [];
  const top = (['RUNS', 'WICKETS'] as const)
    .map((kind) => shown.find((l) => l.kind === kind))
    .filter((l) => l !== undefined);
  if (!top.length) return null;
  return (
    <div className={className}>
      {top.map((leader) => (
        <LeaderFigure key={leader.kind} leader={leader} seriesId={seriesId} />
      ))}
    </div>
  );
}

export function LiveLeadersBoard({ seriesId, initial, live, children }: Props & { children?: React.ReactNode }) {
  const leaders = useSeriesLeaders(seriesId, initial, live);
  return leaders ? (
    <SeriesLeadersBoard leaders={leaders} seriesId={seriesId}>
      {children}
    </SeriesLeadersBoard>
  ) : null;
}
