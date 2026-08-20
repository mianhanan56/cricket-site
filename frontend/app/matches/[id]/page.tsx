import { notFound, redirect } from 'next/navigation';
import type { HeadToHead, PointsTableGroup } from '@/types';
import {
  getCrexFixtureRange,
  getCrexMatch,
  getCrexMatchSeriesSquads,
  getCrexScheduledMatch,
  getCrexSeriesTable,
  parseScheduledMatchId,
} from '../../../lib/crex';
import { headToHead } from '../../../lib/headToHead';
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

/**
 * Two kinds of id arrive here.
 *
 * A crex match key ("ZLN", "13BS") is the match's own address and every endpoint
 * takes it. An `fx-` id is a fixture crex has not allocated a key to yet — a Test
 * three weeks out — and is read back out of its series' schedule instead. Both
 * render the same page; the preview simply has no card, feed or squad list to
 * fetch, because upstream has none until the key exists.
 */
function loadMatch(id: string) {
  return parseScheduledMatchId(id)
    ? getCrexScheduledMatch(id)
    : getCrexMatch(id, { revalidate: REVALIDATE });
}

export async function generateMetadata({ params }: { params: { id: string } }) {
  const m = await loadMatch(params.id).catch(() => null);
  if (!m) return { title: 'Match Centre' };

  const year = new Date(m.startTime).getFullYear();
  const verb = m.status === 'LIVE' ? 'Live Score' : m.status === 'UPCOMING' ? 'Preview' : 'Result';
  return {
    title: `${m.homeTeam.shortName} vs ${m.awayTeam.shortName} ${verb} — ${m.format} ${year}`,
    description: `${m.homeTeam.name} vs ${m.awayTeam.name}, ${m.series.name}. ${m.format} ${verb.toLowerCase()} at ${m.venue}.`,
  };
}

export default async function MatchDetailPage({ params }: { params: { id: string } }) {
  const preview = parseScheduledMatchId(params.id) !== null;
  const match = await loadMatch(params.id);
  if (!match) notFound();

  // crex allocates the match key a day or two out, and links to the preview id
  // are already in the wild by then — in a schedule someone left open, in the
  // sitemap, in a shared URL. The row carries the new key as soon as it exists,
  // so the preview hands the reader to the real match page rather than becoming
  // a permanently keyless version of it.
  if (match.id !== params.id) redirect(`/matches/${match.id}`);

  // Computed here rather than in the component because the component polls: the
  // record between two sides does not change while a match is on, and refetching
  // a schedule corpus every five seconds to re-derive it would be absurd.
  //
  // The corpus keeps its own half-hour cache (see getCrexFixtureRange), so this
  // costs cached reads on a page whose own freshness is five seconds — the two
  // windows are independent, which is the whole reason freshness is per-fetch in
  // this app rather than per-route.
  //
  // The standings come along for the same reason and on the same terms: a league
  // match's context is where the two sides sit in the table, and the table moves
  // when a match finishes rather than when a ball is bowled. Both are static for
  // the life of the page, and both keep their own cache windows.
  //
  // Empty for a bilateral tour and for a competition where nothing has been
  // played yet, so the block is simply absent on most matches — which is right:
  // a Test tour has no standings worth printing.
  // Squads on a match that has not started. crex serves an announced XI keyed by
  // match and only close to the start, so an upcoming fixture usually has none —
  // and one with no match key at all can never have any. The series knows both
  // tour parties from the day they are named, so that is what a preview shows.
  //
  // Fetched here rather than in the component because it is the same series call
  // the standings below already make, and because it is static: a squad does not
  // change while a reader is on the page. Where crex *does* announce an XI the
  // component still prefers it — this is the floor, not the ceiling.
  const [record, table, squads] = await Promise.all([
    getCrexFixtureRange()
      .then((corpus): HeadToHead | null =>
        headToHead(match.homeTeam, match.awayTeam, corpus, { exclude: params.id })
      )
      .catch(() => null),
    match.series.id
      ? getCrexSeriesTable(match.series.id).catch(() => [] as PointsTableGroup[])
      : Promise.resolve([] as PointsTableGroup[]),
    match.status === 'UPCOMING' && !match.squads
      ? getCrexMatchSeriesSquads(match).catch(() => null)
      : Promise.resolve(null),
  ]);

  return (
    <MatchDetail
      matchId={params.id}
      preview={preview}
      initial={squads ? { ...match, squads } : match}
      headToHead={record}
      seriesTable={table}
    />
  );
}
