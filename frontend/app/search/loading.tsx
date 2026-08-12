import SearchSkeleton from '../../components/search/SearchSkeleton';

// The page itself is synchronous, but a client-side navigation still needs a
// segment-level fallback — otherwise /search briefly wears the home skeleton.
export default function Loading() {
  return <SearchSkeleton />;
}
