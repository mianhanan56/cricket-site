import type { BatsmanLine, BowlerLine, InningsScore, Match } from '@/types';

export interface Crease {
  battingTeam: string;
  fieldingTeam: string;
  /** The unbeaten batters, striker first when the feed says who that is. */
  batsmen: Array<{ line: BatsmanLine; onStrike: boolean }>;
  /** The bowler mid-spell — null when the feed doesn't name one we can match. */
  bowler: BowlerLine | null;
}

export function dismissalOf(b: BatsmanLine): string {
  if (b.dismissal) return b.dismissal;
  return b.out ? 'out' : 'not out';
}

// A retired batsman is also not out, but has left the middle.
export function atCrease(b: BatsmanLine): boolean {
  return !b.out && dismissalOf(b) === 'not out';
}

const normalizeName = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, ' ').trim();

/**
 * The card carries "Rashid Khan", the commentary usually a surname alone — so a
 * match is every commentary word appearing in the card name. A miss leaves the
 * striker unmarked rather than marking the wrong one.
 */
export function nameMatches(cardName: string, feedName: string): boolean {
  const card = normalizeName(cardName).split(/\s+/);
  const feed = normalizeName(feedName).split(/\s+/).filter(Boolean);
  if (!feed.length || !card.length) return false;
  return feed.every((t) => card.includes(t));
}

/** Bowler and striker off a delivery's "Bumrah to Root" headline. */
export function namesFromBall(text: string): { bowler: string; striker: string } | null {
  const head = text.split('—')[0].trim().replace(/[,.]$/, '');
  if (head.split(/\s+/).length > 8) return null;
  const m = /^(.+?)\s+to\s+(.+)$/.exec(head);
  return m ? { bowler: m[1], striker: m[2] } : null;
}

/**
 * Who is out in the middle, read off a card in innings order (the scorecard
 * endpoint's), whose last batted innings is the one in progress.
 */
export function creaseFromCard(
  match: Match,
  innings: InningsScore[],
  lastBallText: string | null
): Crease | null {
  if (match.status !== 'LIVE') return null;
  const batted = innings.filter((i) => !i.notStarted);
  const current = batted[batted.length - 1];
  if (!current) return null;

  const unbeaten = (current.batting ?? []).filter(atCrease);
  if (!unbeaten.length) return null;

  const names = lastBallText ? namesFromBall(lastBallText) : null;
  const striker = names ? unbeaten.find((b) => nameMatches(b.name, names.striker)) : undefined;
  const ordered = striker ? [striker, ...unbeaten.filter((b) => b !== striker)] : unbeaten;

  return {
    battingTeam: current.teamShortName,
    fieldingTeam:
      [match.homeTeam.shortName, match.awayTeam.shortName].find(
        (s) => s.toLowerCase() !== current.teamShortName.toLowerCase()
      ) ?? '',
    batsmen: ordered.slice(0, 2).map((line) => ({ line, onStrike: line === striker })),
    bowler: names
      ? (current.bowling ?? []).find((b) => nameMatches(b.name, names.bowler)) ?? null
      : null,
  };
}
