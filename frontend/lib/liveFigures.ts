// A player's figures re-read off match scorecards. The upstream's player records are cached for an
// hour and can hold an innings as it stood mid-match; the scorecard is the match as it stands now.
import type { InningsScore, PlayerFormEntry, PlayerSeriesInnings } from '@/types';
import type { SeriesLists } from './playerSeries';
import { ballsFrom } from './overs';

type Discipline = 'batting' | 'bowling';
export type Cards = ReadonlyMap<string, InningsScore[] | null>;

/** How far back an innings may still be a match in progress (a Test runs five days). */
export const LIVE_WINDOW_MS = 6 * 24 * 60 * 60 * 1000;

export const isRecent = (date: string | null, now: number = Date.now()): boolean =>
  Boolean(date) && now - +new Date(date as string) < LIVE_WINDOW_MS;

/** The player's lines in a card, in innings order. */
function linesOf(card: InningsScore[], playerId: string, d: Discipline) {
  return d === 'batting'
    ? card.flatMap((inn) => inn.batting?.filter((l) => l.playerId === playerId) ?? [])
    : card.flatMap((inn) => inn.bowling?.filter((l) => l.playerId === playerId) ?? []);
}

function fromCard(inn: PlayerSeriesInnings, card: InningsScore[], playerId: string, d: Discipline): PlayerSeriesInnings {
  const line = linesOf(card, playerId, d)[inn.inningsOfMatch - 1];
  if (!line) return inn;
  if ('balls' in line) return { ...inn, runs: line.runs, balls: line.balls, notOut: !line.out };
  return { ...inn, runs: line.runs, wickets: line.wickets, balls: ballsFrom(line.overs) };
}

/** Match ids in a player's series lists recent enough to still be in progress. */
export function recentSeriesMatches(lists: SeriesLists, now: number = Date.now()): string[] {
  const ids = new Set<string>();
  for (const d of ['batting', 'bowling'] as const)
    for (const s of lists[d].series)
      for (const f of s.formats) for (const i of f.innings) if (i.matchId && isRecent(i.date, now)) ids.add(i.matchId);
  return [...ids];
}

/** Series lists with every innings a card covers taken from the card. */
export function withCardFigures(lists: SeriesLists, playerId: string, cards: Cards): SeriesLists {
  if (!cards.size) return lists;
  const refresh = (d: Discipline) => ({
    ...lists[d],
    series: lists[d].series.map((s) => ({
      ...s,
      formats: s.formats.map((f) => ({
        ...f,
        innings: f.innings.map((i) => {
          const card = i.matchId ? cards.get(i.matchId) : null;
          return card ? fromCard(i, card, playerId, d) : i;
        }),
      })),
    })),
  });
  return { batting: refresh('batting'), bowling: refresh('bowling') };
}

/** Recent-form entries with their figures re-read off the cards. */
export function withCardForm(entries: PlayerFormEntry[], d: Discipline, playerId: string, cards: Cards): PlayerFormEntry[] {
  if (!cards.size) return entries;
  // Entries are newest first, so a Test's two innings map onto the card's last innings first.
  const used = new Map<string, number>();
  return entries.map((entry) => {
    const card = entry.matchId ? cards.get(entry.matchId) : null;
    if (!card) return entry;
    const lines = linesOf(card, playerId, d);
    const n = used.get(entry.matchId as string) ?? 0;
    used.set(entry.matchId as string, n + 1);
    const line = lines[lines.length - 1 - n];
    if (!line) return entry;
    if ('balls' in line) return { ...entry, figures: `${line.runs} (${line.balls})`, notOut: !line.out };
    return { ...entry, figures: `${line.wickets}-${line.runs}` };
  });
}
