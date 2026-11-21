import type { InningsScore, MatchEvent, MatchFormat } from '@/types';

export const lastBattedIndex = (innings: InningsScore[]): number => innings.map((i) => !i.notStarted).lastIndexOf(true);

// The card lists the side still to bat as an empty innings, so "in progress" is the last one batted.
export function inningsInProgress(innings: InningsScore[], selected: number, underway: boolean): boolean {
  return underway && selected >= 0 && selected === lastBattedIndex(innings);
}

// A tied limited-overs match's super overs arrive as innings three onward; they are not the match score.
export function regulationInnings<T>(innings: T[], format: MatchFormat): T[] {
  return format === 'TEST' || innings.length <= 2 ? innings : innings.slice(0, 2);
}

export const hasSuperOvers = (innings: InningsScore[], format: MatchFormat): boolean =>
  format !== 'TEST' && innings.filter((i) => !i.notStarted).length > 2;

// An event the feed didn't tag can't be placed, so it only rides along while every innings is drawn.
export function momentsFor(moments: MatchEvent[], shown: number[], everyInnings: boolean): MatchEvent[] {
  const on = new Set(shown);
  return moments.filter((m) => (m.inning == null ? everyInnings : on.has(m.inning)));
}
