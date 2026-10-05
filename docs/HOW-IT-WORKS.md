# How it all works

The whole system, end to end, in one place. Read `RESUME.md` for the current state and open items; read this for how the pieces fit. Written October 2026 for the handoff.

## 1. The shape of the system

```
                 ┌──────────────────────────────────────────────┐
                 │  Dashboard  (Next.js 16, src/app)            │
                 │  what people see and press                   │
                 └──────────────┬───────────────────────────────┘
                                │ server actions / API routes
                 ┌──────────────▼───────────────────────────────┐
                 │  Services   (src/lib/pipeline, src/lib/categories)
                 │  the business logic: what happens when        │
                 └───┬──────────────┬──────────────┬────────────┘
                     │              │              │
          ┌──────────▼───┐  ┌───────▼───────┐  ┌───▼──────────────┐
          │ Agents       │  │ Connectors    │  │ Database         │
          │ (Claude)     │  │ Shopify, GSC, │  │ Postgres via     │
          │ src/lib/agents│ │ Firecrawl…    │  │ Prisma (prisma/) │
          └──────────────┘  └───────────────┘  └──────────────────┘
                     ▲
          ┌──────────┴───────────────────────────────────────────┐
          │ Scheduler (src/lib/jobs/scheduler.ts)                │
          │ timers that keep the blog side moving on its own     │
          └──────────────────────────────────────────────────────┘
```

Everything runs in one Railway web service. There is no separate worker: the scheduler starts inside the web process at boot, and category drafts run inside it too. That is why a redeploy interrupts an in-progress draft, and why there is recovery code for exactly that.

## 2. Multi-store

Every table in the database hangs off a `Business` row (one per store). A cookie holds the active business; `activeBizId()` in `src/lib/active-business.ts` reads it, and every service function takes a business id or falls back to the active one. The store picker at the top left of the dashboard sets the cookie. Adding a store (`/api/businesses/add`) creates the `Business`, gives it the industry pack's default pillars, kicks off a brand intake crawl, and switches to it.

Nothing is shared between stores except the code and the environment variables. Connectors, drafts, category pages, pillars and profiles are all per store.

## 3. The two product areas

### 3a. Blog pipeline (automated with one human gate)

```
Ideas ──► Brief ──► [approve] ──► Write ──► Grade ──► Ready ──► Publish (hidden) ──► Live ──► Refresh (90d)
```

| Stage | Code | Model | What happens |
|---|---|---|---|
| Ideas | `agents/ideator.ts`, `generateIdeas` in `pipeline/service.ts` | Opus | Proposes titled ideas against the store's pillars, split LOCAL (geo) / EVERGREEN by the store's `localRatio`. Local angles come from the industry pack. Sees every idea, draft and live post on the store; proposals that repeat one (`pipeline/dedupe.ts`) or are off-topic for the pack are dropped. `tidyBlogPipeline` re-applies both rules before each auto-advance. |
| Brief | `agents/research.ts` | Opus | Angle, outline, questions, gap. SERP + competitor scrape only if DataForSEO/Firecrawl are on (they're off; it degrades). |
| Write | `agents/writer.ts` | Opus | Markdown draft in the SEO/AEO template: quick answer, H2s, FAQ, JSON-LD. Industry pack supplies the legal rule and what must never be invented about our own operations. |
| Grade | `agents/grader.ts`, `grader/rubric.ts` | Sonnet | 0–100 across eight dimensions; `writer.reviseDraft` fixes the weakest; loops until it passes the store's `qualityThreshold` or runs out of loops. |
| Guide boxes | `agents/guide-blocks.ts` | Sonnet (only when off-spec) | "In this guide" (≤6 jump links) + "What to know first" (exactly 5 takeaways, ≤15 words each) after the intro; no Quick answer. Enforced after write/revise and by the `sweepGuideBlocks` tick for everything in Ready/review. |
| Finalize | `agents/finalize.ts`, `agents/linker.ts` | — | Strips placeholders, guarantees valid JSON-LD, adds internal links to real published pages. |
| Boost | `boostDraft` in `pipeline/service.ts` | Sonnet/Opus | A near-miss gets real product facts (from Shopify) woven in and is re-graded. |
| Publish | `publishNow` in `pipeline/service.ts`, `cms/shopify.ts` | — | Creates a **hidden** article in the store's Shopify blog. Throws on failure (never pretends). |
| Refresh | `autoRefreshAll`, `relocalizePost` | Opus | Live posts past 90 days are rewritten into Ready again. |

Human gates: approving a brief, and flipping a hidden draft live in Shopify. Everything else is the scheduler.

Scheduler timers (`jobs/scheduler.ts`): worker + boost every 45s, auto-advance (idea → brief → ready) on its interval, replenish ideas every 6h, publish every 5m, GSC/geo sync, refresh tick, category recovery every 5m. If `INNGEST_*` env is set the in-process scheduler stands down and Inngest owns the crons (`jobs/` + `/api/inngest`).

### 3b. Category pages (manual by design)

```
Scan ──► Draft ──► Review ──► (Fix) ──► Paste into Shopify ──► Mark live ──► Refresh flag (90d)
```

| Step | Code | What happens |
|---|---|---|
| Scan | `categories/discover.ts`, `rescanCategoryPages` | Reads the public `/collections.json` and the sitemap. Every published collection becomes a `CategoryPage` row with title, product count, a starting keyword and a tier. Removed collections are flagged, never deleted. |
| Tier | `tierFor`, `biggestHandles` | 1 = hub (industry-named head terms + the store's three biggest general collections), 3 = state/regional/size-variant/small colour pages, 2 = everything else. |
| Facts | `categories/facts.ts` | At draft time, reads `/collections/<handle>/products.json`: price range, every variant price, sizes, materials, colours, styles, variant options, a product sample. The only source of numbers. |
| Policies | `categories/policies.ts` | Scrapes the store's shipping/refund/FAQ pages (skips Shopify's unedited FAQ template). The only source of shipping/returns claims. Cached 7 days on the business. |
| Brief | `agents/category-writer.ts` `buildCategoryBrief` | Opus. Keyword, angle, section plan, buyer questions. |
| Draft | `writeCategoryDraft` | Opus, structured JSON: h1, intro, sections (Markdown), optional comparison table, FAQs, why-us, related guides, SEO title, meta. |
| Editor pass | `tightenCategoryDraft` | Opus, medium effort. Cuts repetition; may not add facts. |
| Assemble | `categories/assemble.ts` `assembleBodyHtml` | Deterministic HTML with unique heading ids, same-tab internal links, FAQ, why-us. Also `faqJsonLd`, `draftAsMarkdown`, `bodyAsText`. |
| Fact-check | `assemble.ts` `factCheck` | Deterministic gate: every `$` figure must be in the catalog (or clearly framed as market pricing near the figure); internal links only from the allow-list (compared by path); external links only to the pack's authority hosts; no placeholders, images or invented credentials; length limits. |
| Grade | `gradeDraft` with category grading notes | Sonnet. Same rubric as blogs, judged as a category page. |
| Loop | `draftCategoryPage` in `categories/service.ts` | Up to two revise loops, keeping the better result. Ends in `DRAFT_READY` (clean + above threshold) or `NEEDS_FIX` (issues listed). |
| Review UI | `components/category-review.tsx` | Read (highlight → Fix this), Edit (dirty-state Update), Score, HTML, Text tabs; Fix with a note (optionally remembered as a house rule); Details drawer (facts, plan, strategy, redraft). |
| Live | `markCategoryLive` | Stores a snapshot hash and a refresh date 90 days out. `drifted` shows if the blocks change after that. `flagCategoryRefreshes` flips due pages to `NEEDS_REFRESH`. |

Status machine: `NOT_STARTED → DRAFTING → DRAFT_READY | NEEDS_FIX → LIVE → NEEDS_REFRESH → DRAFTING …`. Priority order in the Queue: ready → needs a look → refresh due → not started → writing → live.

Resilience: the draft heartbeats its row between stages; a `DRAFTING` row not touched for 15 minutes is treated as orphaned (3 minutes at boot) and flipped back with a note; a second start on a live draft is ignored; every outbound fetch has a timeout.

## 4. Industry packs

`src/lib/categories/industry.ts`. `industryFor(business)` picks `caskets`, `headstones` or `general` from the store's name, domain and profile. Consumers:

| Consumer | What it takes from the pack |
|---|---|
| `discover.ts` | hub handles / pattern, colour pattern |
| `facts.ts` | material words, colour words, style words, attribute extractors |
| `category-writer.ts` | primer, legal rule and don't-say, required sections, table hint, promise rule, local rules, authority links, offline fallbacks |
| `assemble.ts` (via service) | authority hosts for the fact-check |
| `categories/service.ts` | grading notes |
| `agents/ideator.ts` | local angles, primer |
| `agents/writer.ts` | operational rule, legal rule, local guidance |
| `pipeline/service.ts` | default pillars on store creation, relocalize note |

The legal facts encoded there are the ones most likely to be gotten wrong; they are spelled out in `RESUME.md`.

## 5. Models, caching, cost

`src/lib/ai/claude.ts` is the only place that talks to Anthropic.

- Tiers: `MODELS.ideas/research/writer` = Opus 5; `grader/intake` = Sonnet 5; `extract/keyword` = Haiku 4.5. `PIPELINE_MODEL` env overrides the Opus/Sonnet stages at once; `cheap: true` pins a call to Haiku regardless.
- Every call streams and takes the final message. Opus calls use the server-side refusal fallback beta and retry plain if the account rejects the beta.
- Adaptive thinking with an `effort` level per stage; Haiku gets neither.
- `structured()` enforces a JSON schema via `output_config.format`, retries a malformed reply once, and names `max_tokens` cut-offs clearly.
- **Caching:** `system` plus the `context: []` blocks are sent as cache-marked system blocks. Category calls pass the business block (voice, profile, primer, rules) first and the page block (facts, policies, links) second, so the 5–7 calls per page re-read them at ~10% price. Cache hits are visible in the Railway log: `[claude] model in= cached= cacheWrite= out= ≈ $`.
- **Cost:** `src/lib/ai/cost.ts` prices each call (Opus 5 $5/$25, Sonnet 5 $2/$10, Haiku 4.5 $1/$5 per million) and `withCostScope` sums a piece's calls into `costCents`, shown on the Score tab.

## 6. Connectors

`src/lib/connectors/` plus `cms/shopify.ts`. Credentials are stored per store in `Connector.configEnc`, encrypted with `CONNECTOR_ENCRYPTION_KEY` (`crypto/secrets.ts`). `saveConnector` health-checks CMS credentials before storing them, so "connected" means "can publish".

- **Shopify:** client-credentials grant against a Dev Dashboard app installed on the store. Token ~24h, refreshed by `freshCmsConfig` before every CMS call. Env `SHOPIFY_APP_CLIENT_ID/SECRET` = Overnight's app; a store in another Shopify organization stores its own app's credentials on its connector ("This store has its own app"). Used only for blog publishing and product facts.
- **Google Search Console:** one shared service account (`GOOGLE_SERVICE_ACCOUNT_JSON`), one property per store, resolved by `gscSiteFor` (`connectors/gsc.ts`): the store's GSC connector, else `GSC_SITE_URL` only if it is the store's own domain. Feeds the ideator's page-2 opportunities, rank sync, decay-driven refresh and the Overview panel, always for that store only.
- **Store blog sitemap:** `connectors/site-posts.ts` reads every live article from the store's public sitemap; the ideator and `findDuplicate` (`pipeline/dedupe.ts`) use it so the engine never re-writes a post already on the site.
- **GA4 / Maps:** optional.
- **Firecrawl:** page scraping for brand intake (and competitor pages when DataForSEO is on).
- **DataForSEO:** SERP and keyword volume. Off by owner decision; every call site degrades.
- **Slack:** recommendations to a channel. Optional.

## 7. Data model (the tables that matter)

`prisma/schema.prisma`. Migrations in `prisma/migrations/`, applied at deploy by `prisma/init-db.mjs`.

| Table | Holds |
|---|---|
| `Business` | A store: name, domain, CMS, profile, brand voice, quality threshold, local ratio, policy cache. |
| `Pillar` | Content themes per store. |
| `Idea → Brief → Draft → Page` | The blog pipeline, one row per stage, each pointing at the previous. `Draft` carries body, score, status, cost. `Page` is the published article. |
| `CategoryPage` | One per collection: live title/count, tier, keyword, status, all the written blocks, grade, facts/brief/draft JSON, cost, loops, live snapshot, refresh date. Unique on `(businessId, handle)`. |
| `Connector` | Per-store credentials, encrypted. |
| `ContentFeedback` | House rules learned from "remember this" fixes; injected into every future prompt via `buildContentGuidance`. |

## 8. The dashboard

`src/app/` routes; `src/components/` UI; `src/app/**/actions.ts` server actions. Login is a password gate (`middleware`/proxy + `/login`). Theme is CSS variables in `globals.css`.

| Route | Page |
|---|---|
| `/` | Overview |
| `/pipeline`, `/ideas`, `/ready`, `/refresh`, `/review/[id]` | Blog side |
| `/categories`, `/categories/[id]`, `/categories/live` | Category pages |
| `/performance`, `/geo`, `/recommendations` | Measurement |
| `/setup`, `/strategy`, `/connectors` | Setup |
| `/api/shopify/oauth/*`, `/api/businesses/*`, `/api/review/*`, `/api/inngest` | API routes |

Patterns: server components fetch data; client components handle interaction; mutations are server actions that `revalidatePath` afterwards; long jobs (drafts) are fire-and-forget from the action and the page polls (`category-poll.tsx`) while a row is `DRAFTING`.

## 9. Deploy

Push to `claude/project-onboarding-w8hlg2` → Railway builds (`npm run build`), runs `prisma/init-db.mjs` (migrations), starts `next start`. The scheduler boots with the process. Env vars live in Railway's Variables tab; none are in the repo. Before pushing: `npx tsc --noEmit`, `npx eslint src`, `rm -rf .next/types && npm run build`.

## 10. Where to look when

| You want to… | Start at |
|---|---|
| Change how a category page is written | `agents/category-writer.ts` (`guidance`) or the industry pack |
| Change what the fact-check allows | `categories/assemble.ts` `factCheck` |
| Change the Queue or Review screens | `components/category-list.tsx`, `components/category-review.tsx`, `app/categories/` |
| Change tiers or which collections are hubs | `categories/discover.ts` `tierFor` |
| Change blog writing rules | `agents/writer.ts`, house rules via `buildContentGuidance` |
| Change models or effort | `ai/claude.ts` `MODELS` and the per-call `effort` |
| Add a store in a new industry | `categories/industry.ts`: add a pack |
| Debug a Shopify connection | `connectors/shopify-oauth.ts`, `connectShopifyWithAppCredentials`, `freshCmsConfig` |
| See what a draft cost and why | Score tab; Railway log `[claude]` lines |
