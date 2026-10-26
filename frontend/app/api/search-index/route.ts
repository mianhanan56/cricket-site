import { NextResponse } from 'next/server';
import { getRankings } from '@/lib/rankings';
import { rankedDirectory } from '@/lib/directory';
import { getApiSeriesCatalogue } from '@/lib/api';
import type { RemoteIndex } from '@/lib/searchIndex';

export const revalidate = 3600;

export async function GET() {
  const [rankings, series] = await Promise.all([getRankings(), getApiSeriesCatalogue({ revalidate }).catch(() => [])]);
  const { players, teams } = rankedDirectory(rankings);

  return NextResponse.json({
    players: players.map((p) => ({ id: p.id, name: p.name, country: p.country })),
    teams: teams.map((t) => ({ id: t.id, name: t.name, shortName: t.shortName, logo: t.logo })),
    series,
  } satisfies RemoteIndex);
}
