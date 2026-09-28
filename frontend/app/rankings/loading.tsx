import RankingsSkeleton from '../../components/rankings/RankingsSkeleton';

// Otherwise the route falls back to the root (home) skeleton.
export default function Loading() {
  return <RankingsSkeleton />;
}
