import { NextResponse } from 'next/server';
import { getApiPlayerCatalogue } from '@/lib/api';

// Squads move once before a tournament; a rebuild is ~500 upstream reads, so it runs rarely and in the background.
export const revalidate = 21600;
export const maxDuration = 60;

// The catalogue swallows each failed read, so an outage shows up as a short list, not an error.
const MIN_PLAYERS = 200;

export async function GET() {
  const players = await getApiPlayerCatalogue({ revalidate });
  // Thrown, so ISR keeps serving the last good copy instead of caching an empty one for hours. A build
  // has no copy to keep, and failing it would block the deploy, so it ships what it has.
  if (players.length < MIN_PLAYERS && process.env.NEXT_PHASE !== 'phase-production-build')
    throw new Error(`player catalogue came back with ${players.length} players`);
  return NextResponse.json(players);
}
