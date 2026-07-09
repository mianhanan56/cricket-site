import { Suspense } from 'react';
import SearchClient from '../../components/search/SearchClient';
import Spinner from '../../components/ui/Spinner';

export const metadata = {
  title: 'Search',
  description: 'Search across players, teams, series and news on PulseCrease.',
};

export default function SearchPage() {
  return (
    <Suspense fallback={<Spinner label="Loading search…" />}>
      <SearchClient />
    </Suspense>
  );
}
