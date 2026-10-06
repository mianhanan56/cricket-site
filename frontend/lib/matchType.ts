// International vs domestic classification.
//
// The crex feed carries no flag for this — a match is just two team keys and a
// series name. So it is derived: a match is INTERNATIONAL when BOTH sides
// resolve to a national team, and DOMESTIC otherwise (franchise leagues, state
// and provincial sides, club cricket).
//
// The test is an exact match against the nation list below, after stripping the
// suffixes national sides get ("India Women", "Australia A", "Pakistan U19").
// Exactness is what makes it work: "Pakistan Blues" and "Northern Districts"
// never collide with "Pakistan", so National Champions Cup and the Plunket
// Shield stay domestic. A name we don't recognise falls to DOMESTIC, which is
// the safer default — a mislabelled franchise side is a smaller lie than a
// mislabelled international.

import type { Match } from '@/types';

export type MatchType = 'ALL' | 'INTERNATIONAL' | 'DOMESTIC';

/** The same three values as they appear in a URL (?type=international). */
export type MatchTypeKey = 'all' | 'international' | 'domestic';
export const MATCH_TYPE_KEYS: readonly MatchTypeKey[] = ['all', 'international', 'domestic'];

/** ICC members that field a senior national team crex is likely to list. */
const NATIONS = new Set(
  [
    // Full members
    'afghanistan', 'australia', 'bangladesh', 'england', 'india', 'ireland',
    'new zealand', 'pakistan', 'south africa', 'sri lanka', 'west indies',
    'zimbabwe',
    // Associates that appear regularly in ICC pathway events
    'netherlands', 'scotland', 'nepal', 'oman', 'namibia', 'canada',
    'united arab emirates', 'uae', 'united states', 'united states of america',
    'usa', 'papua new guinea', 'png', 'jersey', 'guernsey', 'italy', 'germany',
    'denmark', 'norway', 'sweden', 'finland', 'austria', 'switzerland',
    'belgium', 'france', 'spain', 'portugal', 'gibraltar', 'malta', 'greece',
    'cyprus', 'turkey', 'israel', 'romania', 'bulgaria', 'hungary', 'croatia',
    'slovenia', 'serbia', 'czech republic', 'czechia', 'estonia', 'isle of man',
    'luxembourg', 'poland',
    // Africa
    'kenya', 'uganda', 'tanzania', 'nigeria', 'ghana', 'botswana', 'malawi',
    'rwanda', 'zambia', 'sierra leone', 'cameroon', 'mozambique', 'eswatini',
    'seychelles', 'st helena', 'saint helena', 'gambia', 'lesotho',
    // Asia & Middle East
    'hong kong', 'singapore', 'malaysia', 'thailand', 'japan', 'china',
    'indonesia', 'philippines', 'south korea', 'korea', 'bhutan', 'maldives',
    'myanmar', 'cambodia', 'mongolia', 'qatar', 'saudi arabia', 'kuwait',
    'bahrain', 'iran', 'kazakhstan', 'uzbekistan', 'tajikistan', 'kyrgyzstan',
    // Americas & East Asia-Pacific
    'bermuda', 'bahamas', 'belize', 'cayman islands', 'panama', 'argentina',
    'brazil', 'chile', 'peru', 'mexico', 'costa rica', 'fiji', 'vanuatu',
    'samoa', 'cook islands', 'tonga',
  ]
);

/** Suffixes a national side can carry without ceasing to be a national side. */
const NATIONAL_SUFFIXES = [
  'women', 'w', 'men', 'm', 'a', 'b', 'xi', 'u19',
  'u19w', 'wu19', 'u23', 'emerging', 'legends', 'development',
];

/** "India Women" -> "india"; "Pakistan U19 Women" -> "pakistan"; "Pakistan Blues" -> "pakistan blues". */
function baseName(name: string, suffixes: readonly string[] = NATIONAL_SUFFIXES): string {
  const parts = name
    .toLowerCase()
    .replace(/[.’']/g, '')
    // crex short names and some names use a dash for the qualifier ("SRL-W", "IND-A", "U19-Women").
    .replace(/-/g, ' ')
    .replace(/\bunder 19\b/g, 'u19')
    .replace(/\bunder 23\b/g, 'u23')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ');

  // Qualifiers stack ("U19 Women"); a nation's own words ("south africa") are never in the list.
  while (parts.length > 1 && suffixes.includes(parts[parts.length - 1])) parts.pop();
  return parts.join(' ');
}

/** Sides that play Test cricket: the twelve full members, men's or women's senior XI. */
const TEST_NATIONS = new Set([
  'afghanistan', 'australia', 'bangladesh', 'england', 'india', 'ireland',
  'new zealand', 'pakistan', 'south africa', 'sri lanka', 'west indies', 'zimbabwe',
]);

type Side = Pick<Match['homeTeam'], 'name' | 'shortName'>;

const isTestSide = (team: Side) =>
  [team.name, team.shortName].some((n) => Boolean(n) && TEST_NATIONS.has(baseName(n, ['women', 'w'])));

/**
 * crex files every multi-day match as a Test. Only one between two senior full-member sides
 * is; the rest (Irani Cup, President's Trophy, A-team and youth "Tests") are not.
 */
export function isUnofficialTest(match: { format: Match['format']; homeTeam: Side; awayTeam: Side }): boolean {
  return match.format === 'TEST' && !(isTestSide(match.homeTeam) && isTestSide(match.awayTeam));
}

const isNationalTeam = (name: string | undefined) =>
  Boolean(name) && NATIONS.has(baseName(name as string));

/**
 * True when both sides are national teams. Checks the full name first and the
 * short name second — crex resolves most teams to a full name, but degrades to
 * the raw key when its mapping call misses.
 */
export function isInternationalMatch(match: Match): boolean {
  const sideIsNational = (team: Match['homeTeam']) =>
    isNationalTeam(team.name) || isNationalTeam(team.shortName);

  return sideIsNational(match.homeTeam) && sideIsNational(match.awayTeam);
}

/** Narrow a match list to one type. 'ALL' passes the list straight through. */
export function filterByMatchType<T extends Match>(matches: T[], type: MatchType): T[] {
  if (type === 'ALL') return matches;
  const wantInternational = type === 'INTERNATIONAL';
  return matches.filter((m) => isInternationalMatch(m) === wantInternational);
}

export const MATCH_TYPE_OPTIONS: { value: MatchType; label: string }[] = [
  { value: 'ALL', label: 'All cricket' },
  { value: 'INTERNATIONAL', label: 'International' },
  { value: 'DOMESTIC', label: 'Domestic' },
];

/** The same options keyed by their URL value, for filters that work in URL terms. */
export const MATCH_TYPE_KEY_OPTIONS: { value: MatchTypeKey; label: string }[] = [
  { value: 'all', label: 'All cricket' },
  { value: 'international', label: 'International' },
  { value: 'domestic', label: 'Domestic' },
];

/** URL value -> MatchType. Anything unrecognised reads as the unfiltered view. */
export function parseMatchType(raw: string | null | undefined): MatchType {
  const v = (raw ?? '').toUpperCase();
  return v === 'INTERNATIONAL' || v === 'DOMESTIC' ? v : 'ALL';
}

/** MatchType -> URL value. */
export const matchTypeKey = (type: MatchType): MatchTypeKey =>
  type.toLowerCase() as MatchTypeKey;
