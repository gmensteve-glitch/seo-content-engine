# The Claude Code SEO Machine — Strategic Plan & Stack

*Synthesized from two videos + current API/tool research (Aug 2026)*

---

## Part 1 — What the two videos actually are (and why they fit together)

**Video 1 — "Claude Code skills replaced your SEO stack (12 free tools)"** (the *Claude SEO* skill pack by agricidaniel)
This is the **CAPABILITY layer** — 12 specialist skills you invoke as `/seo-*` commands:

| Skill | What it does |
|---|---|
| `seo-audit` | Full-site audit → SEO health score + PDF report |
| `seo-page` | Deep single-page analysis |
| `seo-sitemap` | Analyze existing XML sitemap + generate new one |
| `seo-schema` | Detect / validate / generate JSON-LD, microdata, RDFa (knows deprecated types) |
| `seo-images` | Image optimization analysis |
| `seo-technical` | Technical SEO |
| `seo-content` | E-E-A-T & content quality |
| `seo-geo` ⭐ | Generative Engine Optimization — get cited by ChatGPT/Gemini/Claude/Perplexity |
| `seo-plan` | Strategic SEO planning |
| `seo-programmatic` | Programmatic SEO at scale |
| `seo-competitor` | Competitor comparison-page generation |
| `seo-hreflang` | International / language targeting |

Key mechanics: runs ~5 agents in parallel (2–3 min for a full audit), uses **Playwright** for visual/mobile checks, has **quality gates** (warns at 100 pages / 30 location pages). GEO tip from the video: AI engines cite passages in a **~134–167 word sweet spot** — outside that they skip you. Free, one-command install from GitHub.

**Video 2 — "Built an entire SEO specialist team in 14 minutes"** (Launch Summit / AI Ranking School)
This is the **DATA + ORCHESTRATION layer**. Its whole thesis: *skills are worthless without real data.* It wires Claude to live data and runs a team of agents under one coordinator:

- **DataForSEO** (pay-as-you-go API) → keyword research, backlinks, competitor analysis, SERP rankings, AI-search data.
- **Windsor.ai** ($20/mo) → one connector for **Google Search Console + GA4 + Google Business Profile**.
- **8 agents** run by an orchestrator: intake → keyword research → technical audit → analytics → AI-search/GEO → on-page copy → blog/content → local SEO → reporting.
- Runs in **Claude Desktop** so it can produce **Artifacts** (shareable reports) and **Routines** (scheduled reruns).
- **Human-in-the-loop is mandatory** — nothing auto-publishes.

### The combined insight
> **Video 1 gives you the specialist skills. Video 2 gives them eyes (real data) and a manager (orchestration + scheduling).** Run either alone and you're half a system. Combined = a $1–2k/mo agency replaced by a stack you own for ~$20–70/mo.

---

## Part 2 — Your Strategic SEO Plan (4 phases)

### Phase 0 — Foundation (Day 1)
1. Install Claude Code + the **Claude SEO** skill pack (`github.com/agricidaniel` → Claude SEO).
2. Create a **`client.md`** per site (business type, services, locations, brand voice). Video 2's `seo-intake` agent auto-builds this from your URL — run it first.
3. Connect **live data** (Part 3 stack below). *Do this before running any analysis — data is the whole game.*

### Phase 1 — Diagnose (Week 1)
Run the "first four" in sequence (this order matters — later agents consume earlier outputs):
1. **Keyword research** → keyword map + priority clusters
2. **Technical audit** (`seo-audit`) → health score, crawl/index/schema issues
3. **Analytics** (GSC + GA4) → what's already ranking / decaying / quick wins
4. **AI-search / GEO** (`seo-geo`) → can AI crawlers reach you? are you citation-shaped?

Output = a health score + a prioritized issue list + a hand-off homework list.

### Phase 2 — Fix & Build (Weeks 2–6)
- **Technical fixes first** — schema (`seo-schema`), sitemap (`seo-sitemap`), images (`seo-images`), Core Web Vitals. These unblock everything else.
- **On-page copy** — turn money pages (services/products) into best-in-class pages using the keyword map.
- **Content engine** — blog/content agent, *but* you inject real experience (the video's strongest warning: don't let it write unsupervised → "AI slop"). Aim for the 134–167-word citable passage structure.
- **Programmatic + competitor pages** — for scale (location pages, comparison pages) once the template quality is proven.

### Phase 3 — Compound & Automate (Ongoing)
- Set **Routines** in Claude Desktop: weekly SEO scrape, fortnightly keyword map refresh, monthly full audit, daily/weekly content drafts.
- Every report → **Artifact** you can share with partners/clients.
- **Human-in-the-loop gate** on anything that publishes.

---

## Part 3 — The Recommended Stack (APIs & Integrations)

The videos give you a *good* baseline (DataForSEO + Windsor.ai). Here's how to make it genuinely best-in-class — with cheaper/stronger swaps flagged.

### Tier 1 — Core (get these first)

| Layer | Recommendation | Why | Cost |
|---|---|---|---|
| **SEO data API** | **DataForSEO** (official MCP server) | Cheapest live-data source for Claude; SERP, keywords, backlinks, on-page, Labs estimates. ~$0.0006/request, $50 min deposit, **no subscription**. (Backlinks: $0.05/1k vs Ahrefs $5/1k.) | Pay-as-you-go (~$20–50 to start) |
| **Your site's own data** | **GSC via free MCP** (`AminForou/mcp-gsc` or Suganthan's 20-tool GSC MCP) | Impressions, clicks, CTR, positions, URL inspection, sitemaps — *your* real performance. Free, self-hosted. | **Free** |
| **Skills** | **Claude SEO** skill pack (Video 1) | The 12 specialist commands. | Free |

> **Windsor.ai vs free GSC MCP:** Windsor ($20/mo) bundles GSC + GA4 + Google Business Profile in one click — worth it for **local businesses** or if you want zero setup. If you only need GSC (and are OK with a Google Cloud OAuth setup), the **free MCP** replaces most of it. Pick Windsor for convenience/local, free MCP to save money.

### Tier 2 — GEO / AI-Search visibility (the fastest-growing gap)
AI Overviews now cover ~48% of queries and ~93% of AI-Mode sessions end with **zero clicks** — being *cited* matters more than ranking blue links.

| Tool | Use | Cost |
|---|---|---|
| **`seo-geo` skill** | On-page GEO structuring (already in your stack) | Free |
| **Otterly.ai / Peec AI / Profound** | Track brand citations & share-of-voice across ChatGPT / Perplexity / Google AIO | Otterly cheapest entry; Profound = enterprise |
| **`llms.txt` file** | Tell AI crawlers what to read (Video 1 mentions this) | Free — just publish it |

**Recommendation:** start free (`seo-geo` + `llms.txt`), add **Otterly.ai** only once you have pages worth tracking.

### Tier 3 — Crawling & content extraction (power-ups for agents)

| Tool | Use | Cost |
|---|---|---|
| **Firecrawl** | Live full-page content extraction for competitor/content agents (has free tier) | Free → credit-based |
| **Serper** | Cheapest raw SERP data ($0.30–1.00 / 1k queries) if you don't want DataForSEO for SERP | ~$0.0005/query |
| **Screaming Frog (MCP wrapper)** | Deep technical crawl for large sites | Free ≤500 URLs / £199-yr |

### Tier 4 — Enterprise (skip unless you go agency-scale)
- **Ahrefs API v3** — strongest backlink DB + native **MCP** (Claude can query it directly). But **~$949/mo entry** (Advanced $449 + API $500). The 2026 standout is the MCP integration.
- **Semrush API** — cheaper *door* (Advanced $549/mo includes API + units at ~$50/M).

> **Verdict for a solo/small operator (you):** **DataForSEO covers 90% of what Ahrefs/Semrush APIs do at ~1/20th the cost.** Only move to Ahrefs API when you're reselling SEO to paying clients and need its backlink depth + native MCP.

---

## Part 4 — Your recommended build (concrete)

**Budget stack (~$20–50/mo, best value):**
```
Claude Code (Desktop app for Artifacts + Routines)
 ├─ Claude SEO skill pack ........... free  (the 12 skills)
 ├─ DataForSEO MCP .................. pay-as-you-go  (SERP/keywords/backlinks)
 ├─ GSC free MCP .................... free  (your real search data)
 ├─ seo-geo + llms.txt .............. free  (AI-search readiness)
 └─ [optional] Windsor.ai $20/mo .... GA4 + Google Business Profile in one click
```

**Add-ons as you grow:** Otterly.ai (AI-citation tracking) → Firecrawl (content extraction) → Ahrefs API (only at agency scale).

### First-week checklist
- [ ] Install Claude Code + Claude SEO skills
- [ ] Get DataForSEO account (API login + password) and connect its MCP
- [ ] Connect GSC (free MCP or Windsor.ai)
- [ ] Run `seo-intake` → build `client.md` for each site (overnightcaskets.com, etc.)
- [ ] Run the "first four": keyword research → `seo-audit` → analytics → `seo-geo`
- [ ] Publish an `llms.txt`
- [ ] Fix schema + sitemap + images from the audit
- [ ] Set a weekly audit Routine + a fortnightly keyword-map Routine

---

---

## Part 5 — Ryan's Content Engine (the "operating system" layer)

*Added after reviewing two Loom walkthroughs of Ryan's live system (SitePlan Creator, PermitRanger, Books & Friends, DirtMatch).*

Our Part 1–4 stack is a **workshop of specialist tools**. Ryan built a **factory that runs itself** on the same raw materials (Claude + DataForSEO + GSC). This is the gap to close.

### Ryan's proven loop
```
PILLARS/STRATEGY → IDEA BOX (auto-scored) → BRIEFS (human approves) → QUEUE
   → DEEP RESEARCH (Claude, daily) → GENERATE (fixed SEO/AEO template)
   → INTERNAL-LINK ENGINE (forward+backward, 3–5/page, anti-spam)
   → AUTO-PUBLISH via API/webhook → GSC MONITORS → SELF-IMPROVE → repeat
```
Receipts: 2,625 pages · 1.53M impressions · 365 indexed · ~290 clicks/24h · **5.3% conversion** · SitePlan Creator = **$13k/mo, zero employees**.

Tech choices: **DataForSEO (not SEMrush)** for competitor research · **Google Maps API** for local data (rule: 4.4★ / 20+ reviews only) · custom CMS on Repl.it · API/webhook push into Shopify/Webflow.

### The gap (what to build that our plan didn't have)
1. **Persistent CMS/database** — a system of record tracking every page's lifecycle + performance (not one-off reports).
2. **Idea box with scoring** + brief-approval gate → then autonomous publishing.
3. **Auto-publish on a cadence** via API/webhook into the live site.
4. **Internal-linking engine** — whole-site, forward+backward, 3–5 links, anti-spam rules.
5. **Continuous self-improvement loop** — striking-distance detection, CTR title/meta rewrites, content refresh from GSC + SERP.
6. **Programmatic geo pages at scale** — 300–1,000+ cities, unique content, Maps API for vetted local resources.

### Ryan's "perfect" page template (SEO + AEO)
Hero image → CTA (address/get-started) → Table of Contents → How-to schema (step-by-step) → "Common reasons rejected" → authoritative .gov links → contact info → more how-to schema → nearby cities → helpful articles → FAQ (schema marked up) → bottom CTA. **Every section schema-marked.**

### Casket-specific play (overnightcaskets.com)
Ryan named this exact use case: **geo resource pages for ~1,000 US cities** — "when someone passes away, here are the first people to call, here's a vetted list of local funeral homes, here are the help groups." Be the *authority/resource*, soft CTA (compare our casket prices). AI recommends helpful resources → you get cited → buyers convert. This is the highest-leverage move for the casket business.

---

## Part 6 — Deep Research Engine + 0–100 Blog Grader (your two priorities)

### 6A. Deep Competitive Research Engine
For any topic, before writing, produce a **content brief = gap map**:
- Top-10 SERP (DataForSEO) → each page scraped (Firecrawl): headings, word count, entities, schema, questions.
- People-Also-Ask + related keywords (DataForSEO) → questions to own.
- Your GSC data for the topic → what you already almost rank for.
- Backlink/authority gap (DataForSEO) → difficulty.
- Local layer (geo pages): Google Maps API, filtered to 4.4★ / 20+ reviews.
- **Output:** what everyone covers, what nobody covers (your wedge), target length, required entities, questions, schema. Feeds the writer AND becomes the grading benchmark.

### 6B. The 0–100 Blog Quality Grader + Feedback Loop
Every draft graded before it can publish. Fails → self-revises weakest dimensions → re-grades → passes = queue for approval; stuck = flag human.

| Dimension | Pts |
|---|---|
| Search-intent match (vs brief) | 15 |
| Depth vs top competitors | 15 |
| E-E-A-T / real first-hand experience | 15 |
| AEO readiness (schema, TOC, FAQ, how-to, 134–167-word citable passages) | 15 |
| Originality (no duplicate / no AI-slop tells) | 10 |
| Internal linking (3–5, forward+backward) | 10 |
| Readability & structure | 10 |
| Conversion (CTAs, next steps) | 10 |

Loop: `draft → grade → if <85 revise weakest → re-grade → repeat → pass/queue or flag`.

**Learning built in:** every grade logged with *why* + what changed. Per-post scorecards reveal what "great" looks like in your niche over time. (This is the upgrade over Ryan — he scores ideas, not finished blogs.)

---

## Part 7 — Recommended build path

**Phase 1 — Prove the core (Week 1):** Claude SEO skills + DataForSEO + GSC → run intake + "first four" on overnightcaskets.com. No engine yet, just validate data + output quality.

**Phase 2 — Research engine + grader (Weeks 2–3):** build 6A + 6B as skills/agents. This is the intelligence you asked for; it works even before the full CMS.

**Phase 3 — The engine (Weeks 3–6):** stateful CMS (Repl.it or lightweight local DB) → idea box + scoring → brief approval → queue. Add internal-linking engine.

**Phase 4 — Autonomy (Week 6+):** auto-publish via API/webhook into your site → GSC self-improvement loop → geo-page campaign (funeral resources by city) → Routines.

---

## Sources
- [DataForSEO 2026 guide (pricing + endpoints)](https://nextgrowth.ai/dataforseo-api-guide/) · [DataForSEO review](https://dataresearchtools.com/dataforseo-review/)
- [Ahrefs vs Semrush API pricing 2026](https://thatmarketingbuddy.com/blog/semrush-api-pricing) · [Semrush vs Ahrefs comparison](https://seomator.com/blog/semrush-vs-ahrefs)
- [Best SEO MCP servers 2026](https://contextbolt.com/blog/best-seo-mcp-servers/) · [SEO MCP stack for Claude](https://www.get-ryze.ai/blog/how-to-set-up-an-seo-mcp-stack-for-claude)
- [Free GSC MCP (AminForou)](https://github.com/AminForou/mcp-gsc) · [Suganthan GSC MCP setup](https://suganthan.com/blog/google-search-console-mcp-server/)
- [Best AI visibility tools 2026](https://visible.seranking.com/blog/best-ai-visibility-tools/) · [AI citation tracking guide](https://www.amicited.com/blog/ai-citation-tracking-tools-guide/)
- [Firecrawl vs Serper / best search APIs](https://www.firecrawl.dev/blog/best-web-search-apis) · [16 best SERP APIs](https://brightdata.com/blog/web-data/best-serp-apis)
- [Windsor.ai → Claude GSC](https://windsor.ai/how-to-send-google-search-console-data-to-claude/)
