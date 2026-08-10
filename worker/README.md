# PulseCrease Cricket Worker

Cloudflare Worker sitting between the frontend and [CricLive API](https://cricketliveapi.com).

**Why a Worker and not a direct browser call:** the API key would be visible in
devtools, every viewer would spend a request from your quota, and CricLive sends
no CORS headers for your domain. The Worker fixes all three — the key stays
server-side, the edge cache collapses N viewers into a handful of upstream calls,
and it emits CORS for your origins.

```
browser / Next.js SSR  ──▶  Worker (key + cache + CORS)  ──▶  cricketliveapi.com
```

## One-time setup

```bash
cd worker
npm install
npx wrangler login          # opens a browser; authorizes your Cloudflare account
```

## Local development

```bash
npm run dev                      # http://localhost:8787
curl http://localhost:8787/health
```

Public routes work immediately. For the protected ones,
`cp .dev.vars.example .dev.vars` and paste your token in (gitignored).

## Deploy

```bash
npm run deploy
npx wrangler secret put CRICKET_API_TOKEN   # optional — protected routes only
```

Deploy prints your URL — `https://pulsecrease-cricket.<subdomain>.workers.dev`.
Verify with `curl <url>/health`, then set it as `NEXT_PUBLIC_CRICKET_WORKER_URL`
in the frontend (`.env.local` locally, Vercel env vars in production) and add
your production domain to `ALLOWED_ORIGINS` in `wrangler.toml`.

Logs: `npm run tail`.

## Adding an endpoint

Add a row to [`src/routes.ts`](src/routes.ts), add a helper to
[`frontend/lib/cricketLive.ts`](../frontend/lib/cricketLive.ts), redeploy.
Anything not in `ROUTES` returns 404 — that allowlist is what stops a stranger
who finds the URL from draining your quota on arbitrary endpoints.

## Caching

Each route sets its own TTL. Past the TTL the Worker serves the stale body
*immediately* and revalidates in the background (`ctx.waitUntil`), so a cache
expiry never makes a user wait on the upstream round-trip. If upstream is down,
stale data keeps being served for a further 5 minutes rather than erroring.

Response headers tell you what happened: `X-Worker-Cache: HIT | STALE | MISS`.

## Verifying a path before you add it

```bash
npm run probe -- /v1/matches/live
```

Calls CricLive directly, bypassing the Worker, and prints the status plus the
real response shape. Use it to confirm a path from the docs, then add it to
`ROUTES` and redeploy.

## Auth: most endpoints need nothing

`UPSTREAM_BASE` is `https://cricketliveapi.com/api/v1`.

CricLive splits its surface in two, and the split matters:

- **Public** — no credentials at all. Live/recent/upcoming matches, series,
  schedule, teams, match facts, live miniscore. This covers the score UI.
- **Protected** — `Authorization: Bearer <token>` *plus* an active subscription.
  Full scorecard, commentary, squads, highlights, featured live.

So the Worker serves the bulk of the app with no token set. Protected routes
return a 503 naming the missing secret rather than failing opaquely; `/health`
reports `tokenPresent` so you can see which mode you're in.

The token is a Laravel Sanctum token (`52|…`). Regenerating it in the dashboard
invalidates the old one — re-run `wrangler secret put` after you do.
