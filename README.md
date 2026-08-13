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
| `/matches/[id]` | Worker `/matches/live` + `/match/scorecard` + `/match/commentary` | 5s, polled while live |
| `/rankings` | Worker `/rankings/players` × 15 lists + `/mapping` | ISR 1h |
| `/search` | client-side over the match list | 60s corpus cache |

See [worker-crex/README.md](worker-crex/README.md) for the route allowlist, the
crex wire format, and how to add an endpoint.

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
