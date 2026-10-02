# PulseCrease

Live cricket intelligence — scores, match telemetry, momentum, and alerts that fire on their own.

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
| Live       | Durable Object WebSocket hub, HTTP polling fallback |

## Structure

```
cricket/
├── frontend/     Next.js 14 app (App Router) — the whole application
└── worker-crex/  Worker fronting crex.com — every route the app reads, plus the live hub
```

There is no root `package.json`; run commands inside `frontend/` or `worker-crex/`.

## Getting started

```bash
cd frontend && npm install && npm run dev     # :3005
```

That is the entire setup. No database, no migrations, no seeding, no secrets —
the frontend defaults to the deployed Worker.

To develop against a local Worker instead:

```bash
cd worker-crex && npm install && npm run dev  # :8788
cd frontend && npm run local                  # reads .env.wrangler.local
```

Never put a localhost Worker URL in `frontend/.env.local`: it is inlined into the
client bundle, and a production build refuses it.

## Where each page gets its data

| Page | Source | Freshness |
| ---- | ------ | --------- |
| `/` | Worker `/matches/live`, polled client-side | 15s |
| `/fixtures` | Worker `/matches/live`, upcoming slice | ISR 300s |
| `/matches/[id]` | Worker `/matches/live` + `/match/scorecard` + `/match/commentary` + the schedule corpus (head-to-head) | 5s, polled while live |
| `/series/[id]` | Worker `/series/matches` + `/series/table` + `/matches/live` | ISR 300s |
| `/teams/[key]` | Worker `/team/matches` + `/series/squads` + `/rankings` + the schedule corpus | ISR 1800s |
| `/venues/[key]` | the schedule corpus only | ISR 1800s |
| `/players/[id]` | Worker `/player/overview`; series performance from `/player/matches` | ISR 1h |
| `/rankings` | Worker `/rankings/players` × 15 lists + `/mapping` | ISR 1h |
| `/search` | client-side over the match list + `/api/search-index` | 60s corpus cache |
| `/teams`, `/players` | the live ICC ranking lists (`lib/directory.ts`) | ISR 1h |
| `/insights` | Worker `/matches/live`, plus each visible live match's card and feed | 2s list · 15s per card |
| `/automations`, `/my` | the reader's own rules and follows, in `localStorage` | — |
| `/api/search-index` | the live ICC ranking lists — players and teams for search | ISR 1h |

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
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL for metadata, `robots.txt` and `sitemap.xml`. Falls back to Vercel's production domain, then localhost. |
| `NEXT_PUBLIC_LIVE_WS` | Set to `off` to disable the live WebSocket (polling only). |
| `NEXT_PUBLIC_LIVE_WS_URL` | Live hub URL. Defaults to the Worker's `/live`. |

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

## History

An Express + Postgres backend once served rankings, search and player profiles
from hand-seeded rows. It was retired; every page now reads crex through the
Worker. Player profiles come from `/player/overview`, player search from the ICC
ranking lists (`/api/search-index`), and live scores from the Worker's WebSocket
hub with HTTP polling underneath.

## Conventions

- TypeScript everywhere; SCSS Modules for styles (no Tailwind, no inline styles).
- Server Components by default in Next.js; `'use client'` only when needed.
- Shared interfaces live in `frontend/types/index.ts`.
- Mobile-first SCSS using `min-width` breakpoints from `scss/component.scss`.
- Every colour is a token in `scss/component.scss` backed by a custom property in
  `scss/global.scss`; dark is the default theme, `data-theme="light"` the other.
- The match list is one shared poll (`useCrexMatches`) — every subscriber reads the
  same snapshot, and it runs at the fastest interval any of them asks for.

## Automations

Rules live in the browser (`lib/automations.ts`) and are evaluated by
`AutomationEngine` against consecutive snapshots of the live feed: a match
starting, a wicket, a tight chase, a stoppage and a result come off the match
list; sixes, fours and 50/100 milestones off the ball feed of in-scope matches.
Nothing fires on the first snapshot, and a shared ledger stops two open tabs
delivering the same event twice. Alerts reach the notification center and,
with permission, the system tray — while a PulseCrease tab is open.
