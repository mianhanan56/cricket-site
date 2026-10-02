# TODO — PulseCrease

Last updated: 2026-10-02

UX audit items (production, 2026-09-29) are awaiting the user's go-ahead before any fix.

| Priority | Status | Task | Notes |
| --- | --- | --- | --- |
| High | Pending | Deploy the Worker for player series performance (`cd worker-crex && npm run deploy`) | Adds `/player/matches`. Until deployed, the player page omits the section (verified). |
| Low | Pending | Format filter "Test" on player series includes first-class (County Championship) | crex files both under `ft=3`; their own filter does the same. Group chip reads "First class". Decide whether to split. |
| High | Done | Scorecard batting/bowling tables clipped on phones | `matchCenter.module.scss` `.tableWrap` is `overflow: hidden`; batting table 426px in a 326px box at 360 (6s/SR unreachable up to 414px). Needs `overflow-x: auto` + scroll cue, or a phone column set. |
| High | Done | Deploy the Worker (`cd worker-crex && npm run deploy`) | Adds `/live` and the `LiveHub` Durable Object (`v1` migration). Watch DO usage: ~43k alarms/day while anyone is connected. |
| High | Done | Series stat pages: stat value column cut at the right edge on phones | e.g. `/series/2N8/stats/most-runs` at 360 shows half of "221". Put the stat column first after the player, or make it sticky. |
| High | Done | Insights card score clipped on phones | `InsightCard` score box sits flush with the card edge; "176/6" renders as "176/(" at 360. |
| High | Done | Team page results: no opponent, no score; "6 of 20" / "8 of 9" with no way to see the rest | `app/teams/[key]/page.tsx` (`RESULTS_SHOWN = 8`). Venue results rows have the same gap. |
| Medium | Pending | Match tab not in URL | Reload/back/share returns to Summary. Series tabs already use `?tab=`. |
| Medium | Pending | No `h1` on match pages and the 404 page; 404 uses the generic site title | |
| Medium | Pending | Status terminology drift | Same match: "DELAYED"/"RAIN DELAY" on home, "LIVE" in search; series "Live now" includes toss-delayed games; "No Result"/"No result"; "ABANDONED" chip + "Match Abandoned". |
| Medium | Pending | Alert label drift | "Player scores 50" (form) → "Fifty reached" (saved card); "Close chase" vs "Chase gets tight"; "Six" vs "Six is hit". |
| Medium | Pending | Alerts page redundancy | "0 active" + "Your alerts 0" + "No alerts yet" + CTA to the form beside it; Browser notifications card duplicates the form switch; "Open notification center" duplicates the bell. |
| Medium | Pending | Players page duplicates Rankings | Both list ICC-ranked players; Players mixes formats in one rank-sorted list. Decide: player finder vs merge into Rankings. |
| Medium | Pending | Home repeats the same live match 3× (ticker, hero, Live list); Upcoming tab ≈ Fixtures | Overview tab removed 2026-09-30. Home Upcoming "Today 6" vs Fixtures "Today 8" at the same moment — needs manual data check. |
| Medium | Done | My Cricket picker names clipped mid-word on phones | `pickName` uses `text-overflow: clip` ("Banglade", "Zimbabw"). Also zero-count sections when following only teams. |
| Medium | Pending | Series detail on phones: tabs start ~1.3 screens down; Most runs/wickets shown twice on the stats tab; series name + format repeated on every row | |
| Low | Pending | Knockout match labels "E1/S1/S2/F" unexplained on the series strip | Formats fixed 2026-09-30 (card chip, heading, strip). |
| Medium | Pending | Truncation on phones: points table team names, partnership names, end-of-over bowler figures wrapping | |
| Medium | Pending | Horizontal scrollers with no scroll cue (tables done 2026-09-30) | Player career tables, series stat table + stat switcher, fixtures day strip, ball strips. |
| Medium | Pending | Upcoming match pages show empty Scorecard/Commentary tabs before Preview | e.g. `/matches/fx-2MQ-51653`. Same fixture shows a venue on /fixtures but "Venue TBD" on the match page. |
| Medium | Pending | Touch targets under 32px | Segmented options 28px, series match nodes 30px, graph wicket markers 22px, name-only row links 20–23px. |
| Medium | Pending | Desktop person icon opens a menu with only My Cricket + Alerts | Reads as sign-in/account. |
| Low | Pending | Polish list from the audit | Toss shown 3× with different wording; match-graph summary repeats legend; 10px labels; unlabelled rankings gap; search double focus ring; empty "Mark all read"; blank logo squares; orphan "= 5" over label. |
| Low | Pending | Tighten the socket-connecting window | Entering a page while the socket (re)connects can cost one extra 2s fallback poll before the snapshot lands. |
| Medium | Pending | Stop tracking `frontend/public/swe-worker-*.js` | Build output is committed despite `.gitignore`; needs `git rm --cached` (user commits). |
| Low | Pending | Remove `CRICKET_WORKER_URL` from `frontend/.env` | Last CricLive leftover (docs/comments cleaned 2026-10-02). Nothing reads it. |
| Low | Pending | Refresh `frontend/data/rankings.json` fallback and bump `asOf` | Only used when crex is unreachable. |
| Low | Pending | Confirm BackButton spacing | Was decided by stylesheet order (production: venue/stats 0px, player/series 16px). Now deterministic as authored: venue/series/stats 0, player 8px, others 16px. Change the page `.back` rules if 16px everywhere is wanted. |
| High | Pending | Redeploy the frontend so robots.txt / sitemap.xml / metadata stop naming localhost | Production serves `Sitemap: http://localhost:3005/sitemap.xml` (seen 2026-10-02). Fixed in `lib/site.ts` (falls back to Vercel's production domain); setting `NEXT_PUBLIC_SITE_URL` on Vercel also works. |
| Medium | Pending | Deploy the Worker (`cd worker-crex && npm run deploy`) for upstream-failure logging and the hub's topic guard | Code-only change; no new routes or migrations. |
| Medium | Pending | Series stat tables use 6-ball overs/economy for The Hundred | `seriesStatRows` (`lib/crex.ts`) fetches cards without `ballsPerOver` and divides by 6; the scorecard and player Series performance use 5. `SeriesScheduleMatch` has no `ballsPerOver`, and what an "Overs" column should show for The Hundred is a product call. |
| Medium | Pending | Two lockfiles in `frontend/` (`package-lock.json` and `yarn.lock`) | Vercel picks the installer from the lockfile; keep one (`vercel.json` runs `npm run build`, so npm). |
| Low | Pending | `/news/topics` Worker route is unused by the frontend | Kept (public Worker API, slow 620 KB payload). Remove from `routes.ts`, README and `probe.sh` if not planned. |
| Low | Pending | Consider splitting `frontend/lib/crex.ts` (~5.1k lines) by domain | Match / series / player / team / fixtures. Not urgent. |
