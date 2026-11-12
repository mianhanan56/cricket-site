import { pageMeta } from '@/lib/seo';
import { RANKINGS_DEFAULTS, rankingsMeta, rankingsPath, type RankingsQuery } from '@/lib/rankingsPages';
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

// Matches the Worker's edge TTL on the ranking routes.
export const revalidate = 3600;

type SearchParams = Record<string, string | string[] | undefined>;

function readQuery(searchParams?: SearchParams): RankingsQuery {
  const group = pickParam<RankingsGroup>(searchParams?.group, RANKINGS_GROUP_KEYS, RANKINGS_DEFAULTS.group);
  const gender = pickParam<RankingsGender>(searchParams?.gender, RANKINGS_GENDER_KEYS, RANKINGS_DEFAULTS.gender);
  const requested = pickParam<RankingsFormat>(searchParams?.format, RANKINGS_FORMAT_KEYS, RANKINGS_DEFAULTS.format);
  const category = pickParam<RankingsCategory>(
    searchParams?.category,
    RANKINGS_CATEGORY_KEYS,
    RANKINGS_DEFAULTS.category
  );
  // ?gender=women&format=test has no data behind it — fold it to ODI.
  const format: RankingsFormat = gender === 'women' && requested === 'test' ? 'odi' : requested;
  return { group, format, gender, category };
}

// Each list is its own indexable page: "ICC women's T20I bowling rankings" lands on exactly that list.
export async function generateMetadata(props: { searchParams?: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const query = readQuery(searchParams);
  return pageMeta({ ...rankingsMeta(query), path: rankingsPath(query) });
}

export default async function RankingsPage(props: {
  // Read here, not via useSearchParams(), so the list is in the HTML rather than behind Suspense.
  searchParams?: Promise<SearchParams>;
}) {
  const searchParams = await props.searchParams;
  // Never throws, never empty: falls back to the bundled snapshot.
  const { data, teams, asOf } = await getRankings();

  return <RankingsView data={data} teams={teams} asOf={asOf} initial={readQuery(searchParams)} />;
}
