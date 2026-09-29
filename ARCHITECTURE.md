# Architecture — PulseCrease

Live cricket site: scores, match telemetry, momentum, series stats and client-side alerts.
Last verified against source: 2026-09-29.

## System overview

```
Browser ──(client polling)──┐
                            ▼
Next.js 14 (Vercel) ──SSR/ISR fetch──▶ Cloudflare Worker `worker-crex` ──▶ crex.com internal APIs
                                        (allowlist + edge cache + CORS)     (5 upstream hosts)
```

- **There is no backend and no database.** The old Express + Prisma + Postgres (Neon) backend
  was retired and its directory deleted.
- Every piece of data comes from crex.com's undocumented internal APIs, reached only through
  the Worker. The frontend never calls crex directly.
- User state (follows, alert rules, notifications, theme) lives in the browser (`localStorage`).

## Folder structure

```
cricket/
├── .claude/                 CLAUDE.md (project rules) + skills/design-standards.md
├── README.md                Canonical overview; data-source table per page
├── frontend/                Next.js 14 App Router app — the whole application
│   ├── app/                 Routes (see "Pages" below); page.tsx + <name>.module.scss per route
│   ├── components/          Grouped by domain: automations, brand, fixtures, follow, home,
│   │                        insights, layout, live, match, notifications, player, rankings,
│   │                        search, series, ui
│   ├── hooks/               useCrexMatches (shared live poll), useQueryTabs (URL-synced tabs)
│   ├── lib/                 Data client + pure domain logic (see "Modules")
│   ├── data/                rankings.json — bundled fallback snapshot only
│   ├── scss/                component.scss (tokens/mixins), global.scss (custom props, resets), main.scss
│   ├── tests/               node:test unit suites (run via tsx)
│   ├── scripts/check-live.mts  Network audit of today's live feed (not part of npm test)
│   ├── types/index.ts       All shared interfaces
│   └── next.config.js       PWA (next-pwa), image host allowlist, staleTimes, prod URL guard
└── worker-crex/             Cloudflare Worker fronting crex.com
    ├── src/index.ts         Request handling, CORS, cache, SWR
    ├── src/routes.ts        Route allowlist: upstream, method translation, typed params, TTLs
    ├── src/upstreams.ts     The five crex hosts
    ├── scripts/probe.sh     Manual endpoint probing
    └── wrangler.toml        Name `pulsecrease-crex`, dev port 8788, ALLOWED_ORIGINS
```

There is **no root `package.json`**, despite the README describing npm workspaces — run
commands inside `frontend/` or `worker-crex/`.

## Worker (`worker-crex`)

- Every route is a plain **GET** with query params; the Worker translates to the upstream's
  POST/JSON where needed so responses stay cacheable.
- Params are typed and enum-bounded; unknown params are dropped (keeps cache keys stable),
  bad values return 400 with the permitted set.
- Sends `Origin`/`Referer: crex.com` (their hosts 400 with "Invalid Host header" otherwise).
  Policy: no bot-protection circumvention — if crex adds a challenge, stop.
- No secrets, no KV. The allowlist is what keeps it from being an open relay.
- Upstream hosts: `oc` (oc.crickapi.com), `stats`, `content` (commentary), `news`,
  `php` (api.goscorer.com — live match list). Wrong host ⇒ "Invalid Host header".
- Routes (TTL): `/matches/live` 15s · `/rankings` 1h · `/rankings/players` 1h · `/mapping` 6h ·
  `/fixtures` 5m · `/news/topics` 15m · `/match/info` 5m · `/match/scorecard` · `/match/commentary` ·
  `/player/overview` 1h · `/series/matches` 5m · `/series/table` 5m · `/series/squads` 1h ·
  `/series/overview` 5m · `/team/matches` 5m. Full detail and wire formats: `worker-crex/README.md`
  and `worker-crex/src/routes.ts`.
- Responses use single-letter keys; team/series/venue/player f_keys resolve through `/mapping`.

## Frontend modules (`frontend/lib`)

| Module | Responsibility |
| --- | --- |
| `crex.ts` (~5.1k lines) | The data client. Every Worker fetch, decoding crex's wire format into `types/index.ts` shapes: match list, scorecard, commentary/feed, fixtures, series (schedule, table, overview, leaders, stat tables, squads), team profile, player profile, rankings, mapping/name resolution, `attributeResult`. |
| `headToHead.ts`, `venues.ts`, `venue.ts` | Records **derived** from the schedule corpus (`getCrexFixtureRange`) — crex has no H2H/venue/team-results endpoint. |
| `matchState.ts`, `liveScore.ts`, `innings.ts`, `situation.ts`, `crease.ts`, `overs.ts`, `balls.ts` | Match state machine, innings reading, one-line situation text, crease context, ball parsing. |
| `momentum.ts`, `pulse.ts`, `telemetry.ts` | Worm graph points, live pulse readings, chase telemetry. |
| `automations.ts`, `notifications.ts`, `follows.ts`, `persisted.ts` | Browser-stored rules, alert ledger/keys, follows, localStorage wrapper. |
| `rankings.ts`, `directory.ts`, `playersDirectory.ts` | Rankings with bundled fallback; team/player directories built from ICC ranking lists. |
| `search.ts`, `searchIndex.ts` | Client-side search over matches + `/api/search-index`. |
| `tabs.ts`, `queryParams.ts`, `uiState.ts`, `navigationDepth.ts` | URL tab vocabularies/validation, overlay state, back-button depth. |
| `matchType.ts`, `featured.ts`, `fixtureDays.ts`, `datetime.ts`, `relativeTime.ts` | Classification, featured match choice, calendar keys, time formatting. |

`hooks/useCrexMatches.ts` is **one shared poll** of the match list: every subscriber reads the
same snapshot and it runs at the fastest interval any subscriber requests.

## Pages (`frontend/app`)

`/` home · `/fixtures` · `/matches/[id]` · `/series` · `/series/[id]` (tabs incl. stats) ·
`/series/[id]/stats/[kind]` · `/teams` · `/teams/[key]` · `/venues/[key]` · `/players` ·
`/players/[id]` · `/rankings` · `/search` · `/insights` · `/automations` · `/my` ·
`/api/search-index` · `sitemap.ts` · `robots.ts`. Data source and freshness per page: README table.

## Caching / freshness

Three layers: Worker edge TTL (per route) → Next.js per-fetch `revalidate` (ISR) → client polling
for live views (home 15s, match detail 5s while live, insights 2s list / 15s per card).
`next.config.js` sets `experimental.staleTimes { dynamic: 0, static: 30 }` so tab switches ask
the server again; per-fetch revalidate still decides whether crex is hit.
PWA service worker uses **NetworkFirst** for the Worker origin (SWR would render the previous
poll's body). The origin pattern must be a RegExp — Workbox serialises matchers with `toString()`.

## Automations

Rules in `lib/automations.ts`, evaluated by `components/automations/AutomationEngine.tsx` against
consecutive live snapshots (match start, wicket, tight chase, stoppage, result from the list;
sixes/fours/50/100 from ball feeds). Nothing fires on the first snapshot; a shared ledger dedupes
across tabs. Delivered to the notification center and, with permission, the system tray — only
while a tab is open.

## Styling conventions

- SCSS Modules only; **no Tailwind, no inline styles**. Mobile-first, `min-width` breakpoints.
- Tokens/mixins in `scss/component.scss` (colors map to CSS custom properties in `global.scss`);
  dark is default, `data-theme="light"` the alternative. `sassOptions.includePaths` = `scss/`.
- Note: `design-standards.md` describes a generic 4-file `src/styles/` layout; this repo's actual
  layout is `scss/{component,global,main}.scss` + per-component modules. Follow the repo.
- Banned patterns (CLAUDE.md): accent bars beside headings; tiny muted "View all"-style links;
  explanatory/provenance captions beside labels.
- Server Components by default; `'use client'` only when needed. Few comments — only non-obvious *why*.

## Key design decisions

- **Retired the backend**: it served hand-seeded, un-maintained data; the Worker covers everything live.
- **Derived figures are window-bounded** (~7 weeks back, 2 ahead) and all callers share one window
  so they share cache entries.
- **Unattributable results are counted separately, never guessed** (`attributeResult` exact
  full/short name match only).
- **No average first-innings score**: schedule scores are per team, not per innings.
- **Production build fails** if `NEXT_PUBLIC_CREX_WORKER_URL` points at localhost (it is inlined
  into the client bundle). Local Worker dev uses `npm run local` / `.env.wrangler.local`, never `.env.local`.
- **Image optimizer pinned** to `cricketvectors.akamaized.net` (avoids open proxy).
- Series stat tables: `seriesStatRows` reads every card once; `getCrexSeriesStatTables` ranks several
  kinds off that single read.

## External services

- crex.com internal APIs (undocumented, likely against ToS — personal project caveat in worker README).
- Cloudflare Workers (`pulsecrease-crex.pulse-cricket.workers.dev`).
- Vercel (frontend, root `frontend/`), Vercel Web Analytics.
- Git remote: `git@github.com:mianhanan56/cricket-site.git`.
