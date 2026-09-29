# TODO — PulseCrease

Last updated: 2026-09-29

| Priority | Status | Task | Notes |
| --- | --- | --- | --- |
| High | In Progress | Finish and verify the uncommitted UI pass (dock/footer, page-end spacing, section count pill, milestones board, live panel order) | Typecheck + tests pass; needs visual check on phone and desktop widths. Verify from an isolated copy, not in `frontend/`. |
| High | Pending | Confirm search is still reachable on phones now that it left the dock | Footer marks Search as `docked`, implying the navbar covers it — check the header on mobile. |
| Medium | Pending | Fix README "Getting started" | `npm run dev --workspace=...` needs a root `package.json` that doesn't exist. Either add a workspace root or document `cd frontend && npm run dev`. |
| Medium | Pending | Stop tracking `frontend/public/swe-worker-*.js` | Build output is committed despite `.gitignore`; needs `git rm --cached` (user commits). |
| Low | Pending | Clean up CricLive leftovers | README/worker README reference `../worker`, `lib/cricketLive.ts`, `NEXT_PUBLIC_CRICKET_WORKER_URL`; none exist in code. `.env` still sets `CRICKET_WORKER_URL`. |
| Low | Pending | Refresh `frontend/data/rankings.json` fallback and bump `asOf` | Only used when crex is unreachable. |
| Low | Pending | Consider splitting `frontend/lib/crex.ts` (~5.1k lines) by domain | Match / series / player / team / fixtures. Not urgent. |
