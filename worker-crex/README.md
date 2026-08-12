# PulseCrease crex Worker

Cloudflare Worker sitting between the frontend and crex.com's internal APIs.

```
browser / Next.js SSR  ──▶  Worker (allowlist + cache + CORS)  ──▶  crex backends
```

This is the sibling of [`../worker`](../worker), which fronts CricLive. Same
shape — allowlist, per-route TTL, stale-while-revalidate, CORS — but crex needs
a few things CricLive did not. Read [Caveats](#caveats) before depending on it.

## Read this first

crex.com publishes **no public API and no documentation**. Everything in
`src/routes.ts` was derived by reading what crex's own Angular bundle calls, and
verified by hand against the live hosts. That has consequences:

- **It is undocumented, so it will break without warning.** Endpoint paths,
  payload shapes and the single-letter response keys can change whenever crex
  ships. Nothing here is a contract.
- **It is very likely against crex's terms of service.** That is your call to
  make, not the Worker's. If this becomes anything more than a personal project,
  get a licensed feed — [`../worker`](../worker) already fronts one.
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
| `/news/topics` | `GET news /api/articlesOC/topics` | 15m | `page` |

Params are typed and enum-bounded. Unknown params (`utm_source` and friends) are
dropped rather than rejected, so a decorated URL still hits the same cache
entry. Bad values get a 400 with the permitted set:

```bash
curl 'localhost:8788/rankings?category=9'
# {"error":"Param 'category' must be one of 0, 1, 2, got '9'","path":"/rankings"}
```

## Local development

```bash
cd worker-crex
npm install
npm run dev              # http://localhost:8788
curl localhost:8788/health
```

Port 8788, so it can run alongside the CricLive Worker on 8787. No secrets, no
`.dev.vars` — every crex endpoint here is unauthenticated. The allowlist, not a
token, is what stops a stranger who finds your Worker URL from using it as an
open relay into crex's API.

## Deploy

```bash
npm run deploy
```

Then add your production domain to `ALLOWED_ORIGINS` in `wrangler.toml`. Logs:
`npm run tail`.

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

Once it responds, add a row to `src/routes.ts` and redeploy.

### Endpoints found but not yet wired up

Discovered in crex's bundle, payloads not yet worked out. All are POST on `oc`
unless noted:

```
/fixture/getFixture              /player/getPlayerOverview
/fixture/getIV4ForUpcomingMatch  /player/getPlayerMatches
/series/getSeriesOverview        /team/getTeamOverview
/series/getMatchesForSeriesID    /team/getMatchesForTeam
/seriesInside/getPTableForSeriesID   /teamInside/getMatchForTeamID
/seriesInside/getSqaudForSeriesID    /oc/getTopRecords
/live/getMatchMetaData           /live/getPreLiveStats
/commentary/getBallFeeds  (content)  /ranking/getRanking  (stats)
/getSC4  /getSV3  (php)
```

## Caveats

**Live scores are not here.** crex streams live score updates out of a Firebase
Realtime Database (`cricket-exchange.firebaseio.com`) using credentials embedded
in their JS bundle. Proxying their public HTTP endpoints is one thing;
authenticating into their Firebase project with keys lifted from their frontend
is another, so this Worker does not do it. `/matches/live` polls the REST
endpoint instead — fine at a 15s TTL, but it is a snapshot, not a stream.

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
normalized, so decoding is the caller's job. If you wire this into the app,
write an adapter alongside
[`backend/src/services/providers/criclive.ts`](../backend/src/services/providers/criclive.ts)
rather than letting crex's vocabulary leak into your components.
