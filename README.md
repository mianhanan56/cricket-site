# PulseCrease

Full-stack cricket live-scores & news platform — a CREX.com-style clone.

## Stack

| Layer      | Tech                                            |
| ---------- | ----------------------------------------------- |
| Frontend   | Next.js 14 (App Router) · TypeScript · SCSS Modules |
| Backend    | Node.js · Express · TypeScript                  |
| Database   | PostgreSQL · Prisma ORM                          |
| Real-time  | Socket.io (live scores)                          |
| Cache      | Redis                                            |
| Auth       | NextAuth.js · JWT                                |
| Monorepo   | npm workspaces                                   |

## Structure

```
crex-clone/
├── frontend/   Next.js 14 app (App Router)
├── backend/    Express API + Socket.io + Prisma + cron sync
└── shared/     Shared TypeScript types (imported by both)
```

## Getting started

```bash
# 1. Install all workspaces
npm install

# 2. Configure env
cp .env.example .env   # then fill in DATABASE_URL, REDIS_URL, CRICAPI_KEY, etc.

# 3. Generate the Prisma client & run migrations
npm run prisma:generate
npm run prisma:migrate

# 4. (optional) Seed sample data
npm run seed --workspace=backend

# 5. Run both apps
npm run dev            # frontend :3000 + backend :5000
# or individually:
npm run dev:frontend
npm run dev:backend
```

## API

REST endpoints are mounted under `/api` (matches, series, players, fixtures,
rankings, news, search). GET responses are Redis-cached (60s; 10s for live
match data). Live updates are pushed over Socket.io (`score:update`,
`wicket:fall`, `ball:delivered`).

## Environment variables

Copy `.env.example` to `.env` (root) and fill in the values. The same file
feeds both apps locally; in production set these on the respective host.

| Variable                  | Used by  | Description                                            |
| ------------------------- | -------- | ------------------------------------------------------ |
| `PORT`                    | backend  | Express listen port (default `5000`)                   |
| `NODE_ENV`                | backend  | `development` / `production`                           |
| `CLIENT_ORIGIN`           | backend  | Allowed CORS origin (the frontend URL)                 |
| `DATABASE_URL`            | backend  | PostgreSQL connection string (Prisma)                  |
| `REDIS_URL`               | backend  | Redis connection string (cache) — optional             |
| `JWT_SECRET`              | backend  | Secret for signing JWTs                                |
| `NEXTAUTH_SECRET`         | frontend | NextAuth.js session secret                             |
| `NEXTAUTH_URL`            | frontend | Canonical frontend URL                                 |
| `CRICKET_API_URL`         | backend  | CricAPI base URL                                       |
| `CRICAPI_KEY`             | backend  | CricketData.org / CricAPI key                          |
| `NEXT_PUBLIC_API_URL`     | frontend | Backend REST base URL (exposed to browser)             |
| `NEXT_PUBLIC_SOCKET_URL`  | frontend | Backend Socket.io URL (exposed to browser)             |

## Deployment

The frontend deploys to **Vercel** and the backend to **Railway**. Configs
are checked in at `frontend/vercel.json` and `backend/railway.toml`.

### Frontend → Vercel

1. Import the repo at [vercel.com/new](https://vercel.com/new).
2. Set **Root Directory** to `frontend`.
3. Framework preset: **Next.js** (auto-detected).
4. Add environment variables (Project → Settings → Environment Variables):
   - `NEXT_PUBLIC_API_URL` → your Railway backend URL (e.g. `https://crex-api.up.railway.app`)
   - `NEXT_PUBLIC_SOCKET_URL` → same Railway backend URL
   - `NEXTAUTH_SECRET`, `NEXTAUTH_URL` (your Vercel deployment URL)
5. Deploy. Redeploy after the backend URL is known so the public vars bake in.

### Backend → Railway

1. Create a new project at [railway.app](https://railway.app) from the repo.
2. Set the service **Root Directory** to `backend`.
3. Add a **PostgreSQL** plugin (and optionally **Redis**) — Railway injects
   `DATABASE_URL` / `REDIS_URL` automatically; reference them in the service vars.
4. Add environment variables:
   - `DATABASE_URL` (from the Postgres plugin)
   - `REDIS_URL` (from the Redis plugin, optional)
   - `JWT_SECRET`, `CRICKET_API_URL`, `CRICAPI_KEY`
   - `CLIENT_ORIGIN` → your Vercel frontend URL
   - `NODE_ENV=production`
5. Build/start/health are defined in `railway.toml`; the health check hits
   `/api/health`.
6. After first deploy, run migrations once: `npx prisma migrate deploy`
   (Railway shell or a one-off command).

> **Monorepo note:** the backend imports the `@crex/shared` workspace. If you
> deploy `backend/` in isolation, either vendor the shared types into the
> backend or set the Railway root to the repo root and adjust the build to run
> `npm run build:shared` first.

## Conventions

- TypeScript everywhere; SCSS Modules for styles (no Tailwind, no inline styles).
- Server Components by default in Next.js; `'use client'` only when needed.
- Shared interfaces live in `shared/types/index.ts`.
- Mobile-first SCSS using `min-width` breakpoints from `_variables.scss`.
- Secrets via `.env` only — never hardcoded.
```
