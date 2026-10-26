import { NextResponse } from 'next/server';
import { getApiPlayerCatalogue } from '@/lib/api';

// Squads move once before a tournament; a rebuild is ~500 upstream reads, so it runs rarely and in the background.
export const revalidate = 21600;
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json(await getApiPlayerCatalogue({ revalidate }).catch(() => []));
}
