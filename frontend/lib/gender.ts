import type { Match } from '@/types';

/** Men's or women's cricket, as it appears in a URL (?gender=women). */
export type GenderKey = 'all' | 'men' | 'women';
export const GENDER_KEYS: readonly GenderKey[] = ['all', 'men', 'women'];

export const GENDER_OPTIONS: ReadonlyArray<{ value: GenderKey; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'men', label: 'Men' },
  { value: 'women', label: 'Women' },
];

// The feed has no gender flag. Women's cricket is named so: in the series ("Womens Big Bash
// League") or the sides ("Karnataka Women"). The series covers fixtures whose sides are still TBC;
// the short name's W suffix ("SV-W", "KAR W") covers sides like Southern Vipers.
const WOMEN = /\bwom[ae]n'?s?\b/i;
const SHORT_W = /[\s-]W$/;

type Named = Pick<Match, 'series'> & { homeTeam: Pick<Match['homeTeam'], 'name' | 'shortName'>; awayTeam: Pick<Match['awayTeam'], 'name' | 'shortName'> };

const womensSide = (t: Named['homeTeam']) => WOMEN.test(t.name) || SHORT_W.test(t.shortName ?? '');

export const isWomens = (m: Named): boolean => WOMEN.test(m.series.name) || womensSide(m.homeTeam) || womensSide(m.awayTeam);

export function filterByGender<T extends Named>(list: T[], gender: GenderKey): T[] {
  return gender === 'all' ? list : list.filter((m) => isWomens(m) === (gender === 'women'));
}
