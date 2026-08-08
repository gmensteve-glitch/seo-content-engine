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

### Step 1 — Install Node (5 min)
- Install Node 20+ (via nvm, no admin password needed).
- Then I scaffold: `create-next-app` (TS, App Router, src dir) + install deps
  (`prisma @prisma/client`, `inngest`, `next-auth`, `@anthropic-ai/sdk`, UI libs).
- The pre-written `prisma/` and `src/lib/` files slot straight in.

### Step 2 — Validate before deep build (Claude Desktop, parallel)
- Run keyword research + gap-map on **trustedcaskets.com** by hand in Claude Desktop.
- Confirms data quality + output quality before we invest in the full app.

### Step 3 — Single-business vertical slice
Build the smallest end-to-end path that actually works:
- [ ] DB up (local Postgres or Supabase) + `prisma migrate`
- [ ] Connectors: GSC (free MCP/OAuth) + DataForSEO
- [ ] Intake agent → generate trustedcaskets `client.md`
- [ ] Deep-research agent → one real gap-map brief
- [ ] Writer → grader loop → one PASSED draft
- [ ] Shopify adapter wired → publish ONE post to trustedcaskets
- [ ] Pipeline board UI showing that item move across columns

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
