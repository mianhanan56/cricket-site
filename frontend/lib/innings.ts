// Reading a scorecard's innings list: whose an innings is, which one is being
// played, and how to write a side's total out in one line.
//
// This lives apart from lib/crex because it is not decoding: every source hands
// us `InningsScore[]` already, and both the match card and the detail header
// need the same three answers from it. They each had their own copy of the
// team-matching rule, which is how the card came to show a Test side's *first*
// innings score three days into the match.

import type { InningsScore, Match, Team } from '@/types';

/**
 * The innings a side has batted, in card order (first innings, then second).
 *
 * `teamId` is preferred and is what the crex feed sets. The label match is the
 * fallback for a card that only names the batting side in text — and it is a
 * strict match, never positional: handing a side the wrong innings is worse than
 * showing none, because a wrong score reads as fact.
 */
export function inningsFor(match: Match, team: Team): InningsScore[] {
  const innings = match.scorecard?.innings ?? [];
  if (!innings.length) return [];

  const name = team.name.toLowerCase();
  const short = team.shortName.toLowerCase();

  return innings.filter((i) => {
    if (i.teamId) return i.teamId === team.id;
    const label = (i.inning ?? i.teamShortName ?? '').toLowerCase();
    return !!label && (label.includes(name) || label.includes(short));
  });
}

/** The innings a side has actually batted — an XI listed before play is not one. */
export function battedInnings(list: InningsScore[]): InningsScore[] {
  return list.filter((i) => !i.notStarted);
}

/**
 * One innings as a scorer would write it: "350" all out, "350/6" otherwise, and
 * "350/6 d" on a declaration.
 *
 * The wickets are dropped once ten are down because at that point they say
 * nothing — every all-out innings ends on ten — and the shorter form is what
 * makes a Test line ("350 & 210") readable at a glance.
 */
export function formatInnings(inn: InningsScore): string {
  const allOut = inn.wickets >= 10;
  const runs = allOut ? String(inn.runs) : `${inn.runs}/${inn.wickets}`;
  return inn.declared ? `${runs} d` : runs;
}

/**
 * Closed: ten down or declared. Nothing else closes an innings on its own — a
 * side 8 down at the end of its overs is closed by the format, not by the card,
 * which is why this is only asked where a side bats twice.
 */
export function isClosed(inn: InningsScore): boolean {
  return inn.wickets >= 10 || Boolean(inn.declared);
}

/**
 * A side's whole match as one score line: "350", "350 & 120/3", "350 & 210".
 *
 * `multiInnings` (a Test) is what licenses the abbreviation on the latest innings
 * too. On a single-innings format the latest innings always keeps its wickets,
 * because "168/7" is the score there and always has been.
 *
 * One function for both the match card and the detail header, so the two cannot
 * write the same match differently.
 */
export function formatTeamScore(list: InningsScore[], multiInnings = false): string {
  const batted = battedInnings(list);
  if (!batted.length) return '';

  return batted
    .map((inn, i) => {
      const last = i === batted.length - 1;
      if (!last || (multiInnings && isClosed(inn))) return formatInnings(inn);
      return `${inn.runs}/${inn.wickets}`;
    })
    .join(' & ');
}
