import type { HeadToHeadMatch, MatchFormat } from '@/types';
import { isUnofficialTest } from './matchType';

export const MATCH_FORMAT_LABEL: Record<MatchFormat, string> = { TEST: 'Test', ODI: 'ODI', T20: 'T20', T10: 'T10' };

/** The format chip: a match's code ("T20", "TEST"), or "Multi-day" for a multi-day match that is no Test. */
export const matchFormat = (m: Parameters<typeof isUnofficialTest>[0]): string =>
  isUnofficialTest(m) ? 'Multi-day' : m.format;

/** The same for a schedule-derived meeting, which names its sides in `sides`. */
export const meetingFormat = (m: Pick<HeadToHeadMatch, 'format' | 'sides'>): string =>
  m.sides ? matchFormat({ format: m.format, homeTeam: m.sides[0], awayTeam: m.sides[1] }) : m.format;

type WithFormats = { format: MatchFormat; formats?: MatchFormat[]; unofficialTests?: boolean };

const listOf = (s: WithFormats): string[] =>
  (s.formats?.length ? s.formats : [s.format]).map((f) => (f === 'TEST' && s.unofficialTests ? 'Multi-day' : MATCH_FORMAT_LABEL[f]));

/** "ODI and Test" — every format the series plays, so a two-format tour never reads as one. */
export function seriesFormatPhrase(s: WithFormats): string {
  const names = listOf(s);
  return names.length < 2 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "ODI + Test" — the same, short enough for a chip. */
export const seriesFormatChip = (s: WithFormats): string => listOf(s).join(' + ');
