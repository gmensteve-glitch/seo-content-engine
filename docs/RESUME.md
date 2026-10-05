# RESUME — read this first in every new session

> New operator or new Claude session: paste **"Read docs/RESUME.md and docs/OPERATING-SOP.md, then tell me the current state and wait for instructions."** Do not start changing code until you have read both.

Last updated: 2026-10-05. Keep this file current: when you ship something that changes how the system works, update the section it belongs to in the same commit.

## What this is

A multi-store SEO content engine: a Next.js 16 dashboard plus Claude agents that write, grade and (for blogs) publish content for Shopify stores.

| Store | Domain | Role |
|---|---|---|
| Overnight Caskets | overnightcaskets.com (`overnight-casket.myshopify.com`) | The money-maker. Caskets. |
| Signature Headstones | signatureheadstones.com (`signatureheadstones.myshopify.com`) | Second store. Headstones and grave markers. A different line of business, see "Industry packs". |
| Trusted Caskets | trustedcaskets.com | Sandbox / seed data. |

- **Live dashboard:** https://seo-content-engine-production-22cc.up.railway.app (logins in `docs/OPERATING-SOP.md` §9)
- **Repo branch that deploys:** `claude/project-onboarding-w8hlg2`. Railway builds and deploys every push to it. Never push to any other branch.
- **Hosting:** Railway (web service + Postgres). Migrations run at deploy via `prisma/init-db.mjs`.
- **Owner:** Steven (steven@overnightcaskets.com). Shopify owner account is Jeffrey Vaynberg.

## Two product areas

### 1. Blog (automated, with one human gate)
Ideas → brief → human approves → write → grade (0–100, revise loop) → publish as a **hidden** Shopify draft → human flips live → 90-day refresh. Code: `src/lib/pipeline/service.ts`, agents in `src/lib/agents/` (ideator, research, writer, grader, enricher, linker, finalize), scheduler in `src/lib/jobs/scheduler.ts`. Dashboard: Overview, Pipeline, Ideas, Ready to publish, Needs refresh.

### 2. Category pages (fully manual by design)
SEO editorial copy for every Shopify collection page. The engine writes paste-ready blocks; a person pastes them into Shopify and presses "mark as live". **There is no push-to-Shopify for category pages and there must never be one. No images. No author names or roles.** Code: `src/lib/categories/` (discover, facts, policies, industry, assemble, service), writer in `src/lib/agents/category-writer.ts`, UI in `src/app/categories/` and `src/components/category-*.tsx`. Dashboard: Category pages → Queue / Live pages. Operator SOP: the "Category Pages SOP" artifact (link in "Documents").

Flow per page: scan site (public `/collections.json` + sitemap) → draft = fresh catalog facts (`/collections/<handle>/products.json`) + store policy pages + brief (Opus) + draft (Opus, JSON blocks) + editor pass + deterministic fact-check + rubric grade (Sonnet) + up to 2 revise loops → DRAFT_READY or NEEDS_FIX → human reviews (Read / Edit / Score / HTML / Text tabs; highlight-to-fix; fix with a note) → pastes → marks live → refresh flagged after 90 days.

Tiers: 1 hub (1,500–2,000 words, table, 6–8 FAQs), 2 sub-collection (800–1,200), 3 state/colour/size variant (300–500). Assigned at scan by `tierFor` in `discover.ts`; editable per page in the Details drawer.

## Industry packs (how the engine knows a line of business)
`src/lib/categories/industry.ts`. One pack per industry (`caskets`, `headstones`, `general`), chosen by `industryFor(business)` from the name/domain/profile. A pack holds: hub handles, colour patterns, the only allowed external authority links, the accurate legal statement the writer may make, required sections, local-page rules, catalog attribute extractors, buyer questions, default blog pillars, and the blog's local angles. Everything downstream reads the pack; nothing assumes caskets any more.

Two facts that must stay correct:
- **Caskets:** the FTC Funeral Rule (federal) means a funeral home must accept a casket bought elsewhere with no handling fee.
- **Headstones:** the FTC Funeral Rule does **not** cover cemeteries or monument dealers. Cemeteries generally accept outside memorials that meet their written rules and charge their own setting fee. The VA furnishes a free headstone/marker/medallion for eligible veterans in any cemetery. Never claim a cemetery is forced to accept a stone, never quote a named cemetery's fees, never cite a statute by number.

A pack can also name `offTopic` subjects (headstones: caskets/coffins). For such a store, `tidyBlogPipeline` (runs before every auto-advance and replenish) deletes matching unpublished drafts (in progress, Ready or scheduled), rejects matching pending briefs and dismisses matching proposed ideas; the ideator drops matching proposals. Published posts are never touched. `industryFor` decides on the store's name and domain first; the profile only breaks a tie.

To add a new store in a new industry: add a pack, done.

## Shopify connection
Client-credentials grant against a Dev Dashboard app installed on the store (`src/lib/connectors/shopify-oauth.ts`, `connectShopifyWithAppCredentials` in `pipeline/service.ts`). Tokens last ~24h and are refreshed automatically (`freshCmsConfig`). Env `SHOPIFY_APP_CLIENT_ID/SECRET` is Overnight's app. **Signature Headstones is a separate Shopify organization**, so it has its own app; its credentials are stored encrypted on its connector (entered via "This store has its own app" on Connectors). The connection is only needed for blog publishing; category pages read the public storefront.

## Search Console (per store)
One shared Google service account (`GOOGLE_SERVICE_ACCOUNT_JSON`) reads every store's data; the **property is per store** (`gscSiteFor` in `src/lib/connectors/gsc.ts`). The store's own GSC connector (Connectors → Google Search Console, e.g. `sc-domain:signatureheadstones.com`) wins; the legacy `GSC_SITE_URL` env is used only for the store whose domain it names. A store with neither gets no Search Console data, never another store's. For a store to get data, a GSC owner must add the service account's `client_email` as a Restricted user on that property. Saving the connector test-reads the property and, if Search Console refuses, names the service-account email to add. (Before 2026-10-02 every store read the one env property, which is why Signature Headstones showed casket keywords; its stored KeywordRank rows were cleared by a migration.)

## Duplicates (blog side)
Before proposing, the ideator sees every idea, every draft, and every post already live on the store (`src/lib/connectors/site-posts.ts`: the public `sitemap_blogs` list, all blogs, cached 6h; works without a Shopify connection). Proposals are then filtered by `findDuplicate` (`src/lib/pipeline/dedupe.ts`): topic-word overlap ≥ 0.6, and a different state/city is never a duplicate. `tidyBlogPipeline` also dismisses proposed ideas that repeat a live post, a draft, or a higher-scored idea, and auto-advance re-checks before it builds. The deterministic check is deliberately conservative (Jaccard only); rewordings of a live post are mainly caught by the ideator, which is given the full live list. (The first version on 2026-10-05 also had a "short title contained in a long one" rule and a stem-before-stopword bug; together they dismissed Signature's whole idea box and blocked every new idea. Fixed the same day.) The Generate ideas button now shows a spinner and says how many ideas were added or why proposals were skipped; the Railway log prints `[ideas] <store>: proposed N, added N, repeats N, off-topic N, live posts seen N`.

## Blog layout: "In this guide" + "What to know first" (no Quick answer)
Every blog opens with its intro (plain prose that answers the title's question; there is deliberately **no** bold "Quick answer" block), then two boxes, matching the posts the old tool (airpos) made:
- **In this guide**: up to 6 numbered, **plain-text** section labels (short, reader-friendly, need not match the heading). Deliberately **no jump links** (owner decision 2026-10-05); an entry that is a link is flagged and converted to plain text, no AI call.
- **What to know first**: exactly 5 takeaways, one sentence each, **at most 15 words**, each restating something the article says.

`src/lib/agents/guide-blocks.ts` owns it: `guideIssues` checks a draft, `ensureGuideBlocks` keeps valid blocks or rebuilds them with one small Sonnet call (one retry), and folds any old Quick answer back into intro prose and drops an old "Table of contents". It runs after writing and after each revise in `runPipelineForBrief`, and `sweepGuideBlocks` (scheduler, every 2 min, 4 drafts per tick) fixes every PASSED/FAILED, unrejected, unpublished draft, so Ready/review pieces written before this change, and anything a boost/refresh/edit left off-spec, get them too. `markdownToHtml` renders the two sections as inline-styled boxes (off-white, plum accent, theme heading font). The linker never links inside them; the meta description ignores them; the grader's AEO criterion expects them and no longer asks for a Quick answer.

## Models and spend
`src/lib/ai/claude.ts`: Opus 5 for ideas, briefs and writing; Sonnet 5 for grading and intake; Haiku 4.5 for extraction (Haiku takes no `thinking`/`effort`). All calls stream. Opus calls use the server-side refusal fallback beta and fall back to a plain call if the beta is rejected. Stable prompt blocks (industry primer, rules, catalog facts, policies, links) are sent as cached system blocks via `context: []`; the Railway log prints one line per call with `cached=` so you can verify hits. Per-page cost is accumulated by `withCostScope` and shown on the Score tab. Price table in `src/lib/ai/cost.ts` (Opus 5 $5/$25, Sonnet 5 $2/$10, Haiku 4.5 $1/$5 per million). A hub page costs roughly $0.35–0.55.

DataForSEO is intentionally **off** (owner decision, Sept 2026). The code degrades cleanly without it. Firecrawl is used only by brand intake when a store is added.

## Deploy and verify
```bash
npm ci && npx prisma generate
npx tsc --noEmit
npx eslint src
rm -rf .next/types && npm run build     # stale .next/types cause phantom type errors after deleting routes
git commit && git push -u origin claude/project-onboarding-w8hlg2
```
Every push redeploys Railway and **kills any category draft running in-process**. Recovery flips stuck DRAFTING rows back (3-minute cutoff at boot, 15-minute sweep every 5 min, and on page load). Drafts heartbeat between stages so a long hub draft is not mistaken for a stuck one.

## Gotchas (don't re-learn these)
- Prisma is pinned to v6. Do not upgrade. `npx prisma generate` after any schema change; migrations live in `prisma/migrations/`.
- Inngest v4 signature: `createFunction(options, handler)` with `triggers` inside options.
- `react-hooks/set-state-in-effect` and `react-hooks/purity` lint rules are on: derive state, don't set it in effects; no `Date.now()` in render (compute `statusMinutes` server-side).
- Overnight's Shopify handle is `overnight-casket` (singular, hyphen), not `overnightcaskets`.
- Shopify's stock FAQ template (fake 555-1234 number, "free returns within 30 days") is skipped by the policy scraper. Signature Headstones still has it live and should replace it.
- Railway answering `{"status":"error","code":404,"message":"Application not found"}` on every URL means the service is stopped (billing/plan), not a code bug.
- Fetches to stores and connectors all have timeouts (10–45s). Keep it that way.

## Documents
- `docs/HOW-IT-WORKS.md` — the whole system end to end: both product areas, industry packs, models and caching, connectors, data model, dashboard routes, where to look for what. Read this second, after this file.
- `docs/OPERATING-SOP.md` — the blog side, A to Z, with logins.
- `README.md`, `docs/ARCHITECTURE.md`, `docs/AGENT-PIPELINE.md`, `docs/BUILD-PLAN.md`, `docs/SEO-Strategic-Plan.md` — August 2026, written before category pages and Signature Headstones existed. Background and original intent only; where they disagree with this file or HOW-IT-WORKS.md, this file wins.
- Category Pages SOP (artifact): https://claude.ai/code/artifact/b17a18b9-105e-4da2-ac2e-1ff9ef1451e5
- Signature Headstones Brief (artifact): https://claude.ai/code/artifact/a06699e5-e444-420f-ab58-5858d5c11ba1 — what the engine learned about the headstone business, the 26-page plan, the audit.
- Category Pages Playbook (artifact): https://claude.ai/code/artifact/d73e2fcc-c678-433b-938f-79e7dad69af1
- Ask the owner to share these from each artifact's share menu; they are private by default.

## Open items (as of 2026-10-01)
- Signature Headstones: run the first scan and first hub draft (Upright Headstones); fix the FAQ template and the shipping-policy email typo on the live site.
- Search Console: Signature Headstones' property is saved on its connector; confirm a GSC owner added the service account to signatureheadstones.com (otherwise its Overview stays empty). Overnight still runs off the `GSC_SITE_URL` env; optionally save its property on its connector too. Casket ideas/briefs/unpublished drafts on Signature are removed automatically by `tidyBlogPipeline` (2026-10-05) and Ready refills with headstone pieces.
- Auto-publish schedule for blogs: owner said hold off.
- Rotate the Shopify client secrets that were pasted into chat (both stores) in the Dev Dashboard, then reconnect on Connectors.

## Working rules for any Claude session on this repo
1. Read this file and `docs/OPERATING-SOP.md` before touching code.
2. Ship complete work: typecheck, lint, build, commit with a clear message, push to the deploy branch. Never push elsewhere, never open a PR unless asked.
3. Category pages stay manual, text-only, anonymous. Prices only from the live catalog. Legal claims only as the industry pack states them.
4. Keep this file current.
