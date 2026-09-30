import type { InningsScore, MatchEvent } from '@/types';

/**
 * The feed's events plus every wicket the scorecard knows about.
 *
 * The feed poll only carries crex's newest commentary page (about ten rows), so
 * a wicket from a few overs back has already scrolled out of it. The scorecard's
 * fall of wickets covers the whole match and is already loaded, so those fill
 * the gap — newest first, after the feed's own (always newer) events.
 */
export function keyMoments(events: MatchEvent[], innings: InningsScore[]): MatchEvent[] {
  const feedWickets = events.filter((e) => e.kind === 'WICKET').map((e) => (e.text ?? '').toLowerCase());
  const reported = (name: string) => {
    const full = name.toLowerCase();
    const surname = full.split(/\s+/).pop() ?? full;
    return feedWickets.some((t) => t.includes(full) || (surname.length > 2 && t.includes(surname)));
  };

  const older: MatchEvent[] = [];
  innings.forEach((inn, i) => {
    for (const w of inn.fallOfWickets ?? []) {
      if (!w.name || reported(w.name)) continue;
      older.push({
        id: `fow:${i}:${w.wicket}`,
        kind: 'WICKET',
        label: 'Wicket',
        text: `${w.name} out for ${w.playerRuns} (${w.playerBalls}) · ${inn.teamShortName} ${w.runs}/${w.wicket}`,
        over: Math.max(1, Math.ceil(w.overs)),
      });
    }
  });
  older.reverse();

  // The toss can only be older than any wicket.
  const toss = events.filter((e) => e.kind === 'TOSS');
  return [...events.filter((e) => e.kind !== 'TOSS'), ...older, ...toss];
}
