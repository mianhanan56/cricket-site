import type { MatchFormat } from '@/types';

const NAME: Record<MatchFormat, string> = { TEST: 'Test', ODI: 'ODI', T20: 'T20' };

type WithFormats = { format: MatchFormat; formats?: MatchFormat[] };

const listOf = (s: WithFormats): string[] => (s.formats?.length ? s.formats : [s.format]).map((f) => NAME[f]);

/** "ODI and Test" — every format the series plays, so a two-format tour never reads as one. */
export function seriesFormatPhrase(s: WithFormats): string {
  const names = listOf(s);
  return names.length < 2 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "ODI + Test" — the same, short enough for a chip. */
export const seriesFormatChip = (s: WithFormats): string => listOf(s).join(' + ');
