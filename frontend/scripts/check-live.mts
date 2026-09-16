// Audit every match in the live crex feed against the invariants a scorecard
// has to satisfy.  Run with `npm run check:live`.
//
// The unit suite in tests/ pins the rules against fixtures, which is what stops
// a refactor breaking them. This is the other half: fixtures only cover the
// shapes we thought to capture, and crex serves shapes nobody thought of — a day
// called off mid-over, a batter who retired hurt and came back, a live match with
// no published XI. This walks whatever is on today and complains about anything
// that cannot be true.
//
// It talks to the network, so it is deliberately not part of `npm test`. Run it
// when the state logic or a decoder changes, and when a match looks wrong on the
// site: it prints one line per match, so the odd one is usually obvious.

import {
  getCrexMatchList,
  getCrexScorecard,
  getCrexMatchInfo,
  getCrexMatchFeed,
  isStaleStoppage,
} from '../lib/crex';
import { creaseContext, matchSituation } from '../lib/situation';

let problems = 0;
const flag = (message: string): void => {
  problems++;
  console.log(`  ⚠ ${message}`);
};

const matches = await getCrexMatchList();
console.log(`${matches.length} matches in the feed\n`);

for (const match of matches) {
  const tag = `${match.id} ${match.homeTeam.shortName}v${match.awayTeam.shortName} ${match.format} ${match.status}`;

  try {
    const innings = await getCrexScorecard(match.id, {
      status: match.status,
      ballsPerOver: match.ballsPerOver,
    });

    for (const inn of innings) {
      const fow = inn.fallOfWickets ?? [];
      const stands = inn.partnerships ?? [];
      const label = `${inn.teamShortName} inn${inn.inningsNumber ?? 1}`;

      // The ledger is one entry per wicket, in order, inside the total.
      if (fow.length && fow.length !== inn.wickets) {
        flag(`${tag}: ${label} has ${fow.length} in the ledger and ${inn.wickets} wickets`);
      }
      fow.forEach((w, i) => {
        if (i > 0 && w.runs < fow[i - 1].runs) flag(`${tag}: ${label} ledger goes backwards at wicket ${w.wicket}`);
        if (w.runs > inn.runs) flag(`${tag}: ${label} wicket ${w.wicket} at ${w.runs}, above the total ${inn.runs}`);
        if (w.playerBalls === 0 && w.playerRuns > 0) flag(`${tag}: ${label} wicket ${w.wicket} scored without facing a ball`);
      });

      // A stand cannot be smaller than the two shares inside it, and only one
      // can be at the crease.
      //
      // Not checked: that the stands sum to the score at each wicket. They do
      // not always, and both reasons are crex's rather than ours — a run the
      // innings has that no stand is credited with, and a batter who retired
      // hurt and resumed, which opens a stand without a wicket falling.
      for (const p of stands) {
        if (p.a.runs + p.b.runs > p.runs) {
          flag(`${tag}: ${label} stand of ${p.runs} holds shares of ${p.a.runs} and ${p.b.runs}`);
        }
      }
      const live = stands.filter((p) => p.unbroken).length;
      if (live > 1) flag(`${tag}: ${label} has ${live} stands at the crease`);
      if (live && inn.wickets >= 10) flag(`${tag}: ${label} is all out with a stand at the crease`);
    }

    // The readings on top of the card.
    const situation = matchSituation(match, innings);
    if (match.format !== 'TEST' && (situation.margin || situation.followOn || situation.target)) {
      flag(`${tag}: a limited-overs match was given ${JSON.stringify(situation)}`);
    }
    const { partnership, lastWicket } = creaseContext(innings);
    const current = innings.filter((i) => !i.notStarted).pop();
    if (lastWicket && current && lastWicket.wicket !== current.wickets) {
      flag(`${tag}: last wicket is numbered ${lastWicket.wicket} with ${current.wickets} down`);
    }

    // The state: what the card will actually say, and whether it can be true.
    const note = match.note;
    const stale =
      note &&
      isStaleStoppage(note, {
        innings,
        format: match.format,
        perOver: match.ballsPerOver,
        lastBallAt: null,
        now: null,
      });
    const shows = note && !stale && note.paused ? note.kind : match.status;
    if (match.status !== 'LIVE' && note?.paused && !stale) {
      flag(`${tag}: a ${match.status.toLowerCase()} match is reporting ${note.kind}`);
    }

    const info = await getCrexMatchInfo(match.id);
    const sides = Object.values(info.squads).map((s) => s.length);

    // The feed, and the one thing about it that has been wrong before: an over
    // card numbered against the deliveries it heads.
    const feed = await getCrexMatchFeed(match.id, { minBalls: 24, maxPages: 6 });
    for (const over of feed.overs) {
      if (over.over < 1) flag(`${tag}: an over summary numbered ${over.over}`);
      if (over.balls.length > 12) flag(`${tag}: over ${over.over} has ${over.balls.length} deliveries`);
      const heads = feed.balls.filter((b) => b.over + 1 === over.over && b.inning === over.inning);
      if (heads.length > 12) flag(`${tag}: over ${over.over} heads ${heads.length} deliveries`);
    }

    console.log(
      `${tag.padEnd(30)} ${shows.padEnd(9)} | ` +
        innings.map((i) => `${i.teamShortName} ${i.runs}/${i.wickets}@${i.overs}`).join(' · ') +
        ` | ${[situation.margin, situation.target, situation.followOn].filter(Boolean).join(' / ') || '—'}` +
        ` | ${partnership ? `p'ship ${partnership.runs}` : 'no stand'}` +
        ` | squads ${sides.join('/') || '—'}` +
        ` | feed ${feed.balls.length} balls, ${feed.overs.length} overs` +
        ` | ${[info.conditions.weather && 'wx', info.conditions.officials && 'umps', info.conditions.venue && 'venue'].filter(Boolean).join(' ')}`
    );
  } catch (error) {
    flag(`${tag}: threw — ${(error as Error).message}`);
  }
}

console.log(problems ? `\n${problems} problem(s) found` : '\nno problems found');
process.exit(problems ? 1 : 0);
