import type { PlayerRoleLabel } from '@/types';
import { freshCards, getApiPlayerSeriesPage } from '@/lib/api';
import { recentSeriesMatches, withCardFigures } from '@/lib/liveFigures';
import { defaultSeries, firstLists, mergeLists, seriesFormatCode, type PageFetcher } from '@/lib/playerSeries';
import SeriesPerformance from './SeriesPerformance';

/** The Form section's "By series" view; a ?format= / ?series= link is applied in the browser. */
export default async function PlayerSeriesSection({
  playerId,
  role,
  formatCodes,
}: {
  playerId: string;
  role: PlayerRoleLabel;
  formatCodes: number[];
}) {
  const fetchPage: PageFetcher = (discipline, page) =>
    getApiPlayerSeriesPage(playerId, { format: seriesFormatCode('all'), discipline, page }, { revalidate: 3600 });

  // A failed read is left to the browser: the page is ISR, and an empty section would be cached with it.
  let lists = await firstLists(fetchPage).catch(() => null);
  if (lists) {
    const recent = recentSeriesMatches(lists);
    if (recent.length) lists = withCardFigures(lists, playerId, await freshCards(recent, { revalidate: 300 }));
  }

  return (
    <SeriesPerformance
      playerId={playerId}
      role={role}
      formatCodes={formatCodes}
      initialFormat="all"
      initialLists={lists}
      initialSeries={lists ? defaultSeries(mergeLists(lists))?.id ?? null : null}
    />
  );
}
