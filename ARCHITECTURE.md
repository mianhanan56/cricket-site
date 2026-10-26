# Architecture — PulseCrease

Live cricket site: scores, match telemetry, momentum, series stats and client-side alerts.
Last verified against source: 2026-10-23.

## System overview

```
Browser ──(client polling)──┐
                            ▼
Next.js 14 (Vercel) ──SSR/ISR fetch──▶ Cloudflare Worker `worker` ──▶ upstream internal APIs
                                        (allowlist + edge cache + CORS)     (5 upstream hosts)
```

- **There is no backend and no database.** The old Express + Prisma + Postgres (Neon) backend
  was retired and its directory deleted.
- Every piece of data comes from the upstream's undocumented internal APIs, reached only through
  the Worker. The frontend never calls the upstream directly.
- User state (follows, alert rules, notifications, theme) lives in the browser (`localStorage`).

## Folder structure

```
cricket/
├── .claude/                 CLAUDE.md (project rules) + skills/design-standards.md
├── README.md                Canonical overview; data-source table per page
├── frontend/                Next.js 14 App Router app — the whole application
│   ├── app/                 Routes (see "Pages" below); page.tsx + <name>.module.scss per route
│   ├── components/          Grouped by domain: automations, brand, fixtures, follow, home,
│   │                        insights, layout, live, match, notifications, player, rankings,
│   │                        search, series, ui
│   ├── hooks/               useApiMatches (shared live poll), useQueryTabs (URL-synced tabs)
│   ├── lib/                 Data client + pure domain logic (see "Modules")
│   ├── data/                rankings.json — bundled fallback snapshot only
│   ├── scss/                component.scss (tokens/mixins), global.scss (custom props, resets), main.scss
│   ├── tests/               node:test unit suites (run via tsx)
│   ├── scripts/check-live.mts  Network audit of today's live feed (not part of npm test)
│   ├── types/index.ts       All shared interfaces
│   └── next.config.js       PWA (next-pwa), image host allowlist, staleTimes, prod URL guard
└── worker/                  Cloudflare Worker fronting the upstream
    ├── src/index.ts         Request handling, CORS, cache, SWR
    ├── src/routes.ts        Route allowlist: upstream, method translation, typed params, TTLs
    ├── src/upstreams.ts     The five upstream hosts
    ├── scripts/probe.sh     Manual endpoint probing
    └── wrangler.toml        Name `pulsecrease-api`, dev port 8788, ALLOWED_ORIGINS
```

There is **no root `package.json`**, despite the README describing npm workspaces — run
commands inside `frontend/` or `worker/`.

## Worker (`worker`)

- Every route is a plain **GET** with query params; the Worker translates to the upstream's
  POST/JSON where needed so responses stay cacheable.
- Params are typed and enum-bounded; unknown params are dropped (keeps cache keys stable),
  bad values return 400 with the permitted set.
- Sends the upstream site as `Origin`/`Referer` (their hosts 400 with "Invalid Host header" otherwise).
  Policy: no bot-protection circumvention — if the upstream adds a challenge, stop.
- No secrets, no KV. The allowlist is what keeps it from being an open relay.
- Upstream hosts: `oc` (oc.crickapi.com), `stats`, `content` (commentary), `news`,
  `php` (api.goscorer.com — live match list). Wrong host ⇒ "Invalid Host header".
- Routes (TTL): `/matches/live` 2s · `/rankings` 1h · `/rankings/players` 1h · `/mapping` 6h ·
  `/fixtures` 5m · `/news/topics` 15m · `/news/tagged` 15m · `/news/article` 15m · `/match/info` 5m · `/match/scorecard` 5s · `/match/commentary` 5s ·
  `/player/overview` 1h · `/player/matches` 1h · `/series/matches` 5m · `/series/table` 5m · `/series/squads` 1h ·
  `/series/overview` 30s · `/team/matches` 5m. Full detail and wire formats: `worker/README.md`
  and `worker/src/routes.ts`.
- A route `path` may hold `{param}` placeholders (`/news/tagged` → `/api/articles/filter/{type}_{key}`);
  `upstreamTarget` fills them and leaves the rest as the query. A param filled into a path needs a `pattern`.
- Responses use single-letter keys; team/series/venue/player f_keys resolve through `/mapping`.
- **Live hub** (`src/live.ts`, Durable Object `LiveHub`, one instance): `/live` upgrades to a
  WebSocket. Topics `matches` (snapshot, then per-match diffs), `card:<key>`, `feed:<key>` (whole
  scorecard / newest commentary page when changed). One upstream poll per topic for all sockets:
  2s while changing, 10s/30s when quiet, stops with no subscribers. Frames carry `epoch` + a
  global rising `seq`; diffs carry `prev`. Origin checked against `ALLOWED_ORIGINS`. Upstream
  fetch shared with the HTTP path via `src/upstream.ts`.
- Every upstream run on the HTTP path races `RUN_DEADLINE_MS` (fetch timeout + 2s), so an `inFlight`
  key is always released even when a body read stalls past the fetch's own timeout (seen 2026-10-21:
  live scorecard/commentary keys hung for good). Logged as `upstream unsettled`.
- Logging (Workers observability): one `console.warn` per failed upstream call on the HTTP path
  (route + status/detail); the hub logs a topic once when it starts failing and once on recovery.

## Frontend modules (`frontend/lib`)

| Module | Responsibility |
| --- | --- |
| `api/` | The data client (split by domain 2026-10-23; import everything from `@/lib/api`, whose `index.ts` re-exports the public API). Layers, no runtime import cycles: `client` (`apiGet`, `WORKER_URL`, `FetchOpts`, `isRejectedRequest`, `inWidth` — at most N calls in flight) → `names` (the only door into the name cache: `resolveKeys`; `toTeam`, `seriesRef`, `venueOf`, crest/portrait URLs) → `codes` (schedule-row status/format/Hundred codes) → domains: `matches` (list + `toMatch`), `notes` (breaks/stumps/latched stoppages), `scorecard`, `matchInfo`, `commentary` + `feedNotes`, `schedule` (series rows, archived and `fx-` matches), `series`, `fixtures`, `player`, `playerMatches`, `standings`, `leaders`, `statTables`, `squads`, `attribution`, `teams`, `rankings`, `news`. |
| `headToHead.ts`, `venues.ts`, `venue.ts` | Records **derived** from the schedule corpus (`getApiFixtureRange`) — the upstream has no H2H/venue/team-results endpoint. |
| `matchState.ts`, `liveScore.ts`, `innings.ts`, `situation.ts`, `crease.ts`, `overs.ts`, `balls.ts` | Match state machine, innings reading, one-line situation text, crease context, ball parsing. |
| `momentum.ts`, `pulse.ts`, `telemetry.ts` | Worm graph points, live pulse readings, chase telemetry. |
| `automations.ts`, `notifications.ts`, `follows.ts`, `persisted.ts` | Browser-stored rules, alert ledger/keys, follows (and `followedMatches`, the order both My Cricket views use), localStorage wrapper. |
| `playerSeries.ts` | Player series record: format vocabulary, merging the batting/bowling page lists (only series both lists have reached are shown), default series, batting/bowling summaries. Pure; pages come in through a fetcher. |
| `rankings.ts`, `directory.ts`, `playersDirectory.ts` | Rankings with bundled fallback; team/player directories built from ICC ranking lists. Team lists come from rankingFront (top 10 per format) except men's Test, read in full from `/rankings/players?category=team&play=team` so all 12 Test nations are in the directory. |
| `search.ts`, `searchIndex.ts` | Client-side search over matches + `/api/search-index`. |
| `tabs.ts`, `queryParams.ts`, `uiState.ts`, `navigationDepth.ts` | URL tab vocabularies/validation, overlay state, back-button depth. |
| `matchType.ts`, `featured.ts`, `fixtureDays.ts`, `datetime.ts`, `relativeTime.ts` | Classification, featured match choice, calendar keys, time formatting. |
| `timeout.ts` | `withTimeout(ms, signal?)` — every client fetch's deadline (Worker 15s, search index 15s, `/health` probe 10s); links signals by hand where `AbortSignal.any` is missing. |
| `news.ts` | the upstream news decode: `/news/topics` (latest, keyed team/series/player tags, excerpt) and `/news/tagged` (one team/series/player; headline cards, no excerpt or keyed tags). Images rewritten to the upstream's resizing CDN (`?type=mq` lead, `lq` thumbs). Articles link out to the upstream — the article body is not republished. `getTaggedNews` never throws. |
| `text.ts`, `site.ts`, `seriesFormat.ts` | `ordinal`/`plural`; `SITE_URL` (env → Vercel production domain → localhost); `MATCH_FORMAT_LABEL` + series format phrases. |

Shared vocabulary lives in one place each: `isChaseTight` (telemetry), `MATCH_FORMAT_LABEL`
(seriesFormat), `RANKING_FORMAT_LABEL`/`FORMAT_ORDER` (playersDirectory), `TeamCrest` (types).
Stored alerts are rebuilt field by field in `parseAutomations`; an unreadable scope drops the alert.

Match-list innings (`feedInnings`): the upstream's `j/k/l/m` are the innings in batting order. The slots
assume the sides alternate; `followedOn` swaps the last two for a follow-on — live when `d` (3 = the
side that batted first is in its second innings, 4 = the other side's) points at the other slot,
finished from the result (won by wickets → batted last; lost by runs → batted last; won by an
innings → batted once). Draws stay as sent. A finished match's 0/0 in 0 overs is an unplayed
innings and is dropped. Pinned in `tests/scorecard.test.ts` › follow-ons. The home scoreboard
still prefers the fetched card (`withCard` in `LiveHero`) and shows a Test's `matchSituation`.

Formats: `MatchFormat` is `TEST | ODI | T20 | T10`. T10 comes from `fo`, the `n % 4 == 3` slot
(unless `hb` marks The Hundred, which stays T20) or `ft` 4 on schedule rows.

Home reads two extra sources besides the feed, so its figures match the pages they summarise:
`hooks/useFixturesAhead` (`/fixtures` pages 0–1, every 5 min) adds fixtures the feed window
omits to Upcoming/All, up to the last row read; `hooks/useSeriesTotals` swaps "Series in
progress" onto each series' own schedule (`withSeriesSchedules`) and renders nothing until it
answers. Home's tabs (user rule, 2026-10-07): Live = play on or resuming today (`isLiveNow`);
a multi-day match at stumps is in **All only** until the next day's play starts, then Live again;
finished → Results. So All = Live + Upcoming + Results + matches at stumps. The ticker, stage and
Insights show live-now matches only. Insights is out of the header, dock, footer and sitemap
(2026-10-22, user ask); `/insights` still renders for anyone who has the link.

Home layout (redesign, 2026-10-21; the 3D wave ribbon was removed at the user's ask): a match
switcher strip (`ScoreTicker`, page colours, picked match = solid green pill) above the stage
(`LiveHero`: on-pitch scoreboard — batting side big on the left, other side right, chase sentence,
figure tiles, batter/batter/bowler cards, this over, match centre button; `NextUpHero` when nothing
is live). `LiveHero` is keyed by match, so `ScoreTicker` scrolls the picked pill back into view on
mount. Then Your cricket band (only when following), the Matches board — Live and All are a flat
`MatchGrid` of `MatchTile`s (All opens at 12 with a "Show all" button), Upcoming is `UpcomingRail`,
Results is `ResultList` cards (no Player of the match: the match page has it, user ask) — then
`FollowPrompt` (only when following nothing), Top stories (`TopStories`, a server component streamed
under Suspense and passed into the client `HomeMatches` as its `news` prop; latest news page 1, a
lead with the picture full bleed plus four cards), and Series in progress when nothing is live.
Scoreboard pitch (`components/live/PitchView`, 2026-10-22, user ask): a side-on SVG pitch in the
face-off's middle column on desktop (replacing "vs"), a strip under the sides below that. It plays
the newest delivery when one arrives while it's on screen (keyed by innings/over/ball/extra, never
the ball present at mount), with a badge for every ball (Dot ball, `runsLabel` for runs and extras,
Four/Six/Wicket): runs and byes roll into the field; a four streaks back along the ground, a six
flies out, a wicket breaks the striker's stumps. The hero score is sized to its column (`cqi`) and
runs/wickets never split across lines. Reduced
motion gets the badge only. Colours `--clay`/`--stump` live in `on-pitch`.
Commentary tab (2026-10-22, the sidebar was removed at the user's ask): one full-width feed with
The upstream's own interleaved items between the balls under "All". `feedFromRows` decodes them into
`FeedNote`s (`types/index.ts`) beside balls and overs: `t` writers' notes and `t/f` records
(markup parsed by `richText` into bold/heading runs, never rendered as HTML), `ps` new-spell and
new-batter cards (format career, rank, age; for bowlers `runs` is wickets and `sr` economy), `pbc`
batter v bowler, `pvtc` player v the opponent, `ac`/`rc` reviews (`review_type` 0 batting, 1
fielding; `result` 1 out; `ultraedge` 1 bat involved; retained/lost from the side's reviews-left
before and after), `pm`/`tm` milestones, `w` dismissal lines, `tc` chase, `to` toss, `ic2` innings
end; polls (`pl`) are dropped. `CommentaryFeed` places each note after the last ball published
before it (`at` against the ball's timestamp), over cards by over number — both by
`lastIndexAtOrBelow` (`lib/balls.ts`), which tolerates out-of-order and missing times — and draws
160 rows at a time. Cards live in `components/match/FeedNotes`. History reads **one innings per request**
(`getApiInningsFeed`, the `lastDocId=1&inning=N` form the ball popups use): the innings in play
when the tab opens, each earlier one on "load older". It answers in ~2s even while the deployed
Worker hangs on the paged walk for a live key. Match-page Live pulse reads the
window in hand (6 legal balls up) instead of waiting for 18; Insights keeps the full-window rule.
`withCard` (`lib/innings.ts`) merges the fetched card into a match and keeps the feed's
declaration flag (the card has none) — used by `LiveHero` and `MatchDetail`. Test `session`
(1–3) is the first figure of the list row's `s`, live multi-day only: "Day 5 · Session 2" in
the match header, a Session tile on the home scoreboard. Player career tables are one "Career"
section (`components/player/CareerTabs`, client) with an International / Domestic switch on its
heading; both levels' Batting and Bowling tables render on the server, the switch only swaps them,
and a level with no rows is left out (no switch when only one remains). Loader beats have no line.
Player Recent form (`components/player/RecentForm`, client, 2026-10-22): one card with a
Batting/Bowling switch (opens on the player's role), four figures computed from the last innings
(batting runs/average/SR/best; bowling wickets/average/best/3+ hauls), a bar chart oldest→latest
with each figure above its bar and the opponent below (bar heights in 20 steps via `data-step`;
batting draws a dashed average line), and the innings list behind a "Show all" button. The card's
pieces (`StatTiles`, `FormBars`, `MoreToggle`, `FormRow`, `FormCardSkeleton`) and styles live in
`components/player/FormCard` and are shared with Series performance. `FormBars` takes one column
per match (a Test's two innings stand as a pair in it), hides itself when every bar is 0, and
scrolls sideways instead of shrinking columns under 26px.
Switcher pills show both sides' flags (no status dot). `TeamBadge` crests have a 2px white ring
and the image scaled 1.56× — the upstream draws a national flag across the middle 64% of its canvas.
Match page Live tab: "Recent overs" is the innings' last three overs from the whole feed (newest
page + history): one line from tablet, the overs in equal columns and the balls sized to the box
by how many there are (`data-tokens` on the strip, a container-query clamp of 22–34px per count in
`BallTimeline.module.scss`), stacked one over a row on phones; `BallTimeline` labels every over (no
"···" for a partial one).
A finished match's result is `resultText(res)`: the upstream can leave the last stoppage there for a while
after the finish ("Tea Break" on a won Test), which reads as no result, and the match page keeps
its slow list poll until a real one arrives.

Server pages wrap any loader that `generateMetadata` also calls in React `cache()` (match, player,
team, venue, series, series stats, news story): `apiGet` always passes an abort signal, and Next skips
its fetch dedupe for any fetch with one, so without it the read and decode ran twice per request.
The match page starts the corpus read before awaiting the match; an archived match reads its card
alongside `/match/info`; `getApiTeamSquad` reads roles alongside the squad list.

`hooks/useApiMatches.ts` is **one shared poll** of the match list: every subscriber reads the
same snapshot and it runs at the fastest interval any subscriber requests. A poll that changes
nothing keeps the previous `Match` objects (`reuseUnchanged`, `lib/live/frames.ts`), so a per-poll
clock must read `lastUpdated`, not object identity; `isRefreshing` toggles only while an error shows.

`lib/live/socket.ts` is **one shared WebSocket** to the hub per page (module level, outside React;
refcounted topics, heartbeat, 1→30s backoff, resync listeners after a reconnect, closes 20s after
the last topic goes). It asks `/health` once and never dials a Worker without `live`. Pure frame
rules (ordering, gap detection, list diffs, feed merging) are in `lib/live/frames.ts` and tested.
The list store and `useApiMatchExtras` apply frames through the same parsers as HTTP
(`matchListFromRaw`, `scorecardFromRaw`, `feedFromRows`), guarded by `keepNewest` / card progress.
Balls are merged by id, then `dedupeDeliveries` (`lib/balls.ts`) keeps one entry per delivery
(innings/over/ball; wides and no balls also by score after) — the upstream re-publishes a ball under a new
id. A scorecard stand is `unbroken` only while neither of its batters is out: the upstream adds the new
pair's stand a ball after the wicket.

## Pages (`frontend/app`)

`/` home · `/fixtures` · `/matches/[id]` · `/series` · `/series/[id]` (tabs incl. stats) ·
`/series/[id]/stats/[kind]` · `/teams` · `/teams/[key]` · `/venues/[key]` · `/players` ·
`/players/[id]` · `/rankings` · `/news` (`?page=`) · `/search` · `/insights` · `/automations` · `/my` ·
`/api/search-index` · `sitemap.ts` · `robots.ts`. Data source and freshness per page: README table.

News (`components/news/NewsList.tsx`): `/news` leads with the newest story, then rows; tag chips
link to our team/series/player pages. Every card opens `/news/[slug]` (the upstream's slug, ending in the
article id): headline, summary, cover, author, tags, related. No link to or mention of the upstream
anywhere in the UI (user decision, 2026-10-07); the article body is not republished. `getNewsStory` reads `/news/article`, falling back
to the first three latest-news pages; a mismatched slug redirects to the real one. Team and player pages stream a News section (`TaggedNews`,
under `Suspense`, hidden when empty); the series page gets a News tab only when it has articles.

## Player series performance

`/players/[id]` has one "Form" section (`components/player/FormTabs`, client, 2026-10-22) with a
Recent / By series switch at the heading's right end (`SectionHead end`). Both views stay mounted
(the hidden one keeps its state) and share one Batting/Bowling pick through `useFormDiscipline`;
a URL naming `?series=` or a format opens By series. "By series" is
`components/player/PlayerSeriesSection` streamed under Suspense (an empty state when the route
fails); `SeriesPerformance` is the client part, `SeriesPicker` the searchable series listbox. Source is the Worker's
`/player/matches` (upstream `getPlayerMatches`): every innings, grouped by series then format, newest
series first, 6 series on page 0 and 3 per later page, batting (`bb=1`) and bowling (`bb=0`) as
separate lists. Figures are computed from the innings (dismissal-based average, `*` kept, Test
innings counted separately) and were checked equal to the upstream's own per-series totals on 471
series×format groups. Selection lives in `?series=&format=` written with `history.replaceState`
(no server round trip); the server reads it and pages back up to 8 pages to reach an older series.
Client pages are deduped in a module-level map. If the route fails the section is omitted.
Layout (2026-10-22, same card as Recent form): the picker trigger shows the series name with its
side, month span and formats; the card has a Batting/Bowling switch (role first; the choice
survives a series change), per format four tiles (batting runs/average/SR/highest; bowling
wickets/economy/average/best) and a `FormBars` chart captioned by match name on a tour or by
opponent in a tournament, then "Show all N innings" and "Open series" in the footer. A series
with several formats under "All" repeats tiles and chart per format under a format heading.
Format filter codes: 3 Test (the upstream also files first-class here), 1 ODI, 2 T20, 4 T10, 5 100B.

## Ball-by-ball popups

Scorecard batter/bowler rows have a ball icon (`components/match/PlayerBalls.tsx`) opening a dialog
(bottom sheet on phones) of that player's deliveries, over by over. `hooks/usePlayerBalls` keeps one
store per match+innings, filled by `getApiInningsBalls` — the whole innings in one request (see
worker README › `/match/commentary`); a live innings is re-read after 15s. `lib/playerBalls.ts`
picks a player's balls (`pf` striker / `bf` bowler on each delivery), counts faced (not wides) or
legal balls, and keeps a W on a batter's ball only when it matches their own fall of wicket (a
non-striker run-out sits on the striker's ball). Checked against the card: 123 of 125 players
exact across four matches; the two misses are balls missing from the upstream's own commentary.

## Not found vs outage

Detail pages 404 only when the id is unknown: profile/schedule readers return `null` for that
(the upstream refuses an unknown player key with a 400, which `isRejectedRequest` treats as unknown). Any
other failure throws to `app/error.tsx`, whose Retry (`hooks/useErrorRetry`) refreshes the route
before `reset()`. `generateMetadata` still swallows failures so the page itself decides.

## Caching / freshness

Worker edge TTL (per route) → Next.js per-fetch `revalidate` (ISR) → client data: live socket
first, polling underneath. With a healthy topic the list and match-extras polls slow to a 30s
reconcile (alert feed watcher 60s); without the socket they poll as before (2s list, 2s extras).
Entry: a page that shows the list revalidates it on mount (components mounting together share one
request); `useApiMatchExtras` fetches on mount. Visibility return and socket reconnect both
revalidate over HTTP. `next.config.js` sets `experimental.staleTimes { dynamic: 0, static: 30 }`:
dynamic routes fetch on every link navigation; static ISR routes (`/teams`) may reuse a prefetch
made within 30s. Back/forward replays the router copy, so `NavigationTracker` calls
`router.refresh()` after a traversal.
PWA service worker: the ball-by-ball Worker routes (`/matches/live`, `/match/scorecard`,
`/match/commentary`, `/live`) are **NetworkOnly** — a saved copy rolled scores back. The rest of the
Worker origin is NetworkFirst with no network timeout (the cache answers only on a network
failure). Patterns must be RegExps — Workbox serialises matchers with `toString()`.
Series leaders (`/series/overview`, Worker TTL 30s) use a 15s revalidate while the series has a
live match, and `hooks/useSeriesLeaders` re-reads them every 30s on the match Stats tab and the
series page while live. Stat tables read a live match's card at 15s (finished cards 900s).
Player recent form re-reads the last six days' matches off their scorecards (`withFreshForm`),
since the profile is cached for an hour.

## Fixtures

`/fixtures` (ISR 300s) calls `getApiFixtureSchedule`: Worker `/fixtures?wise=1&page=N` (edge TTL 300s, 20 rows a page), batches of 8 pages until the schedule reaches 30 days ahead (max 40 pages; stops early when the upstream runs out). All rows go to the client in one payload; `FixturesFilter` filters by format/type client-side and reveals 4 days at a time on scroll. The last, partly-read day is held back via `coveredUntil`. Team/venue/head-to-head pages use the separate `getApiFixtureRange` corpus (45 back / 12 forward, 30-minute cache).

## Automations

Rules in `lib/automations.ts`: each alert holds `triggers: TriggerKind[]` (one or more moments),
one scope and one delivery; alerts saved with the old single `trigger` are read as a one-item list
(`parseAutomations`). The Alerts page (simple creator only; the advanced builder was removed) creates one alert per submit (Select all included), edits in
place (`updateAutomation`) and deletes behind a confirm dialog (`components/ui/ConfirmDialog`, a
native `<dialog>`). The team/series picker offers current names from the live list
(`lib/alertSuggestions.ts`). Rules are evaluated by `components/automations/AutomationEngine.tsx` against
consecutive live snapshots (match start, wicket, tight chase, stoppage, result from the list;
sixes/fours/50/100 from ball feeds). Nothing fires on the first snapshot; a shared ledger dedupes
across tabs, keyed per event (`event:<firing key>`), so overlapping rules send one notification.
Feed watchers also read `feed:<key>` socket frames. Delivered to the notification center and,
with permission, the system tray — only while a tab is open.
Following is an alert of its own (2026-10-23, user ask): `lib/followAlerts.ts` turns the follows
into rules the engine runs beside the stored ones — a `FOLLOWED` rule (followed teams and series)
with the chosen moments, and a `PLAYER` 50/100 rule per followed player. They are built per render,
never stored, ids start `follow:` (no `recordFire`), and deliver to the browser too. Settings
(`pc.followAlerts`: on/off plus the moments switched off — Match start, Wickets, 50s and 100s, Close
chase, Results, News) live in `components/follow/FollowAlertsPanel` on My Cricket and Alerts. News:
the engine's `NewsWatcher` reads `/news/topics` page 1 (20) every 5 minutes and notifies stories
under 3 hours old tagged with a followed team/series/player, at most 3 a read, each once
(`claimEvent('news:<id>')`); notification kind `news`. The first Follow click asks for browser
permission (`askOnFollow`, the click is the gesture). Still tab-open only: no push server.

## Styling conventions

- SCSS Modules only; **no Tailwind, no inline styles**. Mobile-first, `min-width` breakpoints.
- Tokens/mixins in `scss/component.scss` (colors map to CSS custom properties in `global.scss`);
  light ("Outfield") is default, `data-theme="dark"` ("Floodlights") the alternative (2026-10-21).
  `sassOptions.includePaths` = `scss/`.
- Design system (2026-10-21, user asked for a friendlier look): outfield green `--signal` (#0b6e4f
  light / #3dcb92 dark), cherry `--wicket`, gold `--warn`, sky `--data` (+ `--data-ink` for text on
  it), sage-white page, white cards with `$shadow-1` (the `panel` mixin). Type: Figtree
  (`$font-sans`, body/labels) + Archivo (`$font-display`: headings, scores; `$font-data` = Archivo
  tabular figures). `$font-mono` is a legacy alias of `$font-data` — JetBrains Mono is gone.
  `eyebrow` labels are sentence case, not uppercase mono. Radii 4/8/14/20. Segmented controls are
  pills on `--control-track` / `--control-on`.
- Signature element: the home stage (`LiveHero`, `NextUpHero`) is a deep-green scoreboard with
  mown stripes — `@include on-pitch` re-points every colour token inside it (any theme), and
  `@include mown-stripes` paints a layer behind it. Tokens built with `var()` resolve where they're
  declared, so `on-pitch` restates the derived ones (`*-soft`, `--sk-*`, `--glow-signal`); add any
  new derived token there too.
- Note: `design-standards.md` describes a generic 4-file `src/styles/` layout; this repo's actual
  layout is `scss/{component,global,main}.scss` + per-component modules. Follow the repo.
- Banned patterns (CLAUDE.md): accent bars beside headings; tiny muted "View all"-style links;
  explanatory/provenance captions beside labels.
- Filters on phones (< 768px): each page keeps its inline `Segmented` filters for tablet and up
  (hidden with `phone-only`) and renders `components/ui/FilterSheet` beside them — a "Filters"
  button with an active count and removable chips, opening a bottom sheet with Reset / Apply. Used
  on Home (competition only; status tabs stay visible), Fixtures (format, competition; the week
  strip stays), Series, Rankings (no chips — the title states the selection), Players (search stays)
  and match Commentary.
- Heading dropdowns (2026-10-22, Rankings joined 2026-10-23 on the user's ask): page-level choices
  are `components/ui/FilterMenu` dropdowns ("Format · All ▾") in the `PageHeader` aside, hidden on
  phones (which keep `FilterSheet`). Fixtures: Format, Competition; Series list: Status (with
  counts — options take an optional `count`, shown in the open menu) and Competition. Both lit when
  not the first option; the page passes the heading text to the client filter component.
  Rankings: Gender · Format · Ranking (Batting / Bowling / All-rounder / Teams, one choice over
  `group` + `category`), in the title's order, with `highlight={false}` since no option means
  "everything". The phone sheet has the same three groups (`view` maps back to group/category).
- Fixtures dates: `WeekStrip` in `FixturesFilter` — seven days from today a page, ‹ › by week,
  "All days" with the total, each day its count (multi-pick toggles as before), and the month grid
  (`FixtureCalendar`) behind a "Calendar" button at the head's end; its foot is Today + Clear.
  The Format / Competition menus are the page heading's aside: `FixturesFilter` renders the
  `PageHeader` (the page passes the eyebrow and title, and renders its own header only when the
  schedule read fails). Strings exported from a `'use client'` file arrive on the server as client
  references, so shared copy has to come in as props.
- My Cricket (2026-10-23 redesign): matches (2 columns) beside a side column of a Following card
  (teams, series, players grouped, unfollow star per row, + Teams / Players / Series) and the
  Notifications card; tablet puts the two cards side by side; following nothing shows the team
  picker alone. The old count aside and one-tap alert pills are gone.
- Series match cards (2026-10-23, `components/series/SeriesMatchStrip`): one card per match in the
  progress panel — "Match N", "2nd ODI" in a multi-format tour (each format numbers from 1), or
  The upstream's own name ("Final", "1st Semi Final"); both sides, winner ticked; the margin, "Live now", or
  the date (the time joins it once the card is ≥140px, a container query). The first upcoming match
  is tinted `--data` with "Next". A horizontal scroller (fade edges, thin bar for fine pointers)
  that scrolls itself to the live/next match with the last result beside it. Replaced the numbered
  boxes, their legend and the "Next" footer.
- Match rows (`UpcomingRail`, every page): the format chip leads the sides (on phones it moves to
  the series line so both sides keep one line); no venue anywhere (user ask); `inSeries` drops the
  series name on the series page. `ResultList` cards lead with the format chip; `inSeries` likewise.
  `SectionHead end` pushes heading controls to the far end (Career, Form).
- Server Components by default; `'use client'` only when needed. Few comments — only non-obvious *why*.
- Live vs stumps: the ticker, stage, Insights and live counts filter with `isLiveNow`
  (`lib/matchState.ts`). `isAtStumps` matches are in Home's All tab only (not Live) and get a
  "Stumps" tag/section in search. This has flip-flopped; the 2026-10-07 user rule is final. Don't filter on
  `status === 'LIVE'` for anything a reader sees as "live".
- Format chips go through `matchFormat` / `meetingFormat` (`lib/seriesFormat.ts`): the upstream files every
  multi-day match as a Test, and `isUnofficialTest` (`lib/matchType.ts`) relabels one that is not
  between two senior full-member sides as "Multi-day" (series: `unofficialTests`). National
  qualifiers stack when classifying international ("Pakistan U19 Women" → Pakistan).
- `next/og` images (`app/opengraph-image.tsx`, `twitter-image.tsx`, `apple-icon.tsx`,
  `app/icons/[size]` for the manifest) use `style` objects: Satori has no stylesheet support. This
  is the only exception to the no-inline-styles rule.
- Match centre tab is `?tab=` (`MATCH_TAB_KEYS`), read by the server page and written with
  `history.replaceState` (a router navigation would re-render the dynamic page on the server).
- Series rows (`SeriesCard`) take their columns from `SeriesFilter`'s `.list` via subgrid at
  tablet+; the list rule uses element selectors (`> li`, `> div`, `> li > a`) to outrank `.row`.
- The brand green has two roles: `$signal` is a fill behind `$signal-ink` text (buttons, badges, the
  six token); `$signal-mark` is the green as a mark on its own (live dots, rails, chart
  fills/strokes, nav underlines, focus outlines, `--tone`). Both meet 3:1 on the page.
- Dynamic module lookups (`styles[state.family]`) always end `?? ''`: a family without a rule
  otherwise prints the class "undefined".
- Two CSS modules on one element tie on specificity and the build's stylesheet order picks the
  winner (it differs between builds). A component that takes a `className` must not set the same
  property itself — see `BackButton` (`.spaced` only when no class is passed) and the scorecard
  (`td.top`, `.table .left`).

## Key design decisions

- **Retired the backend**: it served hand-seeded, un-maintained data; the Worker covers everything live.
- **Derived figures are window-bounded** (~7 weeks back, 2 ahead) and all callers share one window
  so they share cache entries.
- **Unattributable results are counted separately, never guessed** (`attributeResult` exact
  full/short name match only).
- **No average first-innings score**: schedule scores are per team, not per innings.
- **Production build fails** if `NEXT_PUBLIC_WORKER_URL` points at localhost (it is inlined
  into the client bundle). Local Worker dev uses `npm run local` / `.env.wrangler.local`, never `.env.local`.
- **Image optimizer pinned** to `cricketvectors.akamaized.net` (avoids open proxy).
- Series stat tables: `seriesStatRows` reads every card once; `getApiSeriesStatTables` ranks several
  kinds off that single read.

## External services

- Upstream internal APIs (undocumented, likely against ToS — personal project caveat in worker README).
- Cloudflare Workers (`pulsecrease-api.pulse-cricket.workers.dev`).
- Vercel (frontend, root `frontend/`), Vercel Web Analytics.
- Git remote: `git@github.com:mianhanan56/cricket-site.git`.
