import {
  RANKINGS_CATEGORY_KEYS,
  RANKINGS_FORMAT_KEYS,
  RANKINGS_GENDER_KEYS,
  type RankingsCategory,
  type RankingsFormat,
  type RankingsGender,
  type RankingsGroup,
} from './tabs';

export interface RankingsQuery {
  group: RankingsGroup;
  format: RankingsFormat;
  gender: RankingsGender;
  category: RankingsCategory;
}

export const RANKINGS_DEFAULTS: RankingsQuery = { group: 'players', format: 'odi', gender: 'men', category: 'batting' };

const FORMAT_LABEL: Record<RankingsFormat, string> = { test: 'Test', odi: 'ODI', t20i: 'T20I' };
const CATEGORY_LABEL: Record<RankingsCategory, string> = {
  batting: 'Batting',
  bowling: 'Bowling',
  'all-rounder': 'All-rounder',
};
const CATEGORY_NOUN: Record<RankingsCategory, string> = {
  batting: 'batters',
  bowling: 'bowlers',
  'all-rounder': 'all-rounders',
};

/** One canonical URL per list: defaults dropped, and no `category` on team lists (it doesn't apply). */
export function rankingsPath(q: RankingsQuery): string {
  const params = new URLSearchParams();
  if (q.group !== RANKINGS_DEFAULTS.group) params.set('group', q.group);
  if (q.format !== RANKINGS_DEFAULTS.format) params.set('format', q.format);
  if (q.gender !== RANKINGS_DEFAULTS.gender) params.set('gender', q.gender);
  if (q.group === 'players' && q.category !== RANKINGS_DEFAULTS.category) params.set('category', q.category);
  const query = params.toString();
  return query ? `/rankings?${query}` : '/rankings';
}

export function rankingsMeta(q: RankingsQuery): { title: string; description: string } {
  const who = q.gender === 'women' ? "Women's" : "Men's";
  const format = FORMAT_LABEL[q.format];
  if (q.group === 'teams') {
    return {
      title: `ICC ${who} ${format} Team Rankings`,
      description: `The latest ICC ${who.toLowerCase()} ${format} team rankings — every ranked side's position, rating and points.`,
    };
  }
  return {
    title: `ICC ${who} ${format} ${CATEGORY_LABEL[q.category]} Rankings`,
    description: `The latest ICC ${who.toLowerCase()} ${format} rankings for ${CATEGORY_NOUN[q.category]} — position, rating and country for every ranked player.`,
  };
}

/** Every list the ICC publishes: no women's Test rankings exist. */
export function allRankingsQueries(): RankingsQuery[] {
  const out: RankingsQuery[] = [];
  for (const gender of RANKINGS_GENDER_KEYS) {
    for (const format of RANKINGS_FORMAT_KEYS) {
      if (gender === 'women' && format === 'test') continue;
      out.push({ group: 'teams', format, gender, category: RANKINGS_DEFAULTS.category });
      for (const category of RANKINGS_CATEGORY_KEYS) out.push({ group: 'players', format, gender, category });
    }
  }
  return out;
}
