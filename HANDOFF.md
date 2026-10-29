# Handoff — PulseCrease

Last updated: 2026-10-27. Read this, then ARCHITECTURE.md, PROJECT_STATUS.md and TODO.md.
If anything conflicts, trust: source code → ARCHITECTURE.md → PROJECT_STATUS.md → HANDOFF.md → TODO.md.

## Project overview

PulseCrease is a live cricket site (scores, match telemetry, momentum, series stats, client-side
alerts). Next.js 14 App Router + TypeScript + SCSS Modules in `frontend/`, deployed to Vercel.
All data comes from the upstream's undocumented internal APIs through a Cloudflare Worker in
`worker/`. **No backend, no database** — ignore any mention of Express/Prisma/Neon.

## Current objective

2026-10-21: redesign for a friendlier, client-facing look, page by page — **home done** (two rounds:
first colours/type only, which the user said still looked like the old design; then a real layout
pass — see ARCHITECTURE › Home layout), next page when the user picks it. Shared pieces changed
with it and now look new everywhere they're used: `MatchTile`, `ResultList`, `UpcomingRail`,
`TeamBadge` (round), `Segmented` (pills). New palette/type/default light theme (ARCHITECTURE › Styling conventions);
tokens and mixins are global, so every page already wears the new colours, but only home has had
its layout pass. Player page (2026-10-22): Recent form and Series performance redesigned as one
shared card style (`components/player/FormCard`), then merged into one "Form" section with a
Recent / By series switch (`FormTabs`); career tables merged into one "Career" section with an
International / Domestic switch (`CareerTabs`), both switches at the heading's right; hero, rankings and the aside are untouched
so far. Match page (2026-10-22): the commentary sidebar is gone; the upstream's notes, stat cards and
reviews show inside the feed (ARCHITECTURE › Commentary tab). Same day: series stats bottom row,
match rows without stadium (format chip first), Insights out of the nav, Fixtures dropdown filters
+ week strip, Rankings controls regrouped (ARCHITECTURE › Styling conventions › Filters vs tabs).
2026-10-23: series page match cards (`SeriesMatchStrip`) replace the numbered boxes; Fixtures
filters sit in the page heading's aside; calendar foot is Today + Clear. Then the user asked for
Follow to notify like alerts, news included: built (ARCHITECTURE › Automations), with My Cricket
redesigned around it. Delivery is still tab-open only (no push server). Rankings' and the Series
list's pill rows are now heading dropdowns like Fixtures. Live video streams were discussed: the user wanted CricHD/Tapmad/Tamasha
restreams or iframes — declined (unlicensed). Agreed legal route, not built yet: "Watch live"
link to the rights holder per match, official embeds where they exist, a second-screen live mode.

2026-10-26: AI match quiz built (ARCHITECTURE › Match quiz) on Gemini's free tier — the user
asked for a free model. Needs `GEMINI_API_KEY` before it shows anywhere (TODO).

2026-10-27: home `LiveHero` fixture layout (shown when the current innings hasn't started, e.g.
an innings break) now prints each side's score and overs beside its name.
Same day: live list (`rankLive`, so the home ticker and the default stage) puts matches with the
top-ten nations first (`topSides` in `lib/matchType.ts`, both sides > one > none), after followed
sides and before the old state/tight-chase score. Both uncommitted.

2026-10-27: Alerts creator — "What I follow" now lists what is followed, and a new "Live match"
scope picks one live match (ARCHITECTURE › Automations). Uncommitted.

2026-10-27: match Info tab shows each side's bench (squad players not in the XI) under its
Playing XI, from `/match/info`'s `tb` (ARCHITECTURE › Frontend modules). Uncommitted.

2026-10-27: Key moments show milestones (50s, 100s, team 100s) from the whole innings, not just
the live poll's newest page: `useApiCommentaryHistory` now keeps the events of the innings it reads
whole, and `MatchDetail` merges them with the live ones (`feedEvents`) for the Live tab. Tests only
get the innings in play (earlier innings' milestones aren't read); limited-overs matches walk back to
the first innings. Uncommitted.

2026-10-28: fewer requests on home (a reviewer flagged the burst): the live socket no longer calls
`/health` first; `useFixturesAhead` reads `/fixtures` only when the board shows it (Upcoming/All tab or
nothing live), one page at a time with infinite scroll on Upcoming, cached so remounts share a read.
Duplicate rows in dev Network are React Strict Mode's double effects — not in production. The live
card's commentary poll no longer re-walks three overs each tick: `getApiMatchFeed`'s `since` stops at
the newest row already held, so after the first load it is one request per poll.
Same day, the user asked for readable API keys (their reviewer couldn't read `c1`/`fv`): every Worker
route now renames the upstream's keys to camelCase and drops unused fields (ARCHITECTURE › Worker ›
Response shapes); all `frontend/lib/api` readers and test fixtures follow. **Deploy the Worker before
the site** — the deployed site reads the old keys, the new site reads the new ones.
2026-10-29: speed pass, at the user's request ("optimize the apis because I want the project fast"):
every kept field was traced to a screen or a logic use and the dead ones dropped (player bio, news-card
excerpt/caption, fixture scores, team-schedule venue/number/result, team dark colour, leader dots/fantasy
and inactive format blocks, scorecard wagon-wheel and dot-ball suffixes, empty `/mapping` buckets, dead
commentary fields). With the live socket healthy the HTTP safety-net polls run every 5 min (was 30s/60s)
and page entry no longer refetches the list. `SHAPE_VERSION` is 2. The PWA service worker no longer
handles the ball-by-ball routes at all (they were NetworkOnly, so it was a pass-through hop and a
duplicate ⚙ row per call in DevTools); `/mapping` stays — hot payloads carry keys, names are read
once and cached. `npm run local` needs `cd worker && npm run dev` on :8788. Uncommitted.

2026-10-15: full code review (bugs) and an upstream feature-gap survey, no code changed. Findings are
new TODO.md rows dated 2026-10-15; the user picks what to fix.

A strict UX / mobile audit of production was completed on 2026-09-29 (no code changed). Findings
are queued in TODO.md by priority; the user decides which to fix. The earlier UI pass (dock,
footer, page-end spacing, milestones board, scroll fades) is committed (68cd364, cf291e1).

Committed in 2575206: the phone filter sheet, the live WebSocket layer (Worker hub is deployed and
answering from pulsecrease.vercel.app), Home tabs without Overview, the Alerts rework (multi-moment
alerts, Select all, Edit/Delete, advanced builder removed), key moments from fall of wickets, and
the first mobile pass.

Uncommitted (2026-09-30, final mobile QA): series match strip split per format
(`app/series/[id]/page.tsx`), 16px phone inputs (Teams filter, alert picker), 34px series nodes on
phones, `TableScroll` scroll-fade (`TableScroll.module.scss`), series stat player column width on
phones. Match tiles (`MatchTile`) now link the series name to `/series/[id]`: the tile is an
`<article>` with a full-cover match link (`.cover`) and the series link stacked above it, since
anchors can't nest.

Uncommitted (2026-10-02): player "Series performance" (see ARCHITECTURE.md › Player series
performance). Adds Worker route `/player/matches`; the Worker must be deployed before it shows in
production.

Uncommitted (2026-10-02, code-quality pass, no UI change): verified-dead code removed
(`FilterSelect`, compact rail/result variants, five unused exports, dead SCSS), duplicated helpers
moved to one home each (`lib/text.ts`, `lib/timeout.ts`, `lib/site.ts`, `isChaseTight`, format
labels, `TeamCrest`), scorecard `!important`s replaced by specificity (computed styles identical),
BackButton spacing made independent of stylesheet order (see TODO: confirm per-page values),
fetch deadlines on `/health` and the search index plus a manual fallback for Safari < 17.4,
match-change resets in the history/squads hooks, alert feed watchers re-keyed on scopes, stored
alerts validated field by field, Worker logs + topic guard, robots/sitemap localhost fix, docs.

Uncommitted (2026-10-02, data-consistency fixes from a user bug report): Home Live tab includes
matches at stumps (tab, ticker and Insights now count the same set) and the ticker names a stopped
state instead of the overs; Home "Series in progress" uses each series' own schedule
(`hooks/useSeriesTotals`); Home Upcoming/All merge the first two `/fixtures` pages for fixtures the
live feed omits (`hooks/useFixturesAhead`, `getApiFixturesAhead`); new `T10` match format
(`n % 4 == 3` without `hb`, upstream `ft` 4) plus a Fixtures T10 tab; pulse window counts 18 *legal*
balls; men's Test team list comes from the full `/rankings/players?category=team` list (12 Test
nations, so Ireland is in the Teams directory); over-card tokens normalised to the strip's
notation ("1nb" → "nb+1"); bare wicket cards in Key moments get the team score from the fall of
wickets, and the dedupe no longer matches one "Khan" for another. No Worker change needed.

Uncommitted (2026-10-02, design/usability pass from the same report): Home stage pins its match
until the reader picks another or it leaves Live; results list sides share one grid (no 7ch
code cut, scores nowrap); Upcoming full names uncapped; compact ball strip drops older overs that
would only show in part; top nav no longer lights Rankings on `/players`; a search pick doesn't
hand focus back to the trigger; match tabs stay put (mini score after the tabs, `.panelHold`
min-height while the rail is stuck, panel scrolled to the rail's bottom); Insights server-renders
its first list (ISR 15s); form strip hidden unless ≥2 innings register on it; series readout
packed; `--signal-mark` token (light #5f8a00) for lime dots/bars/strokes/outlines while `$signal`
stays the fill behind `$signal-ink`; `Segmented fill` shares the Home status row on phones;
3-tile hero row on phones; every dynamic `styles[key]` lookup falls back to `''`; score-strip
buttons have aria-labels. "/" opens search (checked by key events through Chrome DevTools).

Uncommitted (2026-10-02, follow-up): wicket events carry a `WicketRef` (batter f_key, innings,
wicket number) from the upstream's `w` rows and `keyMoments` matches the fall of wickets by batter id —
no prose/surname search (it hid wickets whose batter was named as a fielder elsewhere and
doubled others); every wicket is the short "out for N (B) · TEAM r/w" line. Scorecard opens on
the innings in progress (`phase === 'CURRENT'`, else last batted) until the reader picks one.
Series list: one CSS subgrid across rows at tablet+ (format column ≥120px incl. row padding,
chips nowrap); skeleton rows (`div`) included.

Uncommitted (2026-10-02, stumps rules — supersedes "Live tab includes stumps" above): one rule,
`isLiveNow` / `isAtStumps` in `lib/matchState.ts`. A multi-day match at stumps (note kind STUMPS,
from the upstream's `$l` status code first) is out of Home Live/count/strip/stage and Insights, and
appears in All only; search tags it "Stumps" (own section on /search). Breaks and delays stay
Live. Play resuming clears the note (stale-stoppage logic) and it returns to Live on the next
poll. Match centre at stumps: "Stumps · Day N", "Day N+1 starts <local time>" from match info
`nt` (`MatchConditions.nextPlay`; omitted when absent), no tab dot, no batting mark. A Test
side's earlier innings render small above the current one on phones (`ScoreParts.earlier`).
Finishing (incl. a last-day draw) is the upstream's own status/result; nothing is inferred from stumps.

Uncommitted (2026-10-06, fixes from a user bug report; supersedes "stumps in All only" above):
Home Live tab lists matches at stumps after the live ones, and All is built from the three tabs, so
Live + Upcoming + Results = All (ticker/stage/Insights still live-now only). Service worker:
live Worker routes NetworkOnly, no 3s cache fallback elsewhere. Player recent form re-read from
scorecards for the last six days. Series leaders: Worker overview TTL 30s, 15s revalidate while
live, 30s client poll on the match Stats tab and series page; live cards at 15s in stat tables.
Commentary deduped per delivery. A stand is unbroken only while both batters are in. Points table
form dropped when the row's own counts can't account for it. Search indexes players on live cards
and ranks exact/shorter names first. Empty "At this ground" block dropped. Header sides wrap on
phones < 440px. Non-Test multi-day matches read "Multi-day". Youth/women national sides are
international. Match tab in `?tab=`; panel hold sized to leave no blank screen. "1 team",
H2H "Draw"/"Tie"/"NR" mark, crest placeholders, pulse waits for a full window and plausible
wickets, Home stage holds its match through a 60s feed gap. PNG OG/Twitter/apple/manifest icons
via `next/og`; sitemap has /teams, /players, /insights, not /search.

Uncommitted (2026-10-06, news — from an upstream gap review): `/news` page, News in nav/footer/
sitemap, News section on team and player pages, News tab on series pages (see ARCHITECTURE.md ›
Pages). Worker: new `/news/tagged` route plus `{param}` path placeholders, `limit` on
`/news/topics`. **Needs a Worker deploy** for team/series/player news. Articles open on the upstream.

Uncommitted (2026-10-06, pre-launch QA): see PROJECT_STATUS › pre-launch QA. Outages no longer
read as 404s on detail pages (ARCHITECTURE › Not found vs outage); match pages gained a hidden h1;
InfoPanel batter role class fixed; error Retry refreshes. Harness approach: CDP over Node's
WebSocket, scratch `next dev` on another port against `wrangler dev`, Chrome `--disable-web-security`.

Uncommitted (2026-10-07, stumps — final, supersedes both earlier stumps notes): Home Live tab =
`isLiveNow` only; a multi-day match at stumps is in All only, back on Live when play resumes,
Results when finished. Tab counts no longer add up to All by design.

Uncommitted (2026-10-07): ball-by-ball popups on the scorecard (ARCHITECTURE › Ball-by-ball popups)
and PulseCrease news story pages (`/news/[slug]`). Worker changes (`inning` on
`/match/commentary`, `/news/article`) need a deploy; both features already work without it, slower
or via fallback. Story pages show the summary only and never mention the upstream (user decision); full article text
is not republished (copyright) unless the user gets the upstream's permission.

Superseded 2026-10-21: the wave ribbon below was deleted (user: "remove 3d"); Live/All are a flat grid.
Uncommitted (2026-10-07, wave ribbon — from a user reference "Wave Gallery"): Home Live and All
tabs show tiles on a 3D wave ribbon (`components/home/WaveRibbon`, see ARCHITECTURE › Home). Three
cards in view (user ask, 2026-10-12): the centre one raised and forward, the two beside it set
back; further cards fade out. From 1280px it shows four (2026-10-12): the middle pair raised,
the outer two set back. A scroll track under it scrubs card by card; arrows on mouse devices. From 2
matches up (user asked for all cards in 3D). Verified in Chrome 148 at 1440/1920/820/390, light,
reduced motion, drag/buttons/track/Tab/click, and a prod build from a scratch copy.

Not fixed (needs a decision): unknown match/team/player/series/venue URLs return 200 + noindex.
`loading.tsx` boundaries (root, matches/[id], players, players/[id], teams, series) stream the
shell before `notFound()` runs, so the status can't become 404 while they exist. Calling
`notFound()` from `generateMetadata` was tried and does not help (verified on a build).

## Recommended next step

2026-10-23 refactor (ran alongside the rename; see PROJECT_STATUS): `lib/api` is now 22 modules —
add new decoders to the domain module, shared lookups to `names.ts`, and export from `index.ts` only
what callers outside `lib/api` need. Wrap any loader `generateMetadata` shares in React `cache()`.
Polls that change nothing now keep the previous objects (match list, card, feed items), so code that
needs a per-poll tick must read `lastUpdated` from `useApiMatches`, not wait for a new `matches` array.

2026-10-23: the data source's name was removed from the whole repo (user request). The Worker is now
`pulsecrease-api` in `worker/`, the client is `frontend/lib/api` (`getApi*`, `Api*` types, `apiGet`,
`WORKER_URL`) and the env var is `NEXT_PUBLIC_WORKER_URL`. The frontend's default URL is
`https://pulsecrease-api.pulse-cricket.workers.dev`, which exists only once the renamed Worker is
deployed — **deploy before pushing the frontend**, or production loads no data. Comments and docs
call the source "the upstream"; only the upstream hosts and `Origin`/`Referer` in `worker/src` and
`worker/scripts/probe.sh` still name it, because the calls fail without them.

First: **deploy the Worker** (`cd worker && npm run deploy`) — the user's call; the live
scorecard/commentary hang (TODO, High) only clears with it. Then the match centre redesign.

Deploy the Worker (`/news/tagged`, `/series/overview` TTL 30s). Next gap from the upstream review: Stats Corner (TODO). Decide the 404-status trade-off (TODO). Then the
user's pick from TODO.md. Earlier High rows: scorecard table clipping on
phones, removing the Advanced alert builder plus alert/notification dedupe, the series stat value
column, the insights score clipping, and team-page results.

## Environment setup

```bash
cd frontend && npm install && npm run dev       # :3005, uses the deployed Worker by default
cd worker && npm install && npm run dev         # :8788 local Worker (optional)
cd frontend && npm run local                    # frontend against local Worker (.env.wrangler.local)
```

- There is **no root package.json**; the README's `--workspace` commands don't work from root.
- Env vars are all optional (`NEXT_PUBLIC_WORKER_URL`, `NEXT_PUBLIC_SITE_URL`). Never put a
  localhost Worker URL in `.env.local` — production builds throw on it by design.
- Worker CORS allows only `http://localhost:3005` and `https://pulsecrease.vercel.app`.

## Useful commands

```bash
cd frontend && npm test                 # node:test via tsx, offline
cd frontend && npx tsc --noEmit -p .
cd frontend && npm run check:live       # audits today's live feed (network)
cd worker && npm run typecheck
```

## Gotchas another agent must know

- **Don't run `next build` or a second `next dev` inside `frontend/`.** The user usually has
  `next dev` running and both share `.next`, which corrupts it (routes flip 200/404, unstyled
  pages). Verify production builds from a copy: rsync `frontend/` (minus `.next`, `node_modules`)
  into a scratch dir, symlink `node_modules`, build/start there on another port. Headless checks on
  other ports need CORS disabled in the browser.
- Dev server runs on port 3005 (3000 is used by an unrelated app on this machine).
- The upstream wire format is single-letter keys and changes without notice; the Worker renames them
  (`worker/src/shapes/`), so a new upstream field needs a line there before the frontend can read it.
  If something breaks, probe the upstream first (`worker/scripts/probe.sh`). "Invalid Host header" =
  wrong upstream host.
- Derived data (H2H, venues, team form) comes from the shared schedule window in
  `getApiFixtureRange`; keep callers on the same window so they share cache entries.
- Never guess result attribution; unattributable results are counted separately.

## User rules (from CLAUDE.md and prior feedback)

- Never push or commit — the user does git themselves.
- Read `.claude/skills/design-standards.md` before any UI change.
- SCSS Modules only; no Tailwind; no inline styles; mobile first.
- Few comments: only a non-obvious *why*, one or two lines.
- Banned: accent bars beside headings; tiny muted "View all"/"More →" links; explanatory or
  data-provenance captions beside labels and page subtitles describing the page.
- Don't touch production services (Vercel, Cloudflare, etc.) without explicit instruction.
- Delete any test files you create for a task; keep these four memory files.

## Known bugs / blockers

- Functional bugs from the 2026-09-29 audit are in TODO.md (High rows: scorecard clipping on phones, duplicate alerts → duplicate notifications). Documentation drift also listed there (README workspace commands, CricLive leftovers, tracked PWA build artifact).
- `reasoning-operating-manual.md` is referenced in the user's agent instructions but does not exist
  in the repo.

## Recently completed (committed)

Live series tiles; automation engine background support + event-key tracking; venue handling +
venue text utility; insights/alert refactor; players directory + series components refactor.
