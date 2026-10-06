import type { FallOfWicket, InningsScore, MatchEvent, WicketRef } from '@/types';

const fowText = (inn: InningsScore, w: FallOfWicket) =>
  `${w.name} out for ${w.playerRuns} (${w.playerBalls}) · ${inn.teamShortName} ${w.runs}/${w.wicket}`;

/** The card's entry for a wicket: batter in that innings, else that wicket number, else the batter's latest. */
function findFow(innings: InningsScore[], ref: WicketRef): { index: number; inn: InningsScore; w: FallOfWicket } | null {
  const byBatter = (w: FallOfWicket) => (ref.playerId ? w.playerId === ref.playerId : w.name === ref.name);
  if (ref.inning !== null && innings[ref.inning]) {
    const inn = innings[ref.inning];
    const w =
      inn.fallOfWickets?.find(byBatter) ??
      (ref.number !== null ? inn.fallOfWickets?.find((f) => f.wicket === ref.number && f.name === ref.name) : undefined);
    if (w) return { index: ref.inning, inn, w };
  }
  for (let index = innings.length - 1; index >= 0; index--) {
    const w = innings[index].fallOfWickets?.find(byBatter);
    if (w) return { index, inn: innings[index], w };
  }
  return null;
}

/**
 * The feed's events plus every wicket the scorecard knows about.
 *
 * The feed poll only carries crex's newest commentary page (about ten rows), so
 * a wicket from a few overs back has already scrolled out of it. The scorecard's
 * fall of wickets covers the whole match and is already loaded, so those fill
 * the gap — newest first, after the feed's own (always newer) events. A feed
 * wicket is matched to its card entry by batter id, never by reading the prose,
 * which names fielders and bowlers too.
 */
export function keyMoments(events: MatchEvent[], innings: InningsScore[]): MatchEvent[] {
  const covered = new Set<string>();
  // A wicket row without the card's fields: only its full sentence can say whom it reports.
  const prose: string[] = [];

  const feed = events.map((e) => {
    if (e.kind !== 'WICKET') return e;
    const hit = e.wicket ? findFow(innings, e.wicket) : null;
    if (hit) {
      covered.add(`${hit.index}:${hit.w.wicket}`);
      return { ...e, text: fowText(hit.inn, hit.w) };
    }
    if (!e.wicket) prose.push((e.text ?? '').toLowerCase());
    return e;
  });

  const older: MatchEvent[] = [];
  innings.forEach((inn, i) => {
    for (const w of inn.fallOfWickets ?? []) {
      if (!w.name || covered.has(`${i}:${w.wicket}`) || prose.some((t) => t.includes(w.name.toLowerCase()))) continue;
      older.push({
        id: `fow:${i}:${w.wicket}`,
        kind: 'WICKET',
        label: 'Wicket',
        text: fowText(inn, w),
        over: Math.max(1, Math.ceil(w.overs)),
      });
    }
  });
  older.reverse();

  // The toss can only be older than any wicket.
  const toss = feed.filter((e) => e.kind === 'TOSS');
  return [...feed.filter((e) => e.kind !== 'TOSS'), ...older, ...toss];
}
