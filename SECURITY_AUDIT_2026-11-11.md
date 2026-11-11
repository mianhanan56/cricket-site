# PulseCrease — Security Audit Report

| | |
|---|---|
| Target | https://pulsecrease.vercel.app (Next.js on Vercel) and its Cloudflare Worker `pulsecrease-api` |
| Audit date | 11 November 2026 |
| Source reviewed | `master` at `016fa6b`, 434 tracked files (`frontend/`, `worker/`) |
| Type | White-box code review plus non-destructive black-box testing of production |
| Status | Audited 11 November 2026. Code fixes applied the same day and verified locally; **not yet deployed**. See Remediation status. |

> **Handle as confidential.** This file describes unpatched weaknesses in a live site. It is untracked in git; do not commit it to a public repository while the findings are open.

## Remediation status (11 November 2026)

The findings below describe production as audited. This table is what has changed since. Nothing is deployed yet, so production still behaves as audited until the Worker and the frontend are redeployed.

| ID | Status | What was done | What remains |
|---|---|---|---|
| PC-01 | **Open** | — | Upgrade Next.js to 15.5.29 or 16.4.6 as its own change |
| PC-02 | Partly fixed | Upstream refusals held 60 s; key space bounded (PC-03); rate-limit binding, 3000 requests a minute per address | A refused request still counts against the Worker's daily allowance. Needs a Cloudflare rate-limiting rule on a custom domain |
| PC-03 | Fixed | Every string param has a pattern or a set of values, enforced by the types; error bodies carry the upstream status only | — |
| PC-04 | Fixed in code | A failed generation is held for its 15-minute window across instances; 40 generations an hour per instance | Quota cap on the key in Google Cloud |
| PC-05 | Fixed | Card and feed topics only for matches in the current list; ceilings on sockets, topics and messages | — |
| PC-06 | Partly fixed | Malformed ids are a not-found with no request made | Valid-format unknown ids still render. Needs Vercel Firewall rate limits |
| PC-07 | Fixed | `/health` answers `{"status":"ok"}`; unknown paths list nothing; errors name no upstream | — |
| PC-08 | Fixed | CSP and five other headers; `X-Powered-By` off | — |
| PC-09 | Fixed | Image optimization switched off | Confirm on Vercel after deploy |
| PC-10 | Open | — | Choose one lockfile per package; update dev tooling |
| PC-11 | Fixed | Production origin list no longer includes localhost | WebSocket still accepts clients that send no `Origin`, by design |
| PC-12 | Fixed | Stored links must start with a single `/` | — |
| PC-13 | Open | — | Check repository visibility |
| PC-14 | Open | — | Not a code issue |

How the fixes were verified:

| Check | Result |
|---|---|
| Worker unit and handler tests | 28 of 28 pass |
| Frontend test suite, including 16 new security cases | 188 of 188 pass |
| Worker and frontend type-check; frontend lint | Clean |
| `wrangler deploy --dry-run` | Config accepted, rate-limit binding recognised |
| Patched Worker run locally against the real upstream | Malformed keys, cursor and page return 400; a refused key reaches the upstream once, then is answered from cache; real routes answer as before |
| Local live hub | Unknown topics ignored; oversized message and a 60-message burst close the socket; 100 of 104 sockets from one address accepted |
| Production build of the frontend in an isolated copy | Headers present, `X-Powered-By` absent, `/_next/image` returns 404 |
| Headless Chrome, 21 page loads | No Content-Security-Policy violations |
| Quiz with a deliberately invalid key | Three requests, one model call |

Not verified: behaviour on Vercel and Cloudflare themselves. Section 13 is the checklist to run after deploying.

## How to read this report

Every finding carries one of four statuses:

- **Confirmed** — observed directly, in code and/or on production.
- **Likely but unconfirmed** — the missing control is confirmed, but the damaging outcome was not demonstrated (doing so would have been destructive or needs dashboard access).
- **Not vulnerable** — tested, and the evidence shows no weakness.
- **Not tested** — out of scope or not reachable from here.

Testing limits: production received single read-only requests and three small bursts (30–40 requests each). No denial-of-service, no data modification, no credential attacks, and no attacks on third-party infrastructure were performed. OWASP ZAP was not run; probing was manual.

---

## 1. Executive summary

PulseCrease has no user accounts, no database, no cookies and no server-side user data. There is nothing for an attacker to steal or take over in the usual sense. The exposure is in three places: **availability**, **abuse of the upstream integrations**, and **patch level**.

| Question | Answer |
|---|---|
| How could an attacker compromise PulseCrease? | By taking it offline or exhausting its quotas, and potentially by exploiting the unpatched Next.js release. Not by breaching data. |
| Which entry points are vulnerable? | The Worker's HTTP routes and `/live` WebSocket, the `/api/worker/*` proxy, `/api/quiz`, and the dynamic page and OG-image routes. |
| What information could be exposed? | The full upstream map (hosts and paths) and the upstream's raw SQL errors, both served from the production domain. No secrets or user data. |
| Can unauthorized users access protected functionality? | There is no protected functionality. Everything is public by design. |
| Can APIs or external integrations be abused? | Yes. Free-form parameters are relayed to the upstream unvalidated, and anyone can trigger Gemini generations. |
| Is the Next.js application configured securely? | Configuration is mostly sound, but 14.2.35 is the final 14.x release and has 25 unpatched advisories. |
| Is the Vercel deployment configured securely? | HTTPS, HSTS and source-map protection are good. No security headers are set. Firewall and deployment-protection settings need dashboard access. |
| What must be fixed before production? | PC-01 to PC-06. |

## 2. Overall security posture

| ID | Finding | Severity | Status |
|---|---|---|---|
| PC-01 | End-of-life Next.js 14.2.35 with unpatched advisories | High | Confirmed (version); exploitation not tested |
| PC-02 | Worker can be taken offline: no rate limiting, cache bypass, free-plan quotas | High | Likely but unconfirmed |
| PC-03 | Unvalidated parameters relayed upstream; upstream SQL returned to callers | Medium | Confirmed |
| PC-04 | `/api/quiz` is an anonymous, unthrottled model trigger | Medium | Confirmed |
| PC-05 | Live hub has no socket or topic caps | Medium | Likely but unconfirmed |
| PC-06 | Expensive anonymous Vercel routes with no throttling | Medium | Likely but unconfirmed |
| PC-07 | Upstream provider and route map disclosed | Low | Confirmed |
| PC-08 | No security headers; `X-Powered-By` sent | Low | Confirmed |
| PC-09 | Image optimizer enabled but unused | Low | Confirmed |
| PC-10 | Build-tool advisories; two lockfiles per package | Low | Confirmed |
| PC-11 | `localhost` origin allowed in production; WebSocket accepts no-Origin clients | Informational | Confirmed |
| PC-12 | Stored notification links accept protocol-relative URLs | Informational | Confirmed |
| PC-13 | Local dev state committed in git history; repo visibility unknown | Informational | Confirmed / not tested |
| PC-14 | Total dependency on an undocumented third-party API | Informational | Confirmed |

### Score: 56 / 100

This is **not a certified security rating**. It is a count of open issues under weights chosen for this report.

- Start at 100.
- Deduct 25 per Critical, 12 per High, 6 per Medium, 2 per Low, 0 per Informational.
- A finding marked "likely but unconfirmed" counts half.

| | Findings | Deduction |
|---|---|---|
| Confirmed | PC-01 (12), PC-03 (6), PC-04 (6), PC-07, PC-08, PC-09, PC-10 (2 each) | 32 |
| Likely but unconfirmed | PC-02 (6), PC-05 (3), PC-06 (3) | 12 |
| **Total** | | **44** |

The score is dominated by availability and patch level, not by data exposure.

## 3. Attack surface map

### Architecture

```
Browser ──/api/worker/* (Vercel rewrite)──┐      Browser ──WebSocket /live──┐
                                          ▼                                 ▼
Next.js 14 on Vercel ──server fetch──▶ Cloudflare Worker ──▶ 5 upstream hosts (unauthenticated)
        │
        └──▶ Google Gemini (quiz)
```

### Inventory

| Surface | Detail |
|---|---|
| Framework | Next.js 14.2.35, React 18.3.1, App Router only |
| Server Actions | None (`'use server'` appears nowhere) |
| Middleware / Proxy | None |
| Authentication, sessions, database | None |
| Route handlers | `/api/quiz` (dynamic, calls Gemini, `maxDuration` 60 s); `/api/search-index` (ISR 1 h); `/api/search-players` (ISR 6 h); `/icons/[size]` (static) |
| Proxy | `/api/worker/:path*` rewrites to the Worker (`frontend/next.config.js:106`) |
| Dynamic pages | `/matches/[id]`, `/players/[id]`, `/teams/[key]`, `/series/[id]`, `/series/[id]/stats/[kind]`, `/venues/[key]`, `/news/[slug]` |
| Dynamic images | `opengraph-image` under `/matches/[id]`, `/players/[id]`, `/teams/[key]` |
| Static / ISR pages | `/`, `/fixtures`, `/series`, `/teams`, `/players`, `/rankings`, `/news`, `/search`, `/insights`, `/automations`, `/my`, `/about`, `/privacy` |
| Worker HTTP | 18 allowlisted GET routes plus `/` and `/health`; also reachable directly at `pulsecrease-api.pulse-cricket.workers.dev` |
| Worker WebSocket | `/live`, one Durable Object (`LiveHub`) for all sockets |
| Third parties | Five upstream API hosts, Google Gemini, Vercel Analytics, two image CDNs |
| Server secrets | `GEMINI_API_KEY`; optional `GEMINI_MODEL`, `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION` |
| Public env vars | `NEXT_PUBLIC_WORKER_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_LIVE_WS`, `NEXT_PUBLIC_LIVE_WS_URL` (none sensitive) |
| User state | Browser `localStorage` only: follows, alert rules, notifications, quiz picks, theme |
| Service worker | `next-pwa`; caches pages and non-live `/api/worker/*` responses |

---

## 4. Next.js security findings

### PC-01 — End-of-life Next.js with unpatched advisories

| | |
|---|---|
| Severity | High (npm rates the package Critical; see triage below for why High here) |
| Status | Confirmed (vulnerable version); exploitation not tested |
| CVSS 4.0 | Not scored as a bundle |
| Affected | `frontend/package.json`; both lockfiles resolve `next@14.2.35` |

**Evidence.** `npm audit` reports 25 advisories against `next` itself, plus a vulnerable bundled `postcss`. The npm registry shows `14.2.35` is the last 14.x release (`next-14` dist-tag); fixes exist only on the 15.5 backport line (`15.5.29`) and `16.4.6`.

**Applicability triage.** Triage is by advisory title and this app's feature use. I did not read every advisory in full and did not attempt to exploit any.

| Advisory | Title (abridged) | Assessment |
|---|---|---|
| GHSA-h25m-26qc-wcjf | DoS via HTTP request deserialization with React Server Components | Likely relevant |
| GHSA-q4gf-8mx6-v5v3 | DoS with Server Components | Likely relevant |
| GHSA-8h8q-6873-q5fj | DoS with Server Components | Likely relevant |
| GHSA-m99w-x7hq-7vfj | DoS in App Router using Server Actions | Possibly relevant (no actions defined, but the handler exists) |
| GHSA-p3m5-59mp-jv5r | DoS in App Router using Server Actions | Possibly relevant |
| GHSA-vfv6-92ff-j949 | Cache poisoning via RSC cache-busting collisions | Possibly relevant |
| GHSA-wfc6-r584-vfw7 | Cache poisoning in RSC responses | Possibly relevant (one basic variant tried; not reproduced) |
| GHSA-68g3-v927-f742 | Cache confusion of response bodies for requests with bodies | Possibly relevant |
| GHSA-4633-3j49-mh5q | Cache confusion, invalid UTF-8 bodies | Possibly relevant |
| GHSA-ggv3-7p47-pfv8 | HTTP request smuggling in rewrites | Possibly relevant (an external rewrite is used) |
| GHSA-2xp9-vwfh-vxw4 | Unauthenticated RCE in Image Optimization API (AVIF) | Self-hosted only |
| GHSA-2464-fhr4-w9xw | Unauthenticated RCE in Image Optimization API (SVG) | Self-hosted only |
| GHSA-h64f-5h5j-jqjh | DoS in the Image Optimization API | Self-hosted only |
| GHSA-9g9p-9gw9-jx7f | DoS via Image Optimizer `remotePatterns` | Self-hosted only |
| GHSA-3x4c-7xq6-9pq8 | Unbounded `next/image` disk cache growth | Self-hosted only |
| GHSA-c4j6-fc7j-m34r | SSRF with WebSocket upgrades | Self-hosted only |
| GHSA-p293-qw3h-jr36 | Unauthenticated RCE on Windows-hosted servers | Self-hosted only |
| GHSA-89xv-2m56-2m9x | SSRF in Server Actions on custom servers | Self-hosted only |
| GHSA-p9j2-gv94-2wf4 | SSRF in rewrites via attacker-controlled destination host | Not applicable (destination host is a build-time constant) |
| GHSA-3g8h-86w9-wvmq | Middleware redirects cache-poisoned | Not applicable (no middleware) |
| GHSA-36qx-fr4f-26g5 | Middleware bypass, Pages Router i18n | Not applicable |
| GHSA-ffhc-5mcf-pf4q | XSS with CSP nonces | Not applicable today; **matters for PC-08's fix** |
| GHSA-gx5p-jg67-6x7h | XSS in `beforeInteractive` scripts | Not applicable (not used) |
| GHSA-4c39-4ccg-62r3 | Unbounded Server Action payload, Edge runtime | Not applicable (no Edge runtime) |
| GHSA-955p-x3mx-jcvp | Disclosure of internal Server Function endpoints | Not applicable (none defined) |

Why "self-hosted only" for the image advisories: production `/_next/image` errors are generated by Vercel's own optimizer (`INVALID_IMAGE_OPTIMIZE_REQUEST` with a Vercel request id), so Next's bundled optimizer is not what runs there. They become reachable the moment the app is served with `next start`.

**Reproduction.** `npm audit --prefix frontend`.

**Attacker capability.** Crash or stall server renders with crafted requests; possibly poison cached responses.

**Business impact.** Outage risk, and no vendor fix will ever ship for 14.x.

**Fix.** Upgrade to `15.5.29` or `16.4.6`. Both need React 19 and async `params` / `searchParams`, and caching defaults differ, so this is the largest change in the plan. `@ducanh2912/next-pwa` declares `next >= 14`, so it should carry over; verify on a build.

### PC-08 — Missing security headers

| | |
|---|---|
| Severity | Low |
| Status | Confirmed |
| Affected | `frontend/next.config.js` (no `headers()`), all responses |

**Evidence.** `GET /` on production returns `strict-transport-security` only. Absent: `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. Present: `x-powered-by: Next.js`.

**Reproduction.** `curl -sI https://pulsecrease.vercel.app/`.

**Attacker capability.** None alone. Pages can be framed by another site. If an XSS is ever introduced, nothing limits it: it could rewrite a visitor's follows and alerts and raise system notifications under the site's permission.

**Business impact.** No second line of defence.

**Fix.** Add `headers()` in `next.config.js` and set `poweredByHeader: false`. Use a static CSP (not nonce-based: see GHSA-ffhc-5mcf-pf4q above), starting in `Content-Security-Policy-Report-Only`. Suggested baseline: `default-src 'self'`; `script-src 'self' 'unsafe-inline'`; `style-src 'self' 'unsafe-inline'`; `img-src 'self' data:` plus the two image CDNs; `connect-src 'self'` plus the Worker over `https` and `wss`; `object-src 'none'`; `base-uri 'self'`; `frame-ancestors 'none'`; `form-action 'self'`. Add `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy` that denies unused features.

### PC-09 — Image optimizer enabled but unused

| | |
|---|---|
| Severity | Low |
| Status | Confirmed |
| Affected | `frontend/next.config.js:112-120`, endpoint `/_next/image` |

**Evidence.** No file imports `next/image`. On production:

| Request | Result |
|---|---|
| `url=https://cricketvectors.akamaized.net/Teams/O.png` | 200 `image/jpeg` |
| `url=https://example.com/a.png` | 400 |
| `url=http://169.254.169.254/...` | 400 |
| `url=/icon.svg` | 400 |

**Attacker capability.** Request arbitrary size and quality combinations of that host's images to consume billable transformations.

**Business impact.** Minor cost exposure, and it is the component the RCE advisories target if the app is ever self-hosted.

**Fix.** Remove the remote pattern (or disable optimization), then confirm remote URLs return 400.

### Next.js checks that passed

| Area | Result |
|---|---|
| Server Actions | None exist |
| Middleware bypass | No middleware |
| Server/client data exposure | Quiz prompt, schema and Gemini client are server-only; absent from all 28 client chunks |
| `NEXT_PUBLIC_` exposure | Only the Worker URL and live-socket flags are inlined |
| XSS sinks | Three `dangerouslySetInnerHTML` uses: two static scripts in `app/layout.tsx`, one JSON-LD block that escapes `<` |
| Reflected XSS | `/search?q=<script>…` and `/?tab=…` payloads are not reflected raw |
| Open redirects | `permanentRedirect` targets are always `/matches/…` or `/news/…` |
| SSRF | No user-controlled fetch destination; OG cards embed only a local asset |
| CSRF | No state-changing server endpoints and no cookies |
| Path traversal | No file handling; `/matches/..%2f..%2fapi%2fquiz` returns 400 |
| Error exposure | Error boundaries render generic text; no stack or message reaches the UI |
| Source maps | `.map` requests return 403 |
| RSC cache poisoning | A request with `RSC: 1` on a unique URL, then a plain request: the plain one received HTML |
| `X-Forwarded-Host` | Not reflected |

---

## 5. API security findings

### PC-02 — Worker can be taken offline

| | |
|---|---|
| Severity | High |
| Status | Likely but unconfirmed |
| CVSS 4.0 | `AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:H/SC:N/SI:N/SA:N` — 8.7, if exploitable as analysed |
| Affected | `worker/src/index.ts`, every route; `worker/wrangler.toml` |

**Evidence.**

- No rate limiting exists in the Worker code.
- 40 requests at concurrency 10 were all served with 200, through the site proxy and directly on `workers.dev`. No rate-limit headers were present.
- Upstream errors are never cached (`worker/src/index.ts:262-266`), so repeating one bad key reaches the upstream every time.
- Each distinct key is a new cache entry and a new upstream call (see PC-03).
- `worker/README.md:360-363` states that normal use fits the Cloudflare free plan "but not with much room".

**Not confirmed.** The account's actual plan, and exhaustion itself, which was not attempted.

**Reproduction (local).** Run `npm run dev` in `worker/`, request `http://localhost:8788/match/info?key=<random>` repeatedly, and watch every call go upstream in the log.

**Attacker capability.** Exhaust the Worker's daily request quota from one machine, or drive enough upstream traffic to get the Worker blocked.

**Business impact.** Server renders and browser polls both depend on the Worker. Once it stops answering, every page loses its data until the quota resets or the block is lifted.

**Fix.**

1. Per-client rate limiting at Cloudflare (Workers rate-limiting binding or a WAF rule). Requests arriving through the Vercel rewrite share Vercel's addresses, so also limit `/api/worker/*` at Vercel.
2. Cache upstream 4xx responses for about 60 seconds.
3. Apply PC-03's validation so the key space is bounded.

Check current Cloudflare and Vercel plan features when implementing.

### PC-03 — Unvalidated parameters relayed upstream

| | |
|---|---|
| Severity | Medium |
| Status | Confirmed |
| CVSS 4.0 | `AV:N/AC:L/AT:N/PR:N/UI:N/VC:L/VI:N/VA:N/SC:L/SI:N/SA:N` — 6.9 |
| Affected | `worker/src/routes.ts`: `key` (lines 129, 151, 284, 316, 343, 365, 389, 424, 442), `matchKey` and `lastDocId` (173–174), `page` (211); error body in `worker/src/index.ts:178-190` |

**Evidence (production, through `/api/worker`).**

| Request | Result |
|---|---|
| `/match/info?key=` + 200 characters | 200, forwarded upstream |
| `/match/info?key=AUDIT%20KEY.0003` | 200, forwarded upstream |
| `/match/commentary?matchKey=…&lastDocId=AUDITCURSOR1` | 200, forwarded upstream |
| `/rankings/players?page=AUDITPAGE` | 502 containing the upstream's MySQL error `ER_SP_UNDECLARED_VAR` ("Undeclared variable: NaN") and its full `SELECT` statement with table names |
| `/player/overview?key=ZZZZZZZZ` | 502 containing the upstream URL and its raw error body |

Probing stopped at the first database error. Whether the upstream is injectable was **not tested**: it is third-party infrastructure. The `NaN` suggests that value is coerced to a number upstream.

**Reproduction (local).** `curl 'http://localhost:8788/rankings/players?page=x'`.

**Attacker capability.** Send arbitrary strings into the upstream's API through the Worker and the production domain. The traffic is attributed to the PulseCrease Cloudflare account and carries the forged `Origin` and `Referer` set in `worker/src/upstream.ts:18-24`.

**Business impact.** Abuse attribution, a likely upstream block (total outage), and a third party's database internals published from the PulseCrease domain.

**Fix.**

1. Require a `pattern` on every `string` param: `^[A-Za-z0-9]{1,12}$` for keys, digits only for `lastDocId`, a bounded integer for `page`.
2. Make a missing pattern a type error so new routes cannot omit it.
3. Stop returning `detail` and `upstream` to callers; log them. The frontend reads only `status`.

### PC-04 — Anonymous model trigger

| | |
|---|---|
| Severity | Medium |
| Status | Confirmed |
| CVSS 4.0 | `AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:L/SC:N/SI:N/SA:N` — 6.9 |
| Affected | `frontend/app/api/quiz/route.ts`, `frontend/lib/gemini.ts` |

**Evidence.** Three real match ids from the public sitemap:

| Match | Status | Time | Note |
|---|---|---|---|
| `13Q6` | 200 | 9.3 s | Fresh generation, five questions |
| `13LQ` | 503 | 13.8 s | `cache-control: no-store` |
| `13VA` | 503 | 2.4 s | `cache-control: no-store` |

Failures are not cached (`route.ts:53-54`, `route.ts:74`), so each repeat of a failing id runs the model again. The sitemap lists 920 match ids. `maxDuration` is 60 seconds. There is no per-client or global limit; 30 rapid requests were all served.

**Reproduction (local).** With a test key in `.env.local`, request the same failing match id twice on `next dev` and observe two model calls in the log.

**Attacker capability.** Loop over a failing id, or walk the sitemap, to exhaust the Gemini free quota and consume function time.

**Business impact.** The Quiz tab disappears for everyone while the quota is exhausted. On a paid Gemini tier this becomes direct cost.

**Fix.**

1. Cache failures for 10–30 minutes.
2. Add a per-IP limit and a global daily generation budget; serve cached quizzes only once it is spent.
3. Set a quota cap on the key in Google Cloud and restrict the key to the Generative Language API.

### PC-05 — Live hub has no caps

| | |
|---|---|
| Severity | Medium |
| Status | Likely but unconfirmed (not load-tested) |
| CVSS 4.0 | `AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:L/SC:N/SI:N/SA:N` — 6.9 |
| Affected | `worker/src/live.ts`, `worker/src/index.ts:82-91` |

**Evidence.**

- A WebSocket handshake with no `Origin` header returns 101. A foreign browser origin returns 403.
- No limit on total sockets or sockets per client (`live.ts:83-92`).
- Each socket may hold 30 topics (`live.ts:15`).
- Topic keys are any 1–40 characters (`live.ts:16`) and are not checked against real matches. Each new topic starts its own upstream poll.

**Reproduction (local).** Against `wrangler dev`, open several sockets and subscribe each to 30 `card:<random>` topics; observe one upstream poll per topic.

**Attacker capability.** Open many sockets with random topics to exhaust the single Durable Object's memory and duration quota and multiply upstream polling.

**Business impact.** Live updates drop for all visitors. Clients fall back to 2-second polling, which adds load to PC-02.

**Fix.** Cap total sockets and sockets per client; accept only keys in the current match list; cap total topics; close sockets that never subscribe; rate-limit messages per socket.

### PC-07 — Upstream provider and route map disclosed

| | |
|---|---|
| Severity | Low |
| Status | Confirmed |
| Affected | `worker/src/index.ts:97-120` |

**Evidence.** `https://pulsecrease.vercel.app/api/worker` returns all five upstream hosts and the upstream method and path for each of the 18 routes. Unknown routes return the full route list.

**Reproduction.** `curl https://pulsecrease.vercel.app/api/worker`.

**Attacker capability.** Learn the data provider and call it directly, or report the integration to the provider.

**Business impact.** Publishes the provider the UI deliberately hides, and documents an integration that `worker/README.md:21` says is very likely against the provider's terms.

**Fix.** Reduce `/health` to a status flag and remove the route list from the 404 body. The frontend no longer reads `/health`.

### API checks that passed

| Area | Result |
|---|---|
| CORS | Exact-match allowlist; foreign, `null` and lookalike origins get no `Access-Control-Allow-Origin` |
| HTTP methods | POST, PUT, DELETE return 405 on the Worker |
| Enum and range params | Enforced (`/fixtures?page=999` returns 400) |
| Path-filled params | Pattern-checked and URL-encoded (`/news/tagged`, `/news/article`) |
| `/api/quiz` input | `match` must be 1–16 alphanumerics |
| `/api/search-index`, `/api/search-players` | ISR; a caller cannot force a rebuild |
| Cross-user caching | No per-user responses exist to leak |

---

## 6. Vercel deployment findings

### PC-06 — Expensive anonymous routes with no throttling

| | |
|---|---|
| Severity | Medium |
| Status | Likely but unconfirmed |
| Affected | Dynamic pages, `opengraph-image` routes, `/api/worker/*` |

**Evidence (production).**

| Request | Result |
|---|---|
| `/matches/ZZZZZZ` | 200 after 1.9 s (full server render for an unknown id) |
| `/players/ZZZZZZ`, `/teams/ZZZZZZ`, `/series/ZZZZZZ`, `/venues/ZZZZZZ` | 200 after 0.7–1.8 s each |
| `/matches/ZZZZZZ/opengraph-image` | 200 PNG after 2.1 s, `x-vercel-cache: MISS` |
| 40 × `/api/worker/rankings` | All 200, no throttling |

**Not confirmed.** Whether Vercel Firewall rules or spend limits are configured.

**Attacker capability.** Request random ids in a loop; each is a function invocation plus Worker and upstream reads.

**Business impact.** Plan-quota exhaustion or a paused project.

**Fix.** Validate id formats before any fetch and return a real 404 for malformed ids. Add Vercel Firewall rate limits on `/api/*` and the OG-image routes.

### Verified from outside

| Check | Result |
|---|---|
| HTTP to HTTPS | 308 redirect |
| HSTS | `max-age=63072000; includeSubDomains; preload` |
| TLS 1.0 / 1.1 | Handshakes failed (the test client may also refuse them; indicative only) |
| `/.env`, `/.env.local`, `/.git/config`, `/.git/HEAD` | 404 |
| `/package.json`, `/next.config.js`, `/vercel.json`, `/tsconfig.json` | 404 |
| `/sw.js.map`, `/_next/static/chunks/main-app.js.map` | 403 |
| `/.well-known/security.txt` | 404 (none published) |
| `vercel.json` | Framework, build command and output directory only |

### Requires the Vercel dashboard (not tested)

- Deployment Protection on preview deployments.
- Environment variable separation between Production, Preview and Development, and whether previews share the production Gemini key.
- Firewall rules, Attack Challenge Mode, and spend management.
- Which lockfile and install command the build uses.
- Git integration permissions and fork protection.

### Requires the Cloudflare dashboard (not tested)

- The account's plan and daily limits.
- Any WAF or rate-limiting rules on the Worker.
- Whether the `workers.dev` route can be restricted.

---

## 7. Authentication and authorization findings

No accounts, sessions, cookies or server-side preferences exist. IDOR, broken access control, session fixation and CSRF do not apply.

- Follows, alerts and notifications are stored in the visitor's own browser. One user cannot reach another's.
- `*.vercel.app` is on the Public Suffix List, so sibling Vercel sites cannot read this site's storage.
- The Worker's origin allowlist stops other websites embedding the API from a browser. It is not access control: scripted clients send no `Origin` (PC-11).

### PC-11 — Origin allowlist details (Informational)

`worker/wrangler.toml:8` allows `http://localhost:3005` in production, and `/live` accepts handshakes with no `Origin`. All data is public, so there is no direct impact. Move the localhost origin to a dev-only environment.

### PC-12 — Stored notification links (Informational)

`frontend/lib/notifications.ts:49` accepts any stored `href` starting with `/`, which includes `//other-host`. Reaching it requires writing to the victim's `localStorage`, which already implies XSS or local access. Tighten to a single leading slash.

---

## 8. Dependency and secret exposure findings

### PC-10 — Build-tool advisories and duplicate lockfiles

| | |
|---|---|
| Severity | Low |
| Status | Confirmed |

| Package | `npm audit` result | Runtime exposure |
|---|---|---|
| `frontend` | 22 total: 1 critical, 9 high, 8 moderate, 4 low | `next` only (PC-01). The rest are lint and build tooling: `eslint-config-next`, `glob`, `minimatch`, `brace-expansion`, `workbox-build`, `serialize-javascript`, `postcss`, `js-yaml`, `fast-uri`, `source-map-js` |
| `worker` | 4 high | None. All in `wrangler` dev tooling: `miniflare`, `undici`, `sharp` |

Both packages track `package-lock.json` **and** `yarn.lock`. The tree that was audited may not be the tree that is deployed.

**Fix.** Keep one lockfile per package. Update `wrangler` and `eslint-config-next`. Run `npm audit` in CI.

### Secrets — not vulnerable on the evidence

| Check | Result |
|---|---|
| Env files tracked in git | None; `.env`, `.env.local`, `.env.wrangler.local` are ignored |
| History scan, all 70 commits | No Google, OpenAI, GitHub, Slack, JWT, private-key, Cloudflare or Vercel token patterns. One placeholder database URL in a deleted `.env.example` |
| Production client JavaScript (28 chunks, 965 KB) | Gemini key value absent; no `GEMINI`, `x-goog-api-key`, quiz prompt code or upstream API hostnames |
| `GEMINI_API_KEY` handling | Read server-side only, sent as a header, never logged |

### PC-13 — Git history hygiene (Informational)

History contains local dev state from the retired backend (`backend/.wrangler/**/*.sqlite`, added in `50bd6c2`, removed in `28d9024`). The contents were not inspected in depth. Repository visibility could not be checked (`gh` is not installed); if it is public, PC-07's information is already public through `worker/src/upstreams.ts`.

### PC-14 — Dependency on an undocumented third-party API (Informational)

All content comes from a third party's internal, undocumented endpoints, called with that party's own site as `Origin` and `Referer`. The provider can block the Worker or change a payload at any time. This is the largest continuity and legal risk to the product, and it cannot be fixed in code.

---

## 9. Confirmed vulnerabilities

PC-01, PC-03, PC-04, PC-07, PC-08, PC-09, PC-10.

## 10. Potential vulnerabilities

PC-02, PC-05, PC-06. The missing controls are confirmed in code and by small bursts; the outage itself was not demonstrated.

## 11. Untested areas

- OWASP ZAP or any automated scanner.
- Load, stress or denial-of-service behaviour.
- Injection against the upstream provider.
- Vercel and Cloudflare dashboard settings (sections 6 and 8).
- Preview deployments.
- Browser-driven DOM testing and service-worker behaviour in a real browser.
- Applicability of each individual Next.js advisory beyond its title.
- GitHub repository visibility and branch protection.

## 12. Prioritized remediation plan

### P0 — before the site is called production-ready

| # | Change | Where | Findings |
|---|---|---|---|
| 1 | Patterns on every string param; redact error bodies; trim `/health` and the 404 route list | `worker/src/routes.ts`, `worker/src/index.ts` | PC-03, PC-07 |
| 2 | Rate limiting and short negative caching | Worker, Cloudflare | PC-02 |
| 3 | Socket, topic and message caps; topic validation | `worker/src/live.ts` | PC-05 |
| 4 | Failure cache, generation budget, key quota | `frontend/app/api/quiz/route.ts`, Google Cloud | PC-04 |
| 5 | Upgrade Next.js to a supported line, as its own verified step | `frontend/` | PC-01 |

### P1

| # | Change | Where | Findings |
|---|---|---|---|
| 6 | Security headers; `poweredByHeader: false` | `frontend/next.config.js` | PC-08 |
| 7 | Disable the image optimizer | `frontend/next.config.js` | PC-09 |
| 8 | Id-format validation on detail and OG routes; Vercel Firewall rules | `frontend/app/**`, Vercel | PC-06 |
| 9 | One lockfile per package; update dev tooling | both packages | PC-10 |

### P2

| # | Change | Findings |
|---|---|---|
| 10 | Remove the localhost origin from production; tighten notification links; publish `security.txt` | PC-11, PC-12 |
| 11 | Review the dashboard items in sections 6 and 8 | — |

### Verification for each fix

- `node:test` cases: param patterns, error redaction, quiz failure cache, hub caps.
- Existing test suite passes.
- Production build from an isolated copy.
- The retest checklist below.

## 13. Security retesting checklist

- [ ] `npm audit --prefix frontend` reports no advisories on `next`.
- [ ] `/api/worker` and `/api/worker/nope` reveal no upstream hosts or route list.
- [ ] `/api/worker/rankings/players?page=x` returns 400 with no SQL text.
- [ ] `/api/worker/match/info?key=` with 200 characters returns 400.
- [ ] A repeated bad key is answered from cache, not the upstream.
- [ ] A burst past the limit returns 429 on the proxy, the Worker and `/api/quiz`.
- [ ] A failing quiz id triggers one model call, not one per request.
- [ ] The hub refuses sockets past the cap and unknown topic keys.
- [ ] Response headers include CSP, `nosniff`, a frame policy and a referrer policy; `X-Powered-By` is gone.
- [ ] `/_next/image` returns 400 for remote URLs.
- [ ] Malformed ids on detail and OG-image routes return 404 without a server fetch.
- [ ] Unit tests and the production build pass.

---

## Appendix — tests performed on production

All requests were GETs. Request counts are approximate.

| Test | Requests | Outcome |
|---|---|---|
| Response headers, HTTPS redirect, TLS versions | 5 | See PC-08 and section 6 |
| Exposed files and artifacts | 26 | None exposed |
| Worker health, 404 and error bodies | 4 | PC-03, PC-07 |
| Free-form parameter handling | 8 | PC-03 |
| CORS, methods, WebSocket handshake (direct Worker) | 12 | Passed; PC-11 |
| Rate-limit bursts | 110 | No throttling observed |
| Quiz endpoint, three real match ids | 3 | PC-04 |
| Image optimizer | 4 | PC-09 |
| RSC cache poisoning, forwarded host | 3 | Not vulnerable |
| Reflected input | 2 | Not vulnerable |
| Unknown ids and OG image | 8 | PC-06 |
| Client JavaScript download and scan | ~35 | No secrets |
