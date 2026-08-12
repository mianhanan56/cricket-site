import { notFound } from 'next/navigation';
import type { Match } from '@/types';
import { getMatch } from '../../../lib/api';
import { getCrexMatch, isCrexConfigured } from '../../../lib/crex';
import MatchDetail from '../../../components/match/MatchDetail';

/**
 * Resolve a match id from either source.
 *
 * The home page lists crex matches, whose ids ("ZLN", "13BS") are crex keys and
 * mean nothing to our backend — so clicking one 404s unless we fall back. The
 * backend is tried first: its records are richer (squads, team form, full
 * scorecards) and its ids are what the rest of the app links to.
 */
async function resolveMatch(id: string): Promise<{ match: Match; source: 'db' | 'crex' } | null> {
  try {
    return { match: await getMatch(id), source: 'db' };
  } catch (err) {
    // Any backend failure falls through to crex, not just a 404: a crex id is
    // *expected* to 404 here, and if the backend is down entirely we would
    // rather serve the crex view than an error page. With no crex configured
    // there is nothing to fall back to, so the error propagates.
    if (!isCrexConfigured()) throw err;
  }

  const match = await getCrexMatch(id, { revalidate: 5 });
  return match ? { match, source: 'crex' } : null;
}

export async function generateMetadata({ params }: { params: { id: string } }) {
  try {
    const resolved = await resolveMatch(params.id);
    if (!resolved) return { title: 'Match Centre' };

    const m = resolved.match;
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
  const resolved = await resolveMatch(params.id);
  if (!resolved) notFound();

  // Backend matches stream over the socket. crex ones have no push channel, so
  // MatchDetail polls the Worker for those instead — see `source`.
  return <MatchDetail matchId={params.id} initial={resolved.match} source={resolved.source} />;
}
