# Project Status — PulseCrease

Last updated: 2026-09-30

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

## Pending

See TODO.md.

## Testing status

- `npm test` (frontend): **107/107 pass** (2026-09-30).
- `tsc --noEmit`: frontend clean, worker clean (2026-09-30). Lint clean.
- UI pass visually verified at 320–1440px from an isolated copy; search reachable from the header on phones (2026-09-29).

## Build status

Production `next build` passes from an isolated copy (2026-09-30).

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
