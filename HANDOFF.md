# Handoff — PulseCrease

Last updated: 2026-09-29. Read this, then ARCHITECTURE.md, PROJECT_STATUS.md and TODO.md.
If anything conflicts, trust: source code → ARCHITECTURE.md → PROJECT_STATUS.md → HANDOFF.md → TODO.md.

## Project overview

PulseCrease is a live cricket site (scores, match telemetry, momentum, series stats, client-side
alerts). Next.js 14 App Router + TypeScript + SCSS Modules in `frontend/`, deployed to Vercel.
All data comes from crex.com's undocumented internal APIs through a Cloudflare Worker in
`worker-crex/`. **No backend, no database** — ignore any mention of Express/Prisma/Neon.

## Current objective

A UI polish pass is sitting uncommitted on `main` (34 modified files + 3 new):

- `components/layout/BottomNav.tsx` — dock is now Matches / Series / Rankings / Fixtures + More
  (Teams, Players, Insights, My Cricket, Alerts). Search button and theme row removed from dock.
- `components/layout/Navbar.tsx`, `ThemeToggle.tsx` — toggle always shown; `withLabel` variant removed.
- `components/layout/Footer.tsx` — `docked` links hidden on phones.
- `scss/component.scss` — new `page-end` mixin; applied across ~15 page modules.
- `components/ui/Section.module.scss` — heading count is a pill.
- `app/teams/TeamsDirectory.tsx` + `teams.module.scss` — rank chip restyle.
- `components/match/LivePanel.tsx` — "Live pulse" block moved after "At the crease".
- Series stats: `SeriesLeaders.tsx` drops the fifties/hundreds footer links and accepts `children`;
  `app/series/[id]/page.tsx` streams `<SeriesMilestones>` (new) inside `<Suspense>`;
  `MilestoneLeaders.tsx` (new, client) toggles Most fifties / Most hundreds via `Segmented`.
  `lib/crex.ts` split `getCrexSeriesStatTable` into `seriesStatRows` + `rankStat` and added
  `getCrexSeriesStatTables` (several kinds, one read of the cards).
- `next.config.js` — `experimental.staleTimes { dynamic: 0, static: 30 }`.

State: typechecks clean, 77/77 tests pass. Not yet visually verified by an agent.

## Recommended next step

Visually verify the in-progress changes at phone and desktop widths (from an isolated copy — see
below), in particular that search is still reachable on phones and the milestones board renders
for a series with completed matches. Then hand back to the user to commit.

## Environment setup

```bash
cd frontend && npm install && npm run dev       # :3005, uses the deployed Worker by default
cd worker-crex && npm install && npm run dev    # :8788 local Worker (optional)
cd frontend && npm run local                    # frontend against local Worker (.env.wrangler.local)
```

- There is **no root package.json**; the README's `--workspace` commands don't work from root.
- Env vars are all optional (`NEXT_PUBLIC_CREX_WORKER_URL`, `NEXT_PUBLIC_SITE_URL`). Never put a
  localhost Worker URL in `.env.local` — production builds throw on it by design.
- Worker CORS allows only `http://localhost:3005` and `https://pulsecrease.vercel.app`.

## Useful commands

```bash
cd frontend && npm test                 # node:test via tsx, offline
cd frontend && npx tsc --noEmit -p .
cd frontend && npm run check:live       # audits today's live feed (network)
cd worker-crex && npm run typecheck
```

## Gotchas another agent must know

- **Don't run `next build` or a second `next dev` inside `frontend/`.** The user usually has
  `next dev` running and both share `.next`, which corrupts it (routes flip 200/404, unstyled
  pages). Verify production builds from a copy: rsync `frontend/` (minus `.next`, `node_modules`)
  into a scratch dir, symlink `node_modules`, build/start there on another port. Headless checks on
  other ports need CORS disabled in the browser.
- Dev server runs on port 3005 (3000 is used by an unrelated app on this machine).
- crex wire format is single-letter keys and changes without notice; if something breaks, probe
  the Worker route first (`worker-crex/scripts/probe.sh`). "Invalid Host header" = wrong upstream host.
- Derived data (H2H, venues, team form) comes from the shared schedule window in
  `getCrexFixtureRange`; keep callers on the same window so they share cache entries.
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

- No known functional bugs. Documentation drift listed in TODO.md (README workspace commands, CricLive leftovers, tracked PWA build artifact).
- `reasoning-operating-manual.md` is referenced in the user's agent instructions but does not exist
  in the repo.

## Recently completed (committed)

Live series tiles; automation engine background support + event-key tracking; venue handling +
venue text utility; insights/alert refactor; players directory + series components refactor.
