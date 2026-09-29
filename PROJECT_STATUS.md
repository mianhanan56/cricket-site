# Project Status — PulseCrease

Last updated: 2026-09-29

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

## In progress (uncommitted)

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

- `npm test` (frontend): **77/77 pass** (2026-09-29).
- `tsc --noEmit`: frontend clean, worker clean (2026-09-29).
- In-progress UI changes not yet visually verified in a browser by an agent.

## Build status

Production `next build` not run this session (must run from an isolated copy, see HANDOFF.md).

## Deployment status

Frontend on Vercel (`pulsecrease.vercel.app`), Worker on Cloudflare. User deploys/pushes manually.

## Recent progress

- 2026-09-29: Created project memory files (HANDOFF, PROJECT_STATUS, ARCHITECTURE, TODO).
- 2026-09-29: Removed stale backend/database lines from `.claude/CLAUDE.md`.
- Last commits: live series tiles; automation engine background support + event keys; venue
  handling + venue text utility; insights/alert refactor; players directory + series refactor.
