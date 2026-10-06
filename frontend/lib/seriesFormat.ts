import type { MatchFormat } from '@/types';

export const MATCH_FORMAT_LABEL: Record<MatchFormat, string> = { TEST: 'Test', ODI: 'ODI', T20: 'T20', T10: 'T10' };

type WithFormats = { format: MatchFormat; formats?: MatchFormat[] };

const listOf = (s: WithFormats): string[] => (s.formats?.length ? s.formats : [s.format]).map((f) => MATCH_FORMAT_LABEL[f]);

/** "ODI and Test" — every format the series plays, so a two-format tour never reads as one. */
export function seriesFormatPhrase(s: WithFormats): string {
  const names = listOf(s);
  return names.length < 2 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "ODI + Test" — the same, short enough for a chip. */
export const seriesFormatChip = (s: WithFormats): string => listOf(s).join(' + ');
