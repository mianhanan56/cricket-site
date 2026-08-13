import { getRankings } from '../../lib/rankings';
import RankingsView from '../../components/rankings/RankingsView';

export const metadata = {
  title: 'ICC Rankings',
  description:
    'Current ICC player rankings — Test, ODI and T20I, for batting, bowling and all-rounder, men and women.',
};

// Rankings move when a series ends, not when a ball is bowled, so an hour is
// generous. It is also the cap on how long a KV edit takes to appear here —
// which is the whole point of holding the data in KV: no deploy in that loop.
export const revalidate = 3600;

export default async function RankingsPage() {
  // One request for every format/gender/category, where this used to fan out to
  // eighteen. getRankings never throws and never returns empty — see lib.
  const { data, asOf } = await getRankings();

  return <RankingsView data={data} asOf={asOf} />;
}
