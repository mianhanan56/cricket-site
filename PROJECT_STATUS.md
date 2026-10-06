# Project Status — PulseCrease

Last updated: 2026-10-02

## Current milestone

UI polish pass on navigation, series stats and page spacing (uncommitted working tree on `main`).

## Completed features

- Worker-only architecture (backend + DB retired); `worker-crex` with 15 allowlisted routes.
- Home: live hero, next-up hero, score ticker, upcoming rail, results, My Cricket band.
- Match centre: score header, live panel (crease, pulse, ball timeline), scorecard, commentary
  (scroll-sentinel paging), momentum worm, win probability, head-to-head, pre-start info.
- Fixtures with calendar and filters; series list/detail with points table, leaders, stat pages,
  live series tiles; team, venue, player profiles; players/teams directories; rankings (15 ICC lists).
- Search (client-side + `/api/search-index`); insights view; follows; automations + notifications
  (background/system-tray support, event-key dedup); dark/light theme; PWA.

## Recently completed (committed in 68cd364 / cf291e1)

- Phone dock restructured: Matches / Series / Rankings / Fixtures + More sheet; search and theme
  toggle removed from dock; theme toggle always visible in navbar.
- Footer hides links already in the dock (`docked` flag).
- `page-end` mixin for consistent bottom spacing across pages.
- Section heading count rendered as a pill; teams directory rank chip restyled.
- Live panel: "Live pulse" block moved after the crease block.
- Series stats tab: fifties/hundreds moved from footer links into a streamed `SeriesMilestones`
  board (new `MilestoneLeaders` + `SeriesMilestones`), backed by new `getCrexSeriesStatTables`.
- `experimental.staleTimes` in `next.config.js`.

## Recently completed (uncommitted, 2026-09-30)

- Series name on match tiles links to the series detail page (cover-link pattern in `MatchTile`,
  hit-tested in headless Chrome: series name → `/series/[id]`, rest of tile → `/matches/[id]`).

## Recently completed (uncommitted, 2026-10-02)

- Player page "Series performance": pick a series (searchable, newest first, Load older series),
  filter by format, see batting (runs, inns, avg, SR, HS, 50s, 100s, not outs) and bowling
  (wickets, overs, runs, econ, avg, best, 4W, 5W) for that series plus every innings linked to its
  match. New Worker route `/player/matches` — **needs `npm run deploy` in worker-crex**; until then
  the section is simply absent in production.

## Recently completed (uncommitted, 2026-10-02, data consistency)

- Live counts agree across Home tab, ticker and Insights; stopped states named on the ticker.
- Home series cards and Upcoming/Today list use the same sources as /series and /fixtures.
- T10 is its own format (label, 10-over projections, Fixtures tab).
- Pulse label and figures share one denominator (legal balls).
- Ireland in the Teams directory (full Test team list).
- No-ball/wide notation consistent between the ball strip and over cards.
- Key moments: score on every wicket line; a same-surname wicket no longer hidden.

## Recently completed (uncommitted, 2026-10-02, design/usability)

- Home stage no longer swaps matches on a re-rank; no clipped team codes, scores or names; whole overs only on the hero strip.
- Nav, search focus, match tabs, Insights first paint, Kohli bowling strip, series readout, light-mode lime marks, phone status row and hero tiles, `undefined` class names, score-strip labels.
- Verified on a production build (isolated copy, :3006, CDP-driven Chrome): tabs keep position across 5 clicks at 1280 and 390; search pick → `/teams/VJ` with body focused; no `undefined` classes on /, /insights, /matches/13Q7, /series; status row 286/286 at 320; Insights cards in the HTML.

## Recently completed (uncommitted, 2026-10-02, follow-up)

- Key moments on IND v SL list all 17 wickets once each, with scores (was: 10th twice, 8th/9th as prose, IND 1st/2nd/6th missing).
- EMR v FUJ scorecard opens on "EMR · Inn 1" (was FUJ's empty innings).
- Series chips on one line; rows and sections share columns at 800 and 1280; skeleton matches.

## Recently completed (uncommitted, 2026-10-02, stumps rules)

- Stumps out of every live surface together; breaks/delays stay Live. Verified live (ROI v J&K at Day 2 stumps): Home Live 1 / All 55 (Domestic 1/40, International 0/15), ROI absent from Live, strip, stage and Insights, present in All with a Stumps chip; `?tab=live` direct load the same; search shows a Stumps section. Match centre: "Stumps · Day 2 / Day 3 starts Sat 3 Oct, 9:00 am" (UTC+5 reader), no tab dot or batting mark; 320–1280 no overlap.
- Not observable today, covered by logic/tests: Day 3 first ball (note clears on a moving score), the match finishing, lunch/tea/rain staying Live (unit tests).

## Pending

See TODO.md.

## Testing status

- `npm test` (frontend): **132/132 pass** (2026-10-02; +4 for T10 decoding, legal-ball pulse window, key-moment scores and surname dedupe).
- Data-consistency fixes verified on a production build from an isolated copy against live data (2026-10-02): Home Live 3 = ticker 3 (ROI v J&K shows "Stumps"); Home Today 4 = Fixtures Today 4 (same rows); Home series cards equal /series (WI tour 27 Sept → 17 Oct, 2/8); Teams Men 12 incl. Ireland; 14MJ header "17th T10"; pulse "3 in 8 · Last 8 balls"; 360px clean on Home and Test team rankings.
- Series performance: decoded/summed figures equal crex's own totals on 471 series×format groups (36 players incl. Tests, The Hundred, county); 320–1280px no overflow; select → format → load older → match → Back → reload flow verified (2026-10-02).
- `tsc --noEmit`: frontend clean, worker clean (2026-10-02). Lint clean.
- UI pass visually verified at 320–1440px from an isolated copy; search reachable from the header on phones (2026-09-29).

## Build status

Production `next build` passes from an isolated copy with no warnings (2026-10-02, after the code-quality pass).

## Deployment status

Frontend on Vercel (`pulsecrease.vercel.app`), Worker on Cloudflare. User deploys/pushes manually.

## Recent progress

- 2026-09-29: Created project memory files (HANDOFF, PROJECT_STATUS, ARCHITECTURE, TODO).
- 2026-09-29: Removed stale backend/database lines from `.claude/CLAUDE.md`.
- 2026-09-29: Toasts now stack top-right under the navbar on tablet/desktop (were bottom-right); uncommitted.
- 2026-09-29: Removed the "Last ball Xs ago" stamp from the home live hero (still shown in the match center ScoreHeader); uncommitted.
- Last commits: live series tiles; automation engine background support + event keys; venue
  handling + venue text utility; insights/alert refactor; players directory + series refactor.
- 2026-09-29: Strict UX / mobile audit of production (38 URLs × 11 widths + interaction flows). No code changed; findings queued in TODO.md.
- 2026-09-29: Phone filter sheet (`FilterSheet`) on Home, Fixtures, Series, Rankings, Players and Commentary; desktop filters unchanged (verified against production at 768–1440). Uncommitted.
- 2026-09-30: Live WebSocket layer: Worker Durable Object hub (`/live`), shared frontend socket, socket-fed list/match/alert stores with polling fallback, entry/visibility/reconnect revalidation, back/forward `router.refresh()`, per-event alert dedupe, "Reconnecting" label in the match header when API and socket are both down. Verified end to end (local hub + production build); Worker needs `npm run deploy` (adds the `v1` DO migration). Uncommitted.
- 2026-09-30: Home tabs are Live / Upcoming / Results / All (Overview removed; with no `?tab=` the page opens on Live, else Upcoming, else All, fixed once the feed answers). `Segmented` scrolls its active option into view. Alerts: one alert holds several moments (legacy single-trigger alerts migrate on read), Select all with a mixed state, current team/series chips under the picker, Edit (same creator, "Save changes") and Delete (confirm dialog) on each card; compact card (moments summary, who, delivery). Verified on a production build at 320–1440. Uncommitted.
- 2026-09-30: Advanced alert builder removed (New alert already covers every working option). Timeline line removed from commentary, key moments and the upcoming list outside Home Upcoming / Fixtures (`UpcomingRail timeline` prop). Scorecard: all columns fit on phones, row dividers fixed (batter cell no longer `display:flex`), Playing XI rendered as the batting table. Key moments add scorecard fall-of-wickets the feed page no longer carries (`lib/keyMoments.ts`). Mobile pass: podium, insight card score clipping (`Ticker` never shrinks), series next-match wrap, fixture times, My Cricket picker, sm segmented tap height, empty-state padding, active tab kept in view (`useActiveInView`). 25 routes × 12 widths clean. Uncommitted.
- 2026-09-30: Final mobile QA: series strip split per format; 16px inputs on phones (no iOS focus zoom) in Teams filter and alert picker; 34px series match nodes on phones; `TableScroll` fades the edge with hidden columns; series stat tables keep the headline figure in view on phones. User flow (20 steps) passed at 320/360/390/414/480; 27 routes × 12 widths clean. Worker hub confirmed live in production (handshake from pulsecrease.vercel.app).
- 2026-09-30: Fixtures range: `getCrexFixtureSchedule` reads /fixtures pages in batches of 8 until 30 days ahead are covered (≈24 pages → Sep 30–Nov 15, 473 fixtures, was 12 pages ≈ 2 weeks); the list walks every day (was capped at the first 7 fixture days); the read's partial last day is held back (`coveredUntil`). Day headings in UpcomingRail fixed for UTC+12 and beyond. Uncommitted.
- 2026-09-30: Context/discoverability pass: `formats[]` on series summaries + `lib/seriesFormat.ts` ("ODI and Test series", card chip "ODI + T20"); `ViewAllCue` on series leader figures and Top performers cards; series side column no longer shows Top of table; match page has a Stats tab (series leaders board, fetched with the points table via `getCrexSeriesLeaders`); match header shows a live stoppage in its centre, and reads drinks/lunch/tea off the newest commentary note after the last ball (`lib/feedBreak.ts`, tested) since /matches/live only latches break codes; units on leader figures; team page results name the opponent (`sides` on HeadToHeadMatch), Upcoming/Results expand in place, form caption counts the strip; venue results name both sides; player ICC rank tiles link to their rankings list; "Last ball" label on the match header dial; team chips read "TEST #1". 19 routes × 12 widths clean. Uncommitted.
- 2026-10-02: Code-quality pass (no feature or design change). Removed verified-dead code (`FilterSelect`, `compact` variants of `UpcomingRail`/`ResultList`, `getCrexMatchSquads`, `getCrexCommentary`, `formatProgress`, `matchSublabel`, `pausedWord`, dead SCSS). One home each for `ordinal`/`plural` (`lib/text.ts`), fetch deadlines (`lib/timeout.ts`, now also on `/health` and the search index, with a Safari < 17.4 fallback), `SITE_URL` (`lib/site.ts`; production robots/sitemap were naming localhost), `isChaseTight`, format labels and `TeamCrest`. Fixes: history/squads hooks reset on match change; alert feed watchers follow scope edits; stored alerts validated field by field; `seriesSpan` year test in UTC; scorecard `!important`s replaced by specificity (computed styles identical); BackButton spacing no longer depends on stylesheet order. Worker: upstream-failure logs, hub skips unparseable stored topics. Docs: README/worker README/ARCHITECTURE corrected. Regression: 22 routes × 12 widths against a HEAD build, no overflow; differences were live data plus the BackButton spacing (now as authored). Uncommitted.
