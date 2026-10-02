# PulseCrease crex Worker

Cloudflare Worker sitting between the frontend and crex.com's internal APIs.

```
browser / Next.js SSR  ──▶  Worker (allowlist + cache + CORS)  ──▶  crex backends
```

Allowlist, per-route TTL, stale-while-revalidate and CORS, plus a WebSocket live
hub (`src/live.ts`). Read [Caveats](#caveats) before depending on it.

## Read this first

crex.com publishes **no public API and no documentation**. Everything in
`src/routes.ts` was derived by reading what crex's own Angular bundle calls, and
verified by hand against the live hosts. That has consequences:

- **It is undocumented, so it will break without warning.** Endpoint paths,
  payload shapes and the single-letter response keys can change whenever crex
  ships. Nothing here is a contract.
- **It is very likely against crex's terms of service.** That is your call to
  make, not the Worker's. If this becomes anything more than a personal project,
  get a licensed feed.
- **No bot-protection circumvention.** The Worker sends an `Origin`/`Referer` of
  `crex.com` because their hosts 400 with `Invalid Host header` otherwise; those
  are the headers a browser on their own site already sends. If crex adds a real
  challenge, the answer is to stop, not to defeat it.

## The five upstreams

crex does not have one API. Which host serves an endpoint depends on which
Angular service calls it — the names below are crex's own config keys.

| Key | Host | Serves |
|---|---|---|
| `oc` | `oc.crickapi.com` | the default base — rankings, mapping, series, player, team |
| `stats` | `stats.crickapi.com` | stats and detailed rankings |
| `content` | `content.crickapi.com` | ball-by-ball commentary |
| `news` | `crexweb.crickapi.com` | editorial content |
| `php` | `api.goscorer.com/api/v3` | legacy PHP tier — the live match list |

Guessing wrong gets you `{"error":"Invalid Host header"}`, which is the single
most confusing failure here: it means wrong *host*, not wrong path.

## Routes

Every route is a plain **GET** with query params, even when the upstream wants a
POST with a JSON body. The Worker does the translation, so responses stay
cacheable and the frontend stays simple.

| Worker route | Upstream | TTL | Params |
|---|---|---|---|
| `/matches/live` | `GET php /getLiveMatches` | 15s | — |
| `/rankings` | `POST oc /ranking/rankingFront` | 1h | `category` 0=test 1=odi 2=t20, `gender` 0=men 1=women, `play` |
| `/mapping` | `POST oc /mapping/getHomeMapData` | 6h | `t` teams, `v` venues, `s` series, `p` players, `u` umpires — comma-separated keys |
| `/fixtures` | `POST stats /fixture/getFixture` | 5m | `wise` 1=date 2=series 3=team, `page` (negative = past), `gender`, `format`, `level` — see below |
| `/news/topics` | `GET news /api/articlesOC/topics` | 15m | `page` |
| `/rankings/players` | `POST oc /ranking/getRanking` | 1h | `category`, `play`, `type`, `gender`, `page` — **strings**, see below |
| `/match/info` | `GET php /getIV4` | 5m | `key` — match f_key. Pre-match squads, captain/keeper, broadcast, weather |
| `/player/overview` | `POST stats /player/getPlayerOverview` | 1h | `key` — player f_key. Profile, career stats, recent form — see below |
| `/player/matches` | `POST stats /player/getPlayerMatches` | 1h | `key`, `ft` (0 all, 1 ODI, 2 T20, 3 Test, 4 T10, 5 100B), `bb` (1 batting, 0 bowling), `page` — every innings, grouped by series |
| `/series/matches` | `POST oc /seriesInside/getMatchForSeriesID` | 5m | `key` — series f_key. Every match in the series, by date |
| `/series/table` | `POST oc /seriesInside/getPTableForSeriesID` | 5m | `key` — series f_key. Standings, one entry per group — see below |
| `/series/squads` | `POST oc /seriesInside/getSqaudForSeriesID` | 1h | `key` — series f_key. Squads by team, players as f_keys |
| `/series/overview` | `POST stats /series/getSeriesOverview` | 5m | `key` — series f_key. Series overview; `i4` holds the tournament leaders — see below |
| `/team/matches` | `POST oc /teamInside/getMatchForTeamID` | 5m | `key` — team f_key. The team's fixtures, grouped by series |

Params are typed and enum-bounded. Unknown params (`utm_source` and friends) are
dropped rather than rejected, so a decorated URL still hits the same cache
entry. Bad values get a 400 with the permitted set:

```bash
curl 'localhost:8788/rankings?category=9'
# {"error":"Param 'category' must be one of 0, 1, 2, got '9'","path":"/rankings"}
```

## Fixtures and pagination

`/fixtures` is the whole schedule, past and future. It is on **`stats`**, not
`oc` — crex builds it from `baseNewUrl`, so probing `oc` for `/fixture/getFixture`
only ever 404s.

Upstream wants `{tl,type,page,wise,lang,formatType}`. `tl` is a three-slot filter
array holding ids from crex's own dropdowns, which the Worker assembles from three
named params:

| Param | Slot | Values |
|---|---|---|
| `gender` | `tl[0]` | 0 all, 5 men, 6 women |
| `format` | `tl[1]` | 0 all, 1 ODI, 2 T20, 3 Test, 4 T10, 5 100B |
| `level` | `tl[2]` | 0 all, 7 international, 8 domestic |

`type` and `formatType` are inert on the wire — their UI uses them for labels, not
filtering — so they are pinned upstream and not exposed.

**Pagination depends on `wise`:**

- `wise=1` (default) — date-wise. Flat array, **20 matches per page**, covering
  two or three days. `page=0` starts today, and `page` goes **negative** for
  matches already played (`-1` is the days just before today).
- `wise=2` — series-wise. Object keyed by month (`"August 2026"`), one or two
  months per page, negative for past.
- `wise=3` — team-wise. Object keyed by team id, ~1900 keys, and it **ignores
  `page`** — one call returns the whole set.

`page` is bounded to ±60, which at 20 a page is already about four months either
side of today; unbounded page numbers would mean unbounded cache entries. Team,
series and venue keys in the response (`t1f`, `t2f`, `sf`, `vf`) resolve through
`/mapping` like everything else.

```bash
curl 'localhost:8788/fixtures'                        # today onward
curl 'localhost:8788/fixtures?page=-1'                # yesterday and before
curl 'localhost:8788/fixtures?format=3&level=7'       # international Tests
curl 'localhost:8788/fixtures?wise=2&page=1'          # next month, by series
```

## Player rankings

`/rankings/players` was the last thing here to come off hand-maintained data, and
it is worth recording why it took so long. The endpoint is
`POST oc/ranking/getRanking`, and unlike the rest of crex's API it takes **string**
params — but not the ones you would guess:

| Param | Values | What it actually selects |
|---|---|---|
| `category` | `player`, `team` | player-vs-team, **not** the discipline |
| `play` | `batting`, `bowling`, `allrounder`, `team` | the discipline |
| `type` | `test`, `odi`, `t20` | the format (`t20`, not `t20i`) |
| `gender` | `men`, `women` | |
| `page` | `1` | |

Sending the natural `category=batting` gets you
`{"error":{"status":500,"message":"category.toLowerCase is not a function"}}` with
numeric enums, or a silent empty body with strings. Guessing the format field
name gets `"format of game is missing from request"` forever, because it is
called `type`. These names came out of crex's own lazy-loaded rankings chunk,
where the request is built as `{category, gender, type, play, page}`:

```bash
curl -s "https://crex.com/runtime-es2015.<hash>.js" | grep -oE '38:"[a-z0-9]+"'
curl -s "https://crex.com/38-es2015.<hash>.js" > r38.js
grep -oE 'r_inside\s*=\s*\{[^}]+' r38.js
```

Rows are keyed, not named — `pf` is a player f_key, `tf` a team's, `r` the
rating, `pos` the position, `pr` the previous position (which is how crex draws
its up/down arrow). Resolve `pf`/`tf` through `/mapping`; the frontend does it in
one call for every key across all fifteen lists.

There is no "all rankings" call, so the frontend fans out over the fifteen lists
the ICC publishes (not eighteen — no Women's Test). At a 1h TTL that is one burst
an hour regardless of traffic.

## Player profiles

`/player/overview?key=<player f_key>` is a whole career in one call — and it was
the last endpoint here that looked impossible. Two things hid it:

- **It is on `stats`, not `oc`.** crex's profile service builds the URL from
  `newBaseUrl`, so probing `oc` for anything under `/player/` only ever 404s.
- **The body key is `pf`**, not the `fkey`/`key` every other keyed route here
  wants. It is the same player f_key `/mapping` and `/rankings/players` speak.

The call site is in crex's lazy-loaded profile chunk, where the route resolver is
literally `this.profileService.getPlayerOverview({pf: this.playerFkey})`:

```bash
curl -s "https://crex.com/runtime-es2015.<hash>.js" | grep -oE '[0-9]+:"[a-f0-9]{20}"'
# download the chunks, then
grep -l getPlayerOverview *.js
```

The response is one object with six top-level keys:

| Key | Holds |
|---|---|
| `a.bsi` | basic info — `fn` name, `dob`, `pob` birthplace, `h` height, `n` nationality, `bts`/`bwl` bats/bowls, `bp` batting position, `bs` 1=pace 2=spin, `rl` role, `tm` teams, `p` bio HTML |
| `a.sts` | career stats: `bt` batting rows, `bl` bowling rows, one per competition × format, each with the debut (`btd`/`bod`) |
| `b` | ICC ranking positions — `{ft, pos, type}` |
| `c.btf` / `c.bof` | the last ten batting / bowling innings |
| `d` | teams under contract; `h` the competitions they have figures in |
| `t` | social video embeds — not used |

**Formats are a pair, not a field.** Every stats and form row carries `st` (the
competition) and a format (`ft` on career rows, `mt` on form rows), and the label
comes from both together: `st=1, ft=3` is a Test, `st=5` is the IPL, `st=20` the
T20 Blast. `playerFormatLabel` in
[`frontend/lib/crex.ts`](../frontend/lib/crex.ts) is a transcription of crex's own
`seriesFormatDecision`, which is the only place that mapping is written down.

The bio in `a.bsi.p` is Google-Docs HTML — inline styles, `<span>` soup and all.
The frontend strips it to an allowlist of tags and drops every attribute, so it
inherits our own typography rather than arriving with crex's.

```bash
curl 'localhost:8788/player/overview?key=1IG'
```

`/player/matches?key=<f_key>&ft=0&bb=1&page=0` is crex's player "Matches" tab
(`getPlayerMathes` in the same chunk — their spelling). It is a list of series,
newest start first: page 0 holds six and every later page three, so a short page
is the last one. Each series is `{sf, st, pft, sd, ed, d}` — series key,
competition, the player's side, start and end — and `d` holds one group per
format (`f`) with crex's own totals (`tsr`/`ic`/`sav`… batting, `tsw`/`sec`…
bowling) and `ir`, every innings: `mf` match key, `mn` match number (`^0` final,
`^e` eliminator…), `i` the player's 1st/2nd innings of the match, `r`/`b`, `di`
1 dismissed / 0 not out, `w` wickets on bowling rows, `vs` the opposition, `d`
the date. The totals agree with the innings exactly, which is how the frontend's
series figures were checked.

## Standings, squads and team fixtures

Three routes that all live on crex's `*Inside` services, and all take the same
`{fkey}` body — so once one of them was working the other two were a single
probe each. Worth recording, because the four `/series/*` and `/team/*` paths in
crex's bundle that look like they should serve this all 404.

`/series/table` is the odd one out in this whole Worker: its response is
**named**, not single-lettered. `P W L NR Pts NRR` are crex's own column
headings — sent as strings even where they are numbers.

It is also an **array of groups**, not a table. A league sends one entry; a World
Cup group stage sends one per group, each with its own `g_name` and `pt_info`.
Reading `[0].pt_info` and stopping there is what would quietly merge Group A into
Group B.

| Field | Holds |
|---|---|
| `rank` | crex's own ordering — **not** the array order, which arrives unsorted |
| `rf` | last five results, oldest first: `["W","L","W","W","W"]` |
| `qualified` / `eliminated` | through to the knockouts, or out of it |
| `is_winner` | lifted the trophy |
| `cuprate` | crex's qualification-chance figure; `"--"` where it has none |
| `team_fkey` | resolves through `/mapping` like every other team key |

`/series/squads` keeps crex's typo — `getSqaudForSeriesID`. The correctly-spelled
path 404s, so the misspelling is part of the contract. Players arrive as f_keys:
`pf` the squad, `c` captain, `vc` vice-captain, `f` overseas, `iw` keeper.

`/series/overview` is the only endpoint that answers "who has the most runs in
this tournament". It is on `stats`, not `oc` — every `oc`
`seriesInside/get*StatsForSeriesID` spelling 404s — and its body key is `sf`, not
the `fkey` the rest of the series family takes; `fkey` reaches the payload
validator and 400s with `Request Payload Error!`.

The response is the whole series overview, `i1`–`i9`. `i4.i` is the part worth
having: keyed by format id, each entry holding the leaders as **one-entry
arrays**.

| Field | Holds |
|---|---|
| `mr` / `mw` | most runs, most wickets — the orange and purple caps |
| `hs` / `bf` | highest individual score, best bowling figures (`"17/5"`) |
| `ms` / `mf` / `md` | most sixes, fours, dot balls |
| `bsr` / `bec` | best strike rate (`r` = the runs it came off), best economy (`w` = wickets) |
| `mfp` | most fantasy points |
| `totals` | the tournament's own `t4` / `t6` — fours and sixes hit in it |
| `pf` / `tf` | player and team f_keys, resolving through `/mapping` |
| `bi` | innings the leader has batted or bowled in |

`/team/matches` is narrower than its name: it returns a team's *scheduled*
matches grouped by series key, so a side between tournaments can answer with
almost nothing, and a side mid-league answers with only that league. Past results
come from `/fixtures`' negative pages instead, which carry `result`, `s1`/`s2`
and `o1`/`o2` — enough to reconstruct who batted first from the result wording.

```bash
curl 'localhost:8788/series/table?key=2E2'
curl 'localhost:8788/series/squads?key=2E2'
curl 'localhost:8788/series/overview?key=2AW'
curl 'localhost:8788/team/matches?key=2Y'
```

## Local development

```bash
cd worker-crex
npm install
npm run dev              # http://localhost:8788
curl localhost:8788/health
```

Port 8788. No secrets, no
`.dev.vars` — every crex endpoint here is unauthenticated. The allowlist, not a
token, is what stops a stranger who finds your Worker URL from using it as an
open relay into crex's API.

## Deploy

```bash
npm run deploy
```

Then add your production domain to `ALLOWED_ORIGINS` in `wrangler.toml`. Logs:
`npm run tail`.

The first deploy with the live hub applies the `v1` migration in `wrangler.toml`,
which creates the `LiveHub` Durable Object class (SQLite-backed, so it works on
the free plan).

## Live hub (`/live`)

A WebSocket endpoint served by one Durable Object (`src/live.ts`). The browser
opens one socket and subscribes to topics; the hub polls crex once per topic for
every connected socket and sends only what changed.

| Topic | Source | Sent |
| --- | --- | --- |
| `matches` | `/matches/live` | a snapshot on subscribe, then per-match diffs (`changed`, `removed`) |
| `card:<matchKey>` | `/match/scorecard` | the whole body, when it changes |
| `feed:<matchKey>` | `/match/commentary` (newest page) | the whole page, when it changes |

```text
client → {"type":"subscribe","topics":["matches","card:14NE"]}
client → {"type":"unsubscribe","topics":["card:14NE"]}
client → {"type":"ping"}                       ← answered {"type":"pong"} without waking the object
hub    → {"type":"hello","v":1,"epoch":"…","ts":…}
hub    → {"type":"matches:update","topic":"matches","epoch":"…","seq":42,"prev":38,"ts":…,"changed":{…},"removed":[]}
```

`seq` only rises, across all topics; a diff's `prev` is the seq it follows, so a
client can tell a missed diff from topics interleaving. `epoch` changes when the
object restarts. A topic polls every 2s while it keeps changing, then 10s and
30s once quiet, and stops when nothing subscribes. The Origin header is checked
against `ALLOWED_ORIGINS` by hand, since WebSockets skip CORS. `/health` lists
`live`, which the frontend reads before dialling so a Worker without the hub is
never tried.

Cost: while anyone is connected, the hub wakes on an alarm about every 2s, which
is up to ~43k alarms a day and close to continuous Durable Object duration. That
fits the free plan's daily limits but not with much room; watch the Durable
Objects usage graph after deploying.

## Adding an endpoint

Probe it first — the probe script talks to the upstream directly, so you can
find the right base and payload without redeploying:

```bash
./scripts/probe.sh php /getLiveMatches
./scripts/probe.sh oc /ranking/rankingFront '{"category":0,"gender":0,"play":0}'
```

Decoding the errors:

| Response | Means |
|---|---|
| `Invalid Host header` | wrong base — try another one |
| `Not a valid Request` | right base, missing or malformed payload |
| `<field> missing from request` | add that field to the body |
| `Request Payload Error!` | field present, wrong type — they use **numeric** enums, not strings |

That last one costs the most time. `{"category":"test"}` fails;
`{"category":0}` works.

**But numeric enums are not universal** — `/ranking/getRanking` wants strings, and
assuming otherwise is what kept it unwired for so long. If a field-name or
payload-type guess stops making progress, stop guessing and read the call site in
crex's bundle; see [Player rankings](#player-rankings) for how.

Once it responds, add a row to `src/routes.ts` and redeploy.

### Endpoints found but not yet wired up

Discovered in crex's bundle, payloads not yet worked out. All are POST on `oc`
unless noted:

```
/fixture/getIV4ForUpcomingMatch  /player/getPlayerMatches
/live/getMatchMetaData           /player/searchPlayerInningsEntities
/live/getPreLiveStats            /oc/getTopRecords
/getSV3  (php)
```

Confirmed **dead** — in the bundle, 404 on the live host. Do not spend time on
them again: `/series/getSeriesOverview`, `/series/getMatchesForSeriesID`,
`/team/getTeamOverview`, `/team/getMatchesForTeam`. The working versions of the
last two are on `teamInside`/`seriesInside`, which is the pattern: crex's
"inside" services are the ones a detail page actually calls.

`/player/getPlayerInfo` on `oc` is a dead end, and an expensive one: it answers
`{"err":"Not A Valid Request"}` to every payload rather than 404-ing, which reads
like a body you have not guessed yet. It is not — player profiles live on
**`stats`**, at `/player/getPlayerOverview`. See [Player profiles](#player-profiles).

## Caveats

**Not crex's own stream.** crex pushes live scores out of a Firebase Realtime
Database (`cricket-exchange.firebaseio.com`) using credentials embedded in their
JS bundle. Proxying their public HTTP endpoints is one thing; authenticating into
their Firebase project with keys lifted from their frontend is another, so this
Worker does not do it. The live hub's socket is ours: it polls the same REST
endpoints every 2s and pushes the changes, so it is only as fresh as they are.

**`/mapping` is a lookup, not a dump.** Nothing from `/matches/live` renders
without it — `"b":"11"` is a team, `"v":"BK"` a venue, `"q":"^1JK"` a series.
You send the keys you saw and get back only those, so an empty request returns
empty arrays (which is what made it look broken at first). Strip the leading
`^` before looking a key up; crex prefixes it on the match object but not in the
map. The frontend client in
[`frontend/lib/crex.ts`](../frontend/lib/crex.ts) caches resolved names for the
life of the process and only asks for keys it has not seen.

**`/news/topics` is slow and enormous** — ~620 KB and up to 25s on a cold fetch.
The 15-minute TTL hides it from most users, but the first request after a deploy
will feel it. Consider trimming the payload in the Worker if you actually use it.

**The response format is obfuscated.** crex ships single-letter keys — `t1Sname`,
`wp`, `flb`, `dt_id`. `/matches/live` is passed through unchanged rather than
normalized, so decoding is the caller's job — `frontend/lib/crex.ts` is that
adapter, and crex's vocabulary stays inside it.
