import type { PlayerRoleLabel } from '@/types';
import { getCrexPlayerSeriesPage } from '@/lib/crex';
import {
  defaultSeries,
  firstLists,
  listsCovering,
  mergeLists,
  seriesFormatCode,
  type PageFetcher,
  type SeriesFormatKey,
} from '@/lib/playerSeries';
import EmptyState from '../ui/EmptyState';
import SeriesPerformance from './SeriesPerformance';

/** Older pages read on the server to reach a series named in the URL. */
const URL_SEARCH_PAGES = 8;

/** The Form section's "By series" view, read on the server so a linked series opens in place. */
export default async function PlayerSeriesSection({
  playerId,
  role,
  formatCodes,
  format,
  series,
}: {
  playerId: string;
  role: PlayerRoleLabel;
  formatCodes: number[];
  format: SeriesFormatKey;
  series: string | null;
}) {
  const fetchPage: PageFetcher = (discipline, page) =>
    getCrexPlayerSeriesPage(playerId, { format: seriesFormatCode(format), discipline, page }, { revalidate: 3600 });

  let lists = await firstLists(fetchPage).catch(() => null);
  if (!lists) return <EmptyState compact title="No series performance available yet." />;
  if (series) lists = await listsCovering(lists, series, fetchPage, URL_SEARCH_PAGES).catch(() => lists!);

  const merged = mergeLists(lists);
  const initial = merged.find((s) => s.id === series)?.id ?? defaultSeries(merged)?.id ?? null;

  return (
    <SeriesPerformance
      // A different URL selection is a different starting point, not an update to this one.
      key={`${format}|${series ?? ''}`}
      playerId={playerId}
      role={role}
      formatCodes={formatCodes}
      initialFormat={format}
      initialLists={lists}
      initialSeries={initial}
    />
  );
}
