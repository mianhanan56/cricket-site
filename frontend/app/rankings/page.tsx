import { getRankings } from '../../lib/rankings';
import { pickParam } from '../../lib/queryParams';
import {
  RANKINGS_CATEGORY_KEYS,
  RANKINGS_FORMAT_KEYS,
  RANKINGS_GENDER_KEYS,
  RANKINGS_GROUP_KEYS,
  type RankingsCategory,
  type RankingsFormat,
  type RankingsGender,
  type RankingsGroup,
} from '../../lib/tabs';
import RankingsView from '../../components/rankings/RankingsView';

export const metadata = {
  title: 'ICC Rankings',
  description:
    'Current ICC team and player rankings — Test, ODI and T20I, for batting, bowling and all-rounder, men and women.',
};

// Rankings move when a series ends, not when a ball is bowled, so an hour is
// generous. It matches the Worker's own edge TTL on the two ranking routes, so
// this page costs one burst of upstream calls an hour however many read it.
export const revalidate = 3600;

export default async function RankingsPage({
  searchParams,
}: {
  // Read here rather than with useSearchParams() in the view, so the requested
  // list is in the HTML instead of behind a Suspense shell.
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const group = pickParam<RankingsGroup>(searchParams?.group, RANKINGS_GROUP_KEYS, 'players');
  const gender = pickParam<RankingsGender>(searchParams?.gender, RANKINGS_GENDER_KEYS, 'men');
  const requested = pickParam<RankingsFormat>(searchParams?.format, RANKINGS_FORMAT_KEYS, 'odi');
  const category = pickParam<RankingsCategory>(
    searchParams?.category,
    RANKINGS_CATEGORY_KEYS,
    'batting'
  );
  // ?gender=women&format=test has no data behind it — fold it to ODI.
  const format: RankingsFormat = gender === 'women' && requested === 'test' ? 'odi' : requested;

  // getRankings never throws and never returns empty — see lib.
  const { data, teams, asOf } = await getRankings();

  return (
    <RankingsView
      data={data}
      teams={teams}
      asOf={asOf}
      initial={{ group, format, gender, category }}
    />
  );
}
