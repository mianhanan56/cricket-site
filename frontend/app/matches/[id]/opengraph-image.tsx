import { getApiMatch, getApiScheduledMatch, parseScheduledMatchId } from '@/lib/api';
import { matchOrdinal } from '@/lib/seriesFormat';
import { VENUE_TBD } from '@/lib/venue';
import { shareCard, shareImage } from '@/lib/brandImage';

export const alt = 'Match preview card';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 300;

const STATUS = { LIVE: 'Live', UPCOMING: 'Upcoming', COMPLETED: 'Result' } as const;

export default async function MatchImage({ params }: { params: { id: string } }) {
  const m = await (parseScheduledMatchId(params.id)
    ? getApiScheduledMatch(params.id)
    : getApiMatch(params.id, { revalidate })
  ).catch(() => null);
  if (!m) return shareImage();

  return shareCard({
    eyebrow: STATUS[m.status],
    headline: `${m.homeTeam.name} vs ${m.awayTeam.name}`,
    lines: [
      `${m.stage ?? matchOrdinal(m)} · ${m.series.name}`,
      m.status === 'COMPLETED' && m.result ? m.result : m.venue === VENUE_TBD ? '' : m.venue,
    ].filter(Boolean),
  });
}
