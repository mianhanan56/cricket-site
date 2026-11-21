// URL filters for the static list pages, read in the browser once the page has mounted.
import { pickParam } from './queryParams';
import { MATCH_TYPE_KEYS, type MatchTypeKey } from './matchType';
import { GENDER_KEYS, type GenderKey } from './gender';
import { pickDayParam } from './fixtureDays';
import {
  FIXTURE_FORMAT_KEYS,
  HOME_TAB_KEYS,
  PLAYERS_FORMAT_KEYS,
  PLAYERS_ROLE_KEYS,
  RANKINGS_GENDER_KEYS,
  SERIES_STATUS_KEYS,
  type FixtureFormatKey,
  type HomeTab,
  type PlayersFormatKey,
  type PlayersRoleKey,
  type RankingsGender,
  type SeriesStatusKey,
} from './tabs';

const NONE = new URLSearchParams();

// `tab` has no default: with none set the tab follows the data (live > upcoming).
export const readHomeQuery = (q: URLSearchParams) => ({
  tab: pickParam<HomeTab | ''>(q.get('tab'), [...HOME_TAB_KEYS, ''], ''),
  type: pickParam<MatchTypeKey>(q.get('type'), MATCH_TYPE_KEYS, 'all'),
});
export const HOME_QUERY_DEFAULTS = readHomeQuery(NONE);

export const readFixturesQuery = (q: URLSearchParams) => ({
  gender: pickParam<GenderKey>(q.get('gender'), GENDER_KEYS, 'all'),
  format: pickParam<FixtureFormatKey>(q.get('format'), FIXTURE_FORMAT_KEYS, 'all'),
  type: pickParam<MatchTypeKey>(q.get('type'), MATCH_TYPE_KEYS, 'all'),
  // Selected day ("2026-08-20"), or '' for every day.
  date: pickDayParam(q.get('date')),
});
export const FIXTURES_QUERY_DEFAULTS = readFixturesQuery(NONE);

export const readSeriesQuery = (q: URLSearchParams) => ({
  status: pickParam<SeriesStatusKey>(q.get('status'), SERIES_STATUS_KEYS, 'all'),
  type: pickParam<MatchTypeKey>(q.get('type'), MATCH_TYPE_KEYS, 'all'),
});
export const SERIES_QUERY_DEFAULTS = readSeriesQuery(NONE);

export const readPlayersQuery = (q: URLSearchParams) => {
  const gender = pickParam<RankingsGender>(q.get('gender'), RANKINGS_GENDER_KEYS, 'men');
  const requested = pickParam<PlayersFormatKey>(q.get('format'), PLAYERS_FORMAT_KEYS, 'all');
  return {
    gender,
    role: pickParam<PlayersRoleKey>(q.get('role'), PLAYERS_ROLE_KEYS, 'all'),
    // The ICC publishes no Women's Test rankings.
    format: gender === 'women' && requested === 'test' ? ('all' as const) : requested,
  };
};
