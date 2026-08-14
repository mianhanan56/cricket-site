import { getRankings } from '../../lib/rankings';
import { pickParam } from '../../lib/queryParams';
import {
  RANKINGS_CATEGORY_KEYS,
  RANKINGS_FORMAT_KEYS,
  RANKINGS_GENDER_KEYS,
  type RankingsCategory,
  type RankingsFormat,
  type RankingsGender,
} from '../../lib/tabs';
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

export default async function RankingsPage({
  searchParams,
}: {
  // Read here rather than with useSearchParams() in the view, so the requested
  // list is in the HTML instead of behind a Suspense shell.
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const gender = pickParam<RankingsGender>(searchParams?.gender, RANKINGS_GENDER_KEYS, 'men');
  const requested = pickParam<RankingsFormat>(searchParams?.format, RANKINGS_FORMAT_KEYS, 'odi');
  const category = pickParam<RankingsCategory>(
    searchParams?.category,
    RANKINGS_CATEGORY_KEYS,
    'batting'
  );
  // ?gender=women&format=test has no data behind it — fold it to ODI.
  const format: RankingsFormat = gender === 'women' && requested === 'test' ? 'odi' : requested;

  // One request for every format/gender/category, where this used to fan out to
  // eighteen. getRankings never throws and never returns empty — see lib.
  const { data, asOf } = await getRankings();

  return <RankingsView data={data} asOf={asOf} initial={{ format, gender, category }} />;
}
