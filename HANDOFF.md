# Handoff — PulseCrease

Last updated: 2026-10-02. Read this, then ARCHITECTURE.md, PROJECT_STATUS.md and TODO.md.
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
live feed omits (`hooks/useFixturesAhead`, `getCrexFixturesAhead`); new `T10` match format
(`n % 4 == 3` without `hb`, crex `ft` 4) plus a Fixtures T10 tab; pulse window counts 18 *legal*
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
wicket number) from crex's `w` rows and `keyMoments` matches the fall of wickets by batter id —
no prose/surname search (it hid wickets whose batter was named as a fielder elsewhere and
doubled others); every wicket is the short "out for N (B) · TEAM r/w" line. Scorecard opens on
the innings in progress (`phase === 'CURRENT'`, else last batted) until the reader picks one.
Series list: one CSS subgrid across rows at tablet+ (format column ≥120px incl. row padding,
chips nowrap); skeleton rows (`div`) included.

Uncommitted (2026-10-02, stumps rules — supersedes "Live tab includes stumps" above): one rule,
`isLiveNow` / `isAtStumps` in `lib/matchState.ts`. A multi-day match at stumps (note kind STUMPS,
from crex's `$l` status code first) is out of Home Live/count/strip/stage and Insights, and
appears in All only; search tags it "Stumps" (own section on /search). Breaks and delays stay
Live. Play resuming clears the note (stale-stoppage logic) and it returns to Live on the next
poll. Match centre at stumps: "Stumps · Day N", "Day N+1 starts <local time>" from match info
`nt` (`MatchConditions.nextPlay`; omitted when absent), no tab dot, no batting mark. A Test
side's earlier innings render small above the current one on phones (`ScoreParts.earlier`).
Finishing (incl. a last-day draw) is crex's own status/result; nothing is inferred from stumps.

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
