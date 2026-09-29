'use client';

import type { Match } from '@/types';
import { useCrexMatches } from '@/hooks/useCrexMatches';
import MatchTile from '../match/MatchTile';

/** The server's live tiles, kept current off the shared list poll. */
export default function LiveSeriesTiles({ matches, className }: { matches: Match[]; className?: string }) {
  const { matches: feed, lastUpdated } = useCrexMatches();
  const fresh = new Map((lastUpdated ? feed : []).map((m) => [m.id, m]));

  return (
    <div className={className}>
      {matches.map((m) => (
        <MatchTile key={m.id} match={fresh.get(m.id) ?? m} showSeries={false} />
      ))}
    </div>
  );
}
