// The scorecard decoders and the readings built on them, pinned to real
// payloads.
//
// The packed strings crex serves have no field names in them, so a decoder that
// reads the wrong slot produces numbers that look plausible and are wrong — the
// fall of wickets once read a 66-run first wicket as 102 because the batting
// line's team runs and team balls are the other way round from what this file's
// notes claimed. Nothing but arithmetic against a real innings catches that, so
// the fixtures below are verbatim payloads and the assertions are the identities
// a scorecard has to satisfy.

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { getCrexScorecard, getCrexMatchFeed } from '../lib/crex';
import { matchSituation, creaseContext } from '../lib/situation';
import type { InningsScore, Match, Team } from '../types';

// --- fixtures ---------------------------------------------------------------
//
// IND v SL, 2nd Test, Colombo, day 3, as /match/scorecard served it. Trimmed to
// the fields the decoder reads and to the players it needs, with the arithmetic
// of the full innings intact.

const IND_INNINGS = {
  c: 'O',
  d: '503/9(828',
  e: '8.3.7.3.0',
  b: [
    '15K.45.53.9.0.102.66.1.1JR/47.54-66.26/',
    'AK.18.33.2.1.64.37.2.J4.FH/36.81-52.09/',
    'EI.117.193.12.0.458.281.1.O22/60.20-59.96/',
    'O5.50.108.6.0.311.186.2.1JR.FH/43.38-61.74/',
  ],
  a: ['1JR.106.174.5.4', 'J4.68.120.4.1'],
  p: ['15K.19.31.AK.18.33.37.64', '15K.26.22.EI.3.16.29.38'],
};

// Trimmed to four dismissed batters and one still to come, so the total is set to
// the four wickets the lines actually account for — a fixture whose ledger and
// wicket count disagree would be testing an impossible innings.
const SL_INNINGS = {
  c: 'T',
  d: '205/4(360',
  e: '0.3.1.5.0',
  b: [
    '4XE.1.6.0.0.8.1.2.EF.15K/44.14-66.31/',
    '17B.19.25.3.0.57.35.2.EF.16J/-/',
    'NX.2.7.0.0.18.8.5.7OY/8.26-34.12/',
    'BTZ.80.133.9.0.270.171.1.7/0.00-0.00/',
    '17H',
  ],
  a: ['E1.33.66.0.1', 'EF.46.78.1.3'],
  p: ['4XE.1.6.17B.0.2.1.8', '17B.5.3.NX.2.7.7.10', '17B.14.20.BTZ.12.19.27.39'],
};

/**
 * Answer crex's endpoints from the fixtures above.
 *
 * The mapping call is answered with an empty body on purpose: an unresolved key
 * must degrade to the key itself, never to `undefined` in a name.
 */
function stubFetch(payload: unknown): void {
  mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = url.includes('/mapping') ? {} : payload;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
}

const team = (id: string, shortName: string): Team => ({
  id,
  name: shortName,
  shortName,
  country: shortName,
});

const testMatch = (overrides: Partial<Match> = {}): Match => ({
  id: '12WY',
  homeTeam: team('O', 'IND'),
  awayTeam: team('T', 'SL'),
  series: { id: 'S', name: 'India tour of Sri Lanka 2026' },
  format: 'TEST',
  status: 'LIVE',
  venue: 'Sinhalese Sports Club Ground',
  startTime: '2026-08-23T04:00:00.000Z',
  day: 3,
  ...overrides,
});

// --- the packed batting line ------------------------------------------------

describe('fall of wickets', () => {
  it('reads the team score at each dismissal, balls before runs', async (t) => {
    t.after(() => mock.restoreAll());
    stubFetch([IND_INNINGS, SL_INNINGS]);

    const [ind, sl] = await getCrexScorecard('12WY');

    // "15K.45.53.9.0.102.66.1..." — 102 balls, 66 runs. Read the other way round
    // this innings' ledger climbs to 817 on a total of 503.
    assert.deepEqual(
      ind.fallOfWickets?.map((w) => [w.wicket, w.runs]),
      [
        [1, 37],
        [2, 66],
        [3, 186],
        [4, 281],
      ]
    );

    // Every entry inside the innings total, and never going backwards.
    for (const inn of [ind, sl]) {
      const fow = inn.fallOfWickets ?? [];
      fow.forEach((w, i) => {
        assert.ok(w.runs <= inn.runs, `${inn.teamShortName} wicket ${w.wicket} above the total`);
        if (i > 0) assert.ok(w.runs >= fow[i - 1].runs, 'ledger went backwards');
      });
    }
  });

  it('numbers wickets in the order they fell, not batting order', async (t) => {
    t.after(() => mock.restoreAll());
    stubFetch([IND_INNINGS]);

    const [ind] = await getCrexScorecard('12WY');

    // The card lists Rahul second and he was out first.
    assert.equal(ind.fallOfWickets?.[0].name, 'AK');
    assert.equal(ind.fallOfWickets?.[0].playerRuns, 18);
  });

  it('skips a retirement, which is not a wicket', async (t) => {
    t.after(() => mock.restoreAll());
    // Dismissal code 11 is retired hurt: an innings that ended, no wicket taken.
    stubFetch([
      {
        ...IND_INNINGS,
        d: '120/1(200',
        b: ['15K.45.53.9.0.102.66.11.1JR/-/', 'AK.18.33.2.1.64.37.2.J4.FH/-/'],
      },
    ]);

    const [inn] = await getCrexScorecard('12WY');

    assert.equal(inn.fallOfWickets?.length, 1);
    assert.equal(inn.fallOfWickets?.[0].name, 'AK');
  });
});

describe('partnerships', () => {
  it('keeps crex figures rather than summing the two batsmen', async (t) => {
    t.after(() => mock.restoreAll());
    stubFetch([IND_INNINGS, SL_INNINGS]);

    const [ind] = await getCrexScorecard('12WY');
    const first = ind.partnerships?.[0];

    assert.equal(first?.runs, 37);
    assert.equal(first?.balls, 64);
    assert.equal(first?.a.runs, 19);
    assert.equal(first?.b.runs, 18);
  });

  it('marks the last stand unbroken only while wickets remain', async (t) => {
    t.after(() => mock.restoreAll());
    stubFetch([IND_INNINGS, SL_INNINGS]);

    const [ind, sl] = await getCrexScorecard('12WY');

    // Both innings are open, so both end in a stand still at the crease.
    assert.equal(ind.partnerships?.at(-1)?.unbroken, true);
    assert.equal(sl.partnerships?.at(-1)?.unbroken, true);
    assert.equal(
      (ind.partnerships ?? []).filter((p) => p.unbroken).length,
      1,
      'only one stand can be at the crease'
    );
  });

  it('marks nothing unbroken in an all-out innings', async (t) => {
    t.after(() => mock.restoreAll());
    stubFetch([{ ...IND_INNINGS, d: '503/10(828' }]);

    const [inn] = await getCrexScorecard('12WY');

    assert.equal((inn.partnerships ?? []).some((p) => p.unbroken), false);
  });
});

describe('the crease context', () => {
  it('reports the live stand and the wicket before it', async (t) => {
    t.after(() => mock.restoreAll());
    stubFetch([IND_INNINGS, SL_INNINGS]);

    const innings = await getCrexScorecard('12WY');
    const { partnership, lastWicket } = creaseContext(innings);

    assert.equal(partnership?.unbroken, true);
    // The ledger's last entry is the wicket the live stand began at.
    assert.equal(lastWicket?.wicket, 4);
    assert.equal(lastWicket?.runs, 171);
  });

  // PAK-W read 37/2 with one wicket on the card: crex moves the total the moment
  // a wicket falls and fills the batting lines a tick later. Both readings come
  // off those lines, so both are a wicket behind — the page showed the *first*
  // wicket labelled "Last wicket", beside a stand it had already broken.
  it('says nothing while the card is a wicket behind the score', async (t) => {
    t.after(() => mock.restoreAll());
    stubFetch([IND_INNINGS, { ...SL_INNINGS, d: '205/5(360' }]);

    const innings = await getCrexScorecard('12WY');
    const { partnership, lastWicket } = creaseContext(innings);

    assert.equal(lastWicket, null);
    assert.equal(partnership, null);
  });
});

// --- the readings -----------------------------------------------------------

const inn = (
  teamId: string,
  shortName: string,
  runs: number,
  wickets: number,
  overs: number,
  extra: Partial<InningsScore> = {}
): InningsScore => ({ teamId, teamShortName: shortName, runs, wickets, overs, ...extra });

describe('the match situation', () => {
  it('states the deficit and the runs to avoid the follow on', () => {
    // The position crex printed as "SL trail by 300" and "needs 101 more".
    const situation = matchSituation(testMatch(), [
      inn('O', 'IND', 503, 9, 138),
      inn('T', 'SL', 203, 7, 58, { phase: 'CURRENT' }),
    ]);

    assert.equal(situation.margin, 'SL trail by 300 runs');
    assert.equal(situation.followOn, 'SL need 101 runs more to avoid the follow on');
    assert.equal(situation.target, null);
  });

  it('drops the follow on once the margin is passed', () => {
    const situation = matchSituation(testMatch(), [
      inn('O', 'IND', 503, 9, 138),
      inn('T', 'SL', 304, 7, 90, { phase: 'CURRENT' }),
    ]);

    assert.equal(situation.followOn, null);
    assert.equal(situation.margin, 'SL trail by 199 runs');
  });

  it('drops the follow on in a third innings, where the choice is made', () => {
    const situation = matchSituation(testMatch(), [
      inn('O', 'IND', 503, 9, 138),
      inn('T', 'SL', 250, 10, 90),
      inn('T', 'SL', 40, 2, 12, { inningsNumber: 2, phase: 'CURRENT' }),
    ]);

    assert.equal(situation.followOn, null);
  });

  it('turns a fourth innings into a target', () => {
    const situation = matchSituation(testMatch(), [
      inn('O', 'N-Z', 251, 10, 66.5),
      inn('T', 'WZ', 187, 10, 65.4),
      inn('O', 'N-Z', 222, 10, 51, { inningsNumber: 2 }),
      inn('T', 'WZ', 191, 3, 28.1, { inningsNumber: 2, phase: 'CURRENT' }),
    ]);

    assert.equal(situation.margin, 'WZ trail by 95 runs');
    assert.equal(situation.target, 'WZ need 96 runs to win');
  });

  it('says lead when the side batting is ahead', () => {
    const situation = matchSituation(testMatch(), [
      inn('T', 'SL', 200, 10, 60),
      inn('O', 'IND', 260, 4, 70, { phase: 'CURRENT' }),
    ]);

    assert.equal(situation.margin, 'IND lead by 60 runs');
  });

  it('says nothing on a limited-overs match, where the chase is a rate', () => {
    const situation = matchSituation(testMatch({ format: 'T20' }), [
      inn('O', 'ACA', 164, 9, 20),
      inn('T', 'BAN', 93, 4, 13.4, { phase: 'CURRENT' }),
    ]);

    assert.deepEqual(situation, { margin: null, followOn: null, target: null });
  });

  it('says nothing before a ball is bowled', () => {
    assert.deepEqual(matchSituation(testMatch({ status: 'UPCOMING' }), []), {
      margin: null,
      followOn: null,
      target: null,
    });
  });
});

// --- the ball feed ----------------------------------------------------------

describe('over summaries', () => {
  const feedPage = [
    {
      type: 'o',
      id: 1787650687864,
      on: 59,
      o: 60,
      inning: 1,
      runs: 1,
      rb: '1.0.0.0.0.0',
      s: '205/7',
      team: 'Sri Lanka',
      p1: 'Keshara Nuwantha',
      s1: '13(52)',
      pf1: 'O22',
      p2: 'Sonal Dinusha',
      s2: '41(67)',
      pf2: '17H',
      bowler: 'Manav Suthar',
      bd: '2-61(14.0)',
      bf: '7OY',
    },
    {
      type: 'b',
      id: 1787650674733,
      o: '59.6',
      on: 59,
      inning: 1,
      b: '0',
      c1: 'Manav Suthar to Keshara Nuwantha',
      c2: 'Full and tossed up down the leg.',
      s: '205/7',
    },
  ];

  it('numbers an over one above the prefix its deliveries carry', async (t) => {
    t.after(() => mock.restoreAll());
    stubFetch(feedPage);

    const feed = await getCrexMatchFeed('12WY', { minBalls: 1, maxPages: 1 });

    // crex's 59.6 is the 60th over. A card numbered 59 would sit above the balls
    // of over 60 and show the wrong figures for them.
    assert.equal(feed.overs[0].over, 60);
    assert.equal(feed.balls[0].over, 59);
    assert.deepEqual(feed.overs[0].balls, ['1', '0', '0', '0', '0', '0']);
    assert.equal(feed.overs[0].runs, 1);
    assert.equal(feed.overs[0].score, '205/7');
    assert.equal(feed.overs[0].bowler?.name, 'Manav Suthar');
    assert.equal(feed.overs[0].batsmen.length, 2);
  });

  it('carries the running score and innings onto each delivery', async (t) => {
    t.after(() => mock.restoreAll());
    stubFetch(feedPage);

    const feed = await getCrexMatchFeed('12WY', { minBalls: 1, maxPages: 1 });

    assert.equal(feed.balls[0].scoreAfter, '205/7');
    assert.equal(feed.balls[0].inning, 1);
  });

  it('reports a cursor and stops when a page repeats itself', async (t) => {
    t.after(() => mock.restoreAll());
    stubFetch(feedPage);

    // minBalls is beyond what the stub can supply, so the walk only ends by
    // running out of new rows — the guard that keeps paging from spinning.
    const feed = await getCrexMatchFeed('12WY', { minBalls: 99, maxPages: 4 });

    assert.equal(feed.exhausted, true);
    assert.equal(feed.oldest, '1787650674733');
  });
});
