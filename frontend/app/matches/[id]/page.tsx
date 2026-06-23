import { notFound } from 'next/navigation';
import type { Match } from '@crex/shared';
import { getMatch } from '../../../lib/api';
import MatchLiveView from '../../../components/match/MatchLiveView';

export async function generateMetadata({ params }: { params: { id: string } }) {
  try {
    const m = await getMatch(params.id);
    const year = new Date(m.startTime).getFullYear();
    const verb = m.status === 'LIVE' ? 'Live Score' : m.status === 'UPCOMING' ? 'Preview' : 'Result';
    return {
      title: `${m.homeTeam.shortName} vs ${m.awayTeam.shortName} ${verb} — ${m.format} ${year}`,
      description: `${m.homeTeam.name} vs ${m.awayTeam.name}, ${m.series.name}. ${m.format} ${verb.toLowerCase()} at ${m.venue}.`,
    };
  } catch {
    return { title: 'Match Centre' };
  }
}

export default async function MatchDetailPage({ params }: { params: { id: string } }) {
  let match: Match;
  try {
    match = await getMatch(params.id);
  } catch (err) {
    if ((err as { status?: number }).status === 404) notFound();
    throw err;
  }

  // Live polling happens client-side; we hand off the server-fetched match
  // as the initial state so the page is instantly populated (no spinner flash).
  return <MatchLiveView matchId={params.id} initial={match} />;
}
