# PulseCrease

Cricket live-scores platform — a CREX.com-style clone.

There is no backend and no database. Every page's data comes live from crex.com's
own internal APIs, reached through a Cloudflare Worker that allowlists the
endpoints, caches at the edge and adds CORS. The Next.js app talks only to that
Worker.

## Stack

| Layer      | Tech                                                |
| ---------- | --------------------------------------------------- |
| Frontend   | Next.js 14 (App Router) · TypeScript · SCSS Modules |
| Data       | Cloudflare Workers fronting crex.com                |
| Cache      | Cloudflare edge cache · Next.js ISR                 |
| Monorepo   | npm workspaces                                      |

## Structure

```
cricket/
├── frontend/     Next.js 14 app (App Router) — the whole application
├── worker-crex/  Worker fronting crex.com — every route the app reads
└── backend/      Retired. Express + Prisma + Postgres, no longer used by anything
```

## Getting started

```bash
npm install
npm run dev --workspace=@crex/frontend      # :3000
```

That is the entire setup. No database, no migrations, no seeding, no secrets —
the frontend defaults to the deployed Worker.

To develop against a local Worker instead:

```bash
npm run dev --workspace=@crex/worker-crex   # :8788
# then in frontend/.env:
NEXT_PUBLIC_CREX_WORKER_URL=http://localhost:8788
```

## Where each page gets its data

| Page | Source | Freshness |
| ---- | ------ | --------- |
| `/` | Worker `/matches/live`, polled client-side | 15s |
| `/fixtures` | Worker `/matches/live`, upcoming slice | ISR 300s |
| `/matches/[id]` | Worker `/matches/live` + `/match/scorecard` + `/match/commentary` + the schedule corpus (head-to-head) | 5s, polled while live |
| `/series/[id]` | Worker `/series/matches` + `/series/table` + `/matches/live` | ISR 300s |
| `/teams/[key]` | Worker `/team/matches` + `/series/squads` + `/rankings` + the schedule corpus | ISR 1800s |
| `/venues/[key]` | the schedule corpus only | ISR 1800s |
| `/players/[id]` | Worker `/player/overview` | ISR 1h |
| `/rankings` | Worker `/rankings/players` × 15 lists + `/mapping` | ISR 1h |
| `/search` | client-side over the match list | 60s corpus cache |

See [worker-crex/README.md](worker-crex/README.md) for the route allowlist, the
crex wire format, and how to add an endpoint.

## The schedule corpus

Three of the pages above — head-to-head, team form, and everything on a venue
page — are **derived**, not fetched. crex publishes no head-to-head endpoint, no
venue endpoint and no team-results endpoint. What it does publish is a schedule
whose finished rows carry both sides, both scores and a result *sentence*, and
that sentence is enough:

- `"GAW Won by 7 wickets"` — GAW won, and they batted second.
- `"IND won by 165 runs"` — India won, and they batted first.

So `getCrexFixtureRange` in [`frontend/lib/crex.ts`](frontend/lib/crex.ts) holds a
window of the schedule (about seven weeks back, two ahead) and
[`lib/headToHead.ts`](frontend/lib/headToHead.ts) and
[`lib/venues.ts`](frontend/lib/venues.ts) read records out of it. Every caller
uses the same window on purpose, so they all share the same cache entries.

Two consequences, both deliberate:

1. **Every derived figure is window-bounded, and every page says so.** A venue's
   chase/defend split describes those weeks, not the ground's history, and the
   page prints that sentence rather than implying a career record.
2. **A result the sentence cannot attribute is counted separately, never
   guessed.** `attributeResult` matches a side's full name and short name exactly;
   loose matching would file "St Kitts & Nevis Patriots won by 5 wickets" as a win
   for St Lucia. So a head-to-head reads "8 meetings, 3–2, 3 unattributed" rather
   than a tidy 3–2 that is quietly wrong.

There is no average first-innings score anywhere, for the same kind of reason: the
schedule gives `s1`/`s2` by *team*, not by innings, so which side batted first is
only recoverable from the result wording — and only on matches that produced one.
An average over that subset is a number with a silent asterisk.

## Environment variables

All optional — every one has a working default.

| Variable | Description |
| -------- | ----------- |
| `NEXT_PUBLIC_CREX_WORKER_URL` | crex Worker base URL. Defaults to the deployed one. |
| `NEXT_PUBLIC_CRICKET_WORKER_URL` | CricLive Worker base URL (used by `lib/cricketLive.ts`). |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL, for `sitemap.xml`. |

## Rankings

Live from crex, like everything else — nothing to maintain. `frontend/data/rankings.json`
is a bundled snapshot used only as a fallback when crex is unreachable; when it is
in play, the page caption says `as of <date>` so the staleness is visible. Refresh
it occasionally (and bump `asOf`) so the floor does not drift too far.

## Deployment

Frontend to **Vercel** (root directory `frontend`, preset auto-detected), Worker
via `wrangler deploy`. Nothing else to deploy.

Add your production domain to `ALLOWED_ORIGINS` in `worker-crex/wrangler.toml` —
the client-side polling on the home page and in search is subject to CORS.

## What was removed, and what it cost

The Express + Postgres backend served rankings, search and player profiles. It
was retired because the crex Worker covers live scores, fixtures and match detail
with live data, while the backend's three pages were serving hand-seeded rows
from a database that nothing kept up to date.

Two features went with it:

- **Player profiles** (`/player/[id]`) — crex has an endpoint
  (`oc/player/getPlayerInfo`) but its payload shape is not yet known, so there is
  no data source. The route is deleted.
- **Player search** — crex exposes no search endpoint. Search now covers teams,
  series and venues, and resolves to matches.

Also gone: the Socket.io live-score push, whose server had already been dropped
in an earlier move to Workers. Live matches poll the Worker instead.

## Conventions

- TypeScript everywhere; SCSS Modules for styles (no Tailwind, no inline styles).
- Server Components by default in Next.js; `'use client'` only when needed.
- Shared interfaces live in `frontend/types/index.ts`.
- Mobile-first SCSS using `min-width` breakpoints from `_variables.scss`.
