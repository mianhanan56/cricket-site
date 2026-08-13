import { notFound } from 'next/navigation';
import { getCrexMatch } from '../../../lib/crex';
import MatchDetail from '../../../components/match/MatchDetail';

// Ids here are crex keys ("ZLN", "13BS") — the same ones the home page, fixtures
// and search link with. This used to try our own backend first and fall through
// to crex on failure; with the backend gone that first hop was a guaranteed
// failed round-trip on every request, so it is gone too.
//
// Freshness is set per-fetch below rather than with a page-level `revalidate`:
// making the route ISR-cached also caches the notFound() path, which turns an
// unknown id into a soft 404 — the not-found page served with a 200.
const REVALIDATE = 5;

export async function generateMetadata({ params }: { params: { id: string } }) {
  const m = await getCrexMatch(params.id, { revalidate: REVALIDATE }).catch(() => null);
  if (!m) return { title: 'Match Centre' };

  const year = new Date(m.startTime).getFullYear();
  const verb = m.status === 'LIVE' ? 'Live Score' : m.status === 'UPCOMING' ? 'Preview' : 'Result';
  return {
    title: `${m.homeTeam.shortName} vs ${m.awayTeam.shortName} ${verb} — ${m.format} ${year}`,
    description: `${m.homeTeam.name} vs ${m.awayTeam.name}, ${m.series.name}. ${m.format} ${verb.toLowerCase()} at ${m.venue}.`,
  };
}

export default async function MatchDetailPage({ params }: { params: { id: string } }) {
  const match = await getCrexMatch(params.id, { revalidate: REVALIDATE });
  if (!match) notFound();

  return <MatchDetail matchId={params.id} initial={match} />;
}
