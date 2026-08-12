import { Suspense } from 'react';
import SearchClient from '../../components/search/SearchClient';
import SearchSkeleton from '../../components/search/SearchSkeleton';

export const metadata = {
  title: 'Search',
  description: 'Search across players, teams and series on PulseCrease.',
};

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchSkeleton />}>
      <SearchClient />
    </Suspense>
  );
}
