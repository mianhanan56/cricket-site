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
import { SectionHead } from '../ui/Section';
import SeriesPerformance, { SeriesPerformanceSkeleton } from './SeriesPerformance';

/** Older pages read on the server to reach a series named in the URL. */
const URL_SEARCH_PAGES = 8;

export default async function PlayerSeriesSection({
  playerId,
  role,
  formatCodes,
  format,
  series,
  className,
}: {
  playerId: string;
  role: PlayerRoleLabel;
  formatCodes: number[];
  format: SeriesFormatKey;
  series: string | null;
  className?: string;
}) {
  const fetchPage: PageFetcher = (discipline, page) =>
    getCrexPlayerSeriesPage(playerId, { format: seriesFormatCode(format), discipline, page }, { revalidate: 3600 });

  let lists = await firstLists(fetchPage).catch(() => null);
  if (!lists) return null;
  if (series) lists = await listsCovering(lists, series, fetchPage, URL_SEARCH_PAGES).catch(() => lists!);

  const merged = mergeLists(lists);
  const initial = merged.find((s) => s.id === series)?.id ?? defaultSeries(merged)?.id ?? null;

  return (
    <section className={className} aria-labelledby="series-performance">
      <SectionHead title="Series performance" id="series-performance" />
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
    </section>
  );
}

export function PlayerSeriesSkeleton({ className }: { className?: string }) {
  return (
    <section className={className} aria-busy="true" aria-label="Loading series performance">
      <SectionHead title="Series performance" />
      <SeriesPerformanceSkeleton />
    </section>
  );
}
