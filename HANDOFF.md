# Handoff — PulseCrease

Last updated: 2026-09-30. Read this, then ARCHITECTURE.md, PROJECT_STATUS.md and TODO.md.
If anything conflicts, trust: source code → ARCHITECTURE.md → PROJECT_STATUS.md → HANDOFF.md → TODO.md.

## Project overview

PulseCrease is a live cricket site (scores, match telemetry, momentum, series stats, client-side
alerts). Next.js 14 App Router + TypeScript + SCSS Modules in `frontend/`, deployed to Vercel.
All data comes from crex.com's undocumented internal APIs through a Cloudflare Worker in
`worker-crex/`. **No backend, no database** — ignore any mention of Express/Prisma/Neon.

## Current objective

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

## Recommended next step

Wait for the user's pick from TODO.md. Start with the High rows: scorecard table clipping on
phones, removing the Advanced alert builder plus alert/notification dedupe, the series stat value
column, the insights score clipping, and team-page results.

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

- Functional bugs from the 2026-09-29 audit are in TODO.md (High rows: scorecard clipping on phones, duplicate alerts → duplicate notifications). Documentation drift also listed there (README workspace commands, CricLive leftovers, tracked PWA build artifact).
- `reasoning-operating-manual.md` is referenced in the user's agent instructions but does not exist
  in the repo.

## Recently completed (committed)

Live series tiles; automation engine background support + event-key tracking; venue handling +
venue text utility; insights/alert refactor; players directory + series components refactor.
