import { NextResponse } from 'next/server';
import { getRankings } from '@/lib/rankings';
import { rankedDirectory } from '@/lib/directory';
import { getApiSeriesCatalogue } from '@/lib/api';
import type { RemoteIndex } from '@/lib/searchIndex';

export const revalidate = 3600;

// The catalogue swallows each failed page, so an outage shows up as a short list, not an error.
const MIN_SERIES = 20;

export async function GET() {
  const [rankings, series] = await Promise.all([getRankings(), getApiSeriesCatalogue({ revalidate })]);
  // Thrown, so ISR keeps serving the last good copy instead of caching an empty one. A build has no
  // copy to keep, and failing it would block the deploy, so it ships what it has.
  if (series.length < MIN_SERIES && process.env.NEXT_PHASE !== 'phase-production-build')
    throw new Error(`series catalogue came back with ${series.length} series`);
  const { players, teams } = rankedDirectory(rankings);

  return NextResponse.json({
    players: players.map((p) => ({ id: p.id, name: p.name, country: p.country })),
    teams: teams.map((t) => ({ id: t.id, name: t.name, shortName: t.shortName, logo: t.logo })),
    series,
  } satisfies RemoteIndex);
}
