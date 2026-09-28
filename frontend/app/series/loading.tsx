'use client';

import { usePathname } from 'next/navigation';
import { SeriesDetailSkeleton, SeriesListSkeleton } from '../../components/series/SeriesSkeleton';

// This boundary also covers /series/[id], which has no loading file of its own.
export default function Loading() {
  const pathname = usePathname();
  return pathname && pathname !== '/series' ? <SeriesDetailSkeleton /> : <SeriesListSkeleton />;
}
