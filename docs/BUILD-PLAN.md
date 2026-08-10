# Build plan (ordered checklist)

## ✅ Done (this session, no tooling needed)
- [x] Local git repo + first commit
- [x] README, .gitignore
- [x] Data model (`prisma/schema.prisma`) — multi-tenant
- [x] CMS adapter interface + Shopify stub + registry (`src/lib/cms/`)
- [x] 0–100 grader rubric (`src/lib/grader/rubric.ts`)
- [x] `.env.example`
- [x] Architecture + agent-pipeline specs (`docs/`)

## ⏭ Next when you're back (needs your input / installs)

### Step 0 — Connect GitHub (5 min, you)
- Create private repo `seo-content-engine` on GitHub (no README).
- Create a `repo`-scoped access token.
- Give me your GitHub username → I wire the remote → you push once (token cached in keychain).

### Step 1 — Install Node + scaffold ✅ DONE
- [x] Node v24.19.0 installed via nvm (no admin needed).
- [x] `create-next-app` scaffolded (TS, App Router, src dir, Tailwind, ESLint) and merged with our foundation files.
- [x] Deps installed: `@prisma/client`, `prisma` (pinned to v6 — v7 dropped the classic `url` datasource), `@anthropic-ai/sdk`, `inngest`, `zod`.
- [x] `prisma generate` OK. Dev server boots + serves. `tsc --noEmit` clean.
- Note: `next-auth` deferred until we build the auth/multi-tenant step.

### Step 2 — Validate before deep build (Claude Desktop, parallel)
- Run keyword research + gap-map on **trustedcaskets.com** by hand in Claude Desktop.
- Confirms data quality + output quality before we invest in the full app.

### Step 3 — Single-business vertical slice
Code is written & compiles (`tsc` clean, `next build` passes). Runtime steps below need a DB + API keys.
- [x] **Dashboard UI** — shell, business switcher, pipeline board, briefs, quality scorecard, overview, connectors, performance, ideas, strategy, geo (seeded trustedcaskets mock data)
- [x] **Backend modules (code-complete):**
  - [x] Claude wrapper (`ai/claude.ts`)
  - [x] Connectors: DataForSEO, Firecrawl, GSC (+striking-distance), Google Maps
  - [x] Agents: intake, deep-research (gap-map brief), writer (+revise), grader (0–100 + revise-until-pass loop)
  - [x] Shopify adapter (real Admin API publish/update/list/healthCheck)
  - [x] Inngest content pipeline job + serve route
  - [x] Secret encryption (AES-256-GCM)
- [x] **DB layer wired:** Prisma client singleton (`src/lib/db.ts`), initial migration (`prisma/migrations/`), and a seed (`prisma/seed.mjs`, `npm run seed`) that mirrors the sample businesses into real tables. Verified end-to-end against a local Postgres: every dashboard page renders from the DB.
- [x] Swapped the repository layer (`data/repo.ts`) from mock seed → Prisma queries. KPIs/flags/scorecard are now **derived** from rows. Falls back to the mock automatically when `DATABASE_URL` is unset, so `npm run dev` still works with zero setup.
- [ ] **Still needs your input:** add real API keys (Anthropic, DataForSEO, Firecrawl, GSC OAuth, Maps) to `.env`, point `DATABASE_URL` at a real Postgres.
- [ ] Run intake on trustedcaskets → real `client.md`; then one brief → draft → grade → publish end-to-end

### Step 4 — Results tab
- [ ] Build a Looker Studio report (GSC + GA4) → embed in Performance tab.

### Step 5 — Automate
- [ ] Inngest jobs for writer/grader/publish
- [ ] Schedules: GSC sync, publish queue, improve sweep

### Step 6 — Multi-tenant + scale
- [ ] Onboarding wizard (URL → intake → connectors → pillars)
- [ ] Business switcher + memberships/auth
- [ ] Geo campaign mode (city list + Maps API) for casket resource pages
- [ ] Add overnightcaskets.com as business #2

### Step 7 — Deploy
- [ ] Push to Railway (Postgres + web + worker) — I'll give exact steps.

## Decisions locked
- Stack: Next.js + Postgres/Prisma + Inngest + Claude API + NextAuth.
- Host target: Railway (portable).
- First business/testbed: trustedcaskets.com (Shopify).
- Results: embed Looker Studio (don't rebuild analytics).
