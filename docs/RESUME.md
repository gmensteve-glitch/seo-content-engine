# RESUME — read this first when opening on a new machine

> Paste this to Claude Code on the new Mac: **"Read docs/RESUME.md, docs/BUILD-PLAN.md, and docs/ARCHITECTURE.md, then continue building the SEO content engine."**

## What this project is
An autonomous, multi-business SEO content engine (dashboard + agents). Full vision in `README.md`, `docs/ARCHITECTURE.md`, `docs/AGENT-PIPELINE.md`. Plain-English guide: `docs/SEO-Content-Engine-Guide.pdf`.

## Where we are (as of this commit)
- ✅ Next.js 16 + Tailwind v4 + React 19 app. Dashboard UI complete (shell + business switcher; pages: overview, pipeline board, briefs, quality scorecard, performance, connectors, ideas, strategy, geo).
- ✅ Data layer is **Prisma-backed** (`src/lib/data/repo.ts` → `src/lib/db.ts`). Set `DATABASE_URL` + `npx prisma migrate deploy` + `npm run seed` and the whole dashboard renders from Postgres. With no `DATABASE_URL` it falls back to `src/lib/mock/seed.ts` so `npm run dev` works with zero setup.
- ✅ **Pipeline runs end-to-end, offline** (`src/lib/pipeline/service.ts`). The human-gate buttons work (server actions in `src/app/actions.ts`); approving a brief writes → grades → publishes a Page, all persisted. Every agent degrades to labeled placeholder output when its key is missing (`src/lib/env.ts` + `src/lib/ai/offline.ts`), so no credentials are needed to exercise the full loop. Manual trigger: `POST /api/dev/pipeline {ideaId}` (needs `ENABLE_DEV_ROUTES=1` in a prod build).
- ✅ Backend modules complete & type-checked: `src/lib/ai/claude.ts`, connectors (`dataforseo`, `firecrawl`, `gsc`, `maps`), agents (`intake`, `research` gap-map, `writer`+revise, `grader` 0–100 loop), `cms/shopify.ts` (real Admin API), Inngest `jobs/` + `/api/inngest` route, `crypto/secrets.ts`.
- ✅ `npx tsc --noEmit` clean, `npm run build` passes.

## Run it locally
```bash
npm install
npm run dev   # http://localhost:3000
```
If `npm`/node is missing, install Node 20+ via nvm first.

## Gotchas (don't re-learn these)
- **Prisma is pinned to v6** on purpose — v7 removed the classic `url = env(...)` datasource. Do NOT `npm i prisma@latest`.
- **Inngest is v4**: `createFunction(options, handler)` with the trigger inside options as `triggers: [{ event }]` — NOT a 3rd argument.
- `.env` is gitignored (holds secrets). Copy `.env.example` → `.env` and fill keys. There are no real keys committed.

## Next steps (BUILD-PLAN.md Step 3 tail) — the "make it live" work
1. ✅ DB layer wired: `src/lib/db.ts`, `prisma/migrations/`, `prisma/seed.mjs`, and `repo.ts` on Prisma (mock fallback kept). To run against a DB: set `DATABASE_URL`, `npx prisma migrate deploy`, `npm run seed`.
2. Fill `.env` API keys: `ANTHROPIC_API_KEY`, `DATAFORSEO_LOGIN`/`PASSWORD`, `FIRECRAWL_API_KEY`, Google OAuth (GSC), `GOOGLE_MAPS_API_KEY`, `CONNECTOR_ENCRYPTION_KEY`.
3. Wire the agents/jobs (`src/lib/agents/*`, `src/lib/jobs/*`) to persist through `src/lib/db.ts` — they're still pure functions today.
4. Run the intake agent on trustedcaskets.com → real `client.md`; then one brief → draft → grade → publish end-to-end.
5. Deploy target: **Railway** (persistent worker + Postgres + cron). Portable to Render / Vercel+Supabase.

## Two-machine hygiene
- Start of session: `git pull`
- End of session: `git commit` + `git push`
