import RankingsSkeleton from '../../components/rankings/RankingsSkeleton';

// Without this the /rankings route falls back to the root loading.tsx — i.e. the
// home page's skeleton — while its 18 ranking slices are fetched.
export default function Loading() {
  return <RankingsSkeleton />;
}
