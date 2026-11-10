import { pageMeta } from '@/lib/seo';
import { Suspense } from 'react';
import SearchClient from '@/components/search/SearchClient';
import SearchSkeleton from '@/components/search/SearchSkeleton';

export const metadata = pageMeta({
  title: 'Search',
  description: 'Search across players, teams, series, venues and matches on PulseCrease.',
  path: '/search',
  noindex: true,
});

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchSkeleton />}>
      <SearchClient />
    </Suspense>
  );
}
