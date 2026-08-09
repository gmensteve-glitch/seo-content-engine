# SEO Content Engine

An autonomous, multi-business SEO content engine — the "operating system" for creating, grading, publishing, and improving SEO/AEO content at scale. Built to plug into different businesses (starting with `trustedcaskets.com`, then `overnightcaskets.com`).

## What it does

Runs the full content loop from one dashboard:

```
Strategy → Idea box (auto-scored) → Brief (you approve) → Deep research →
Write (SEO/AEO template) → Grade 0–100 (revise until it passes) →
You add experience → Internal linking → Publish → Get indexed →
Monitor (GSC) → Self-improve → repeat, at city scale
```

The one human gate is **approving briefs**. Everything else is automated.

## Why it's different

- **0–100 blog quality grader** with a revise-until-it-passes loop (logged so you learn what "great" looks like).
- **Deep competitive research engine** that builds a "gap map" content brief before writing.
- **Multi-business by design** — one shared engine + a config bundle per business.
- **Portable** — standard stack, not locked to any host.

## Planned stack

| Layer | Choice |
|---|---|
| Dashboard UI + API | Next.js |
| Database | Postgres + Prisma |
| Long AI jobs + scheduling | Inngest / Trigger.dev (avoids serverless timeouts) |
| AI agents | Claude API |
| Auth (multi-tenant) | NextAuth |
| Results/analytics | Embedded Looker Studio (GSC + GA4) |
| Data sources | Google Search Console, DataForSEO, GA4, Google Maps API |
| CMS publishing | Adapter pattern — Shopify first, then WordPress / Webflow |
| Hosting (deploy target) | Railway (portable to Render / Vercel+Supabase) |

## Repo layout

```
docs/                 Strategy, plans, the A→Z guide
  SEO-Strategic-Plan.md
  SEO-Content-Engine-Guide.pdf
  seo-content-engine-guide.html
```
(App code lands here once the stack is scaffolded.)

## Build phases

1. **Validate** — run the workflow in Claude Desktop on trustedcaskets (no app yet).
2. **Single-business app** — pipeline board + grader + Shopify publishing.
3. **Results tab** — embed Looker Studio.
4. **Multi-tenant** — workspaces + CMS adapters, onboard any business.

## Status

🟢 Scaffolded & running. Next.js (TS + Tailwind + App Router) app boots; Prisma 6 client generated; foundation code type-checks clean; linked to GitHub. Next: local Postgres + connectors, then the first single-business vertical slice on trustedcaskets. See `docs/BUILD-PLAN.md`.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:3000
```
Copy `.env.example` → `.env` and fill in keys as you connect each service.
