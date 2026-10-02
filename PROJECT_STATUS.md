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

## Pending

See TODO.md.

## Testing status

- `npm test` (frontend): **111/111 pass** (2026-10-02).
- Series performance: decoded/summed figures equal crex's own totals on 471 series×format groups (36 players incl. Tests, The Hundred, county); 320–1280px no overflow; select → format → load older → match → Back → reload flow verified (2026-10-02).
- `tsc --noEmit`: frontend clean, worker clean (2026-09-30). Lint clean.
- UI pass visually verified at 320–1440px from an isolated copy; search reachable from the header on phones (2026-09-29).

## Build status

Production `next build` passes from an isolated copy (2026-10-02).

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
