import SearchSkeleton from '@/components/search/SearchSkeleton';

// Client-side navigation needs a segment fallback, or /search briefly wears the home skeleton.
export default function Loading() {
  return <SearchSkeleton />;
}
