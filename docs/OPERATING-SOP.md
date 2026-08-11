# SEO Content Engine — Operating SOP (A → Z)

**How to run this system to get the best possible results.**

- **Live dashboard:** https://seo-content-engine-production-22cc.up.railway.app
- **Login:** password `lantern-quartz-1706` (change anytime — see §9)
- **Audience:** you (the operator). No engineering needed for day-to-day use.

Every step below is tagged with its current status:
- ✅ **Live** — works in the dashboard today
- ⚙️ **Manual/partial** — works, but needs a manual step or a one-time setup
- 🔜 **Roadmap** — designed, not built yet

---

## 0. The one principle that matters

> **The engine does the labor. You supply the judgment and the experience.**

Your entire recurring job is two things:
1. **Approve briefs** (the single human gate).
2. **Inject real, first-hand experience** into drafts before they go live.

Everything else — research, writing, scoring, revising, publishing — is automated. And the single biggest lever on results is **#2**: the grader will take an AI-only draft to ~70–82/100, but **real experience, real numbers, and verified sources are what push it to 90+ and make it rank.** Skip that and you get mediocre content at scale. Do it and you get a moat.

---

## 1. The assembly line (what happens, in order)

```
0. Intake        crawl the site → business profile + brand voice + pillars   (once per business)
1. Ideas         keyword gaps + search intent → scored idea list
2. Brief         real SERP + competitor scrape → a "gap map" (the wedge)      ⭐
3. ── YOU APPROVE ──  the one human gate
4. Write         drafts in the SEO/AEO template (answer-first, schema, FAQ)
5. Grade         scores 0–100 on 8 dimensions; revises the weakest; loops until it passes
6. ── YOU ADD EXPERIENCE ──  the #1 ranking lever (E-E-A-T)
7. Publish       lands as a HIDDEN draft in your CMS for final review
8. Go live       you flip it live
9. Monitor       pull GSC signals (impressions, clicks, position)
10. Improve      striking-distance → push, low-CTR → rewrite title, decaying → refresh
```

Stages 1–2 and 4–5 run themselves. You act only at **step 3 (approve)** and **step 6 (add experience)**.

---

## 2. Dashboard tour

| Page | What it's for |
|---|---|
| **Overview** | Today's to-dos + KPIs (live pages, indexed, clicks, avg quality). Start here each session. |
| **Strategy** | Your pillars — the themes all content rotates through. |
| **Ideas** | The auto-scored idea box. Highest-opportunity first. This is where you start a piece. |
| **Briefs** | **Your gate.** Briefs waiting for approval. |
| **Pipeline** | The board — every piece flowing left→right (ideas → briefs → in progress → scheduled → live). |
| **Quality** | The 0–100 scorecard for the latest draft, with per-dimension notes. |
| **Performance** | Live-page results from Search Console + the improvement flags. |
| **Geo** | City-scale campaign mode (funeral-resource pages per city). 🔜 |
| **Connectors** | Health of your data + publishing hookups. |

Top-left is the **business switcher** (Trusted Caskets / Overnight Caskets). One engine, many businesses.

---

## 3. The A → Z procedure

### Step 0 — Onboard a business (once) ⚙️
Generates the business's profile, brand voice, and starter content pillars by crawling its live site. This is what makes every downstream draft sound on-brand.
- **What it produces:** a `client.md`-style profile (who they are, audience, offering, differentiators), a brand-voice spec, and 5–6 content pillars.
- **Today:** run once per business via the intake job. Review the generated profile and brand voice — tighten anything that's off. (Trusted Caskets already has a strong generated profile: *"factory-direct casket retailer… value proposition is fair price, not cheap… don't use hype or countdown urgency."*)
- **Best practice:** the brand voice drives tone on every page. Get it right once.

### Step 1 — Work the idea box ✅ (generation 🔜)
Open **Ideas**. Each idea is scored 0–100 on opportunity (volume × intent × attainability × business fit) and tagged to a pillar, with a one-line rationale.
- **Do:** scan top-down. The best ideas are **high-intent + attainable + on-brand** (e.g. *"First 48 hours after a death"* — 2,400/mo, very high intent, grieving families search it first).
- **Skip:** anything off-brand or purely informational with no path to your product.
- *Note: idea **generation** from live keyword data is on the roadmap; today the box is pre-populated. You can also treat any topic you already know you want as an idea.*

### Step 2 — Build a brief ✅
On a promising idea, click **Build brief**. This runs the real research engine:
1. Pulls the live top-10 SERP (DataForSEO).
2. Scrapes the top competitors (Firecrawl) — their headings, coverage, word count.
3. Synthesizes a **gap map**: what everyone covers vs. the **hole** you can own.

You get a brief with: the winning **angle/wedge**, the specific **gap**, a **word target**, a **section outline**, the **questions to answer** (from People-Also-Ask), and the **schema** to include.
- **This takes ~1–2 minutes** (real API calls + AI synthesis).
- **What "great" looks like:** the wedge is specific and *defensible for your business*. Example the engine actually produced for "cremation vs burial cost": *"Every competitor repeats the same NFDA median stats but none isolate casket cost as the variable families control — a casket retailer is uniquely positioned to own this."* That's a winning brief.

### Step 3 — APPROVE or SKIP (your gate) ✅
Open **Briefs**. Before you approve, check three things:
1. **Intent match** — does the angle actually answer what the searcher wants?
2. **The wedge is real** — is the gap something competitors genuinely miss *and* that you can win credibly?
3. **On-brand** — does it fit a pillar and the business's voice/positioning?

- **Approve** → fires the writer + grader automatically.
- **Skip** → removes it (use freely; a weak brief wastes a good slot).

> **Approving is the highest-leverage 30 seconds in the whole system.** A sharp brief produces a sharp article; a vague one produces slop no amount of automation fixes.

### Step 4–5 — Write + grade (automatic) ✅
On approval the engine:
- **Writes** the draft in the SEO/AEO template: answer-first intro, table of contents, clear H2/H3s, step-by-step sections, **self-contained ~130–170-word passages** (so AI answer engines can quote them), authoritative outbound links, an FAQ, soft CTAs, and embedded **JSON-LD schema**.
- **Grades** it 0–100 across **8 dimensions** (see the Quality page), then **revises the weakest dimensions and re-grades**, looping until it clears the threshold (default **85**) or hits the loop limit.

Watch it move across the **Pipeline** board (researching → grading → scheduled). **A full run takes a few minutes.**

### Step 6 — Read the scorecard ✅
Open **Quality**. You'll see the overall score and every dimension with a specific note. The 8 dimensions:

| Dimension | Max | What it measures |
|---|---|---|
| Search-intent match | 15 | Does it satisfy the query in the intro? |
| Depth vs competitors | 15 | More complete than the top pages; fills the gap? |
| **E-E-A-T / experience** | 15 | **Real figures, first-hand detail, trust signals — not filler.** |
| AEO readiness | 15 | Valid schema, TOC, FAQ, citable passages |
| Originality | 10 | A real POV; no AI-slop tells |
| Internal linking | 10 | 3–5 relevant links, forward + backward |
| Readability | 10 | Scannable structure, short paragraphs |
| Conversion | 10 | Appropriate CTAs, not salesy |

**The grader is strict and honest** — it will literally call out em-dash overuse ("the exact AI-slop tell"), unverified legal citations ("a trust liability if wrong"), and missing schema fields. Read its notes; they're your fix list.

### Step 7 — INJECT REAL EXPERIENCE (the #1 lever) ⚙️
This is where good becomes great. AI-only drafts plateau at ~70–82 because **E-E-A-T and originality are the two things a model can't fake.** Before publishing, add:
- **One concrete first-hand detail** — a real price range you've seen, a real scenario walked through, a customer situation.
- **Verified, linked sources** — if the draft cites a statute or a stat (e.g. the FTC Funeral Rule, an NFDA figure), **confirm it and hyperlink the primary source.** An unverified citation is a liability; a verified linked one is a huge trust asset.
- **A named reviewer / byline** where appropriate (with a real person + credentials).
- **An original image** if you have one.
- **Cut the slop** the grader flagged (em-dashes, hedging like "generally/typically/often").

*Today this is done by editing the draft in your CMS after it publishes (Step 8). An in-dashboard "add experience → re-grade" step is on the roadmap.*

### Step 8 — Publish ✅ (real Shopify ⚙️)
Passed drafts **publish as a HIDDEN draft** in your CMS blog — never straight to live. This is deliberate: it gives you the Step-7 review before anything's public.
- **One-time setup for real Shopify publishing:** the production database needs your Shopify Admin API token saved (encrypted). Until then, publishes are recorded with a local URL. (Ask me to run the connector-save when you want live publishing — 2 minutes.)
- Publish target: the **Funeral Information** blog.

### Step 9 — Go live ⚙️
In Shopify: open the hidden draft, apply your Step-7 experience edits, then **publish it live**. Done — the article is out.

### Step 10 — Monitor 🔜
The **Performance** page shows each page's Search Console signals (impressions, clicks, CTR, position) and an improvement flag. *Live GSC sync is on the roadmap — today this shows sample signals.*

### Step 11 — Improve 🔜
The engine flags and re-queues pages automatically:
- **Striking distance** (position 11–20) → push it onto page 1 (add depth, links).
- **High impressions, low CTR** → rewrite the title + meta.
- **Decaying** → refresh the content and dates.
Each flag creates a task back at the top of the loop. *Automation of the flags/sweeps is roadmap.*

### Step 12 — Geo scale 🔜
The casket superpower: feed a **city list**, and the engine builds one funeral-resource page per city — pulling **vetted local data** (Google Maps, filtered to ≥4.4★ / ≥20 reviews) so pages never list junk. Hundreds of high-intent local pages from one template.

---

## 4. Best-practices playbook (to get the *best* results)

1. **E-E-A-T is king.** Never publish an AI-only draft as-is. One real figure or first-hand scenario per article is the difference between page 3 and page 1.
2. **Verify every stat and citation, and link the source.** Especially anything legal or medical. Wrong facts are a trust *liability*; verified linked facts are your biggest asset.
3. **Kill AI-slop tells.** Em-dash spam, hedging ("generally/typically"), "in conclusion." The grader catches these — so does Google.
4. **Answer-first + citable passages.** The intro must satisfy the query immediately. Keep key answers in self-contained ~130–170-word chunks so AI engines quote you (AEO).
5. **Ship schema.** FAQPage/HowTo/Article/Product where relevant, with complete fields (datePublished, author, etc.).
6. **Internal-link every piece** (3–5 links, forward *and* backward). It compounds.
7. **Target striking distance first.** Pushing a position-11 page to page 1 beats writing a brand-new page from scratch.
8. **Stay on-brand.** For Trusted Caskets: *fair price, not cheap*; dignified, no hype, no countdown urgency; make the phone number easy.
9. **Consistency beats bursts.** A steady cadence (default 5/week) compounds; sporadic dumps don't.

---

## 5. Connectors — what powers what

| Connector | Powers | Status |
|---|---|---|
| **Anthropic (Claude)** | Writing, grading, research synthesis, intake | ✅ configured |
| **Firecrawl** | Site crawl (intake) + competitor scraping (research) | ✅ configured |
| **DataForSEO** | Live SERP + keyword volumes | ✅ configured |
| **Shopify** | Publishing to your blog | ⚙️ token needs saving to prod DB |
| **Google Search Console** | Real performance data + the improve loop | 🔜 |
| **Google Maps** | Vetted local data for geo pages | 🔜 |

Keep an eye on the **Connectors** page — a connector in "error" stalls the stage it powers.

---

## 6. Cost control

- **Model tier** — production runs on **Claude Sonnet** (`PIPELINE_MODEL=claude-sonnet-5`) for a strong quality/cost balance (~cents per article). Switch to Opus for max quality on flagship pieces (higher cost), or leave on Sonnet for volume. One env var.
- **DataForSEO** — pay-as-you-go, ~$0.002 per SERP pull. A brief costs fractions of a cent.
- **Firecrawl** — free tier covers early volume.
- **Railway** — ~$5/mo (app + database). Watch the trial credit; upgrade to Hobby to keep it online.
- **Rule of thumb:** the expensive step is the writer/grader loop. Approving good briefs (fewer revision loops) is also the cheapest way to run.

---

## 7. Daily / weekly rhythm

**Daily (5 min):**
1. Open **Overview** → check "Needs you today."
2. Clear the **Briefs** queue (approve/skip).
3. Take any **passed** draft, add experience (Step 7), publish it live.

**Weekly (20 min):**
1. Review **Performance** flags; queue the striking-distance and low-CTR fixes.
2. Scan the **Ideas** box; build 3–5 new briefs.
3. Check **Connectors** health.

---

## 8. Admin & maintenance

- **How updates deploy:** code lives on GitHub (`gmensteve-glitch/seo-content-engine`, branch `claude/project-onboarding-w8hlg2`). Railway auto-deploys on push. Migrations + safe seeding run automatically on each deploy (`prisma/init-db.mjs` — it only seeds an empty database, never wipes real data).
- **Database:** managed Postgres on Railway with a persistent volume. **Back it up** before big changes (Railway → Postgres → Backups).
- **Rotating secrets:** all keys live in Railway → service → Variables. Rotate the dashboard password by changing `DASHBOARD_PASSWORD`; rotate any API key the same way; redeploy.
- **Scaling:** add a business via the switcher (once onboarding is wired), or bump `cadencePerWeek`. Long jobs will move to the Inngest scheduler (🔜) for durable background runs + crons.

---

## 9. Troubleshooting

| Symptom | Likely cause → fix |
|---|---|
| Dashboard shows demo numbers (142 live pages) + no password | The app can't see the database/keys — env vars not applied. |
| "Build brief" hangs a long time | Normal — real SERP + scrape + AI takes 1–2 min. |
| Draft ends **FAILED** at ~70–82 | Working as designed — it needs the human E-E-A-T pass (Step 7). Lower the threshold or add experience. |
| Publish didn't reach Shopify | Shopify token not yet saved to the prod DB (⚙️). |
| Connector shows "error" | Re-check that key in Railway Variables; the stage it powers is paused until fixed. |

---

## 10. Current status at a glance

| Capability | Status |
|---|---|
| Deployed, secured (password), real Postgres | ✅ |
| Ideas → Build brief (real research) | ✅ |
| Approve gate → write → grade (revise-until-pass) | ✅ |
| Publish as hidden CMS draft | ✅ (real Shopify token: ⚙️) |
| Intake (site → profile/voice/pillars) | ⚙️ (run per business) |
| Idea generation from live keyword data | 🔜 |
| E-E-A-T injection in-dashboard | 🔜 |
| Internal linker, indexer | 🔜 |
| GSC monitoring + improve sweeps | 🔜 |
| Geo/city campaign mode | 🔜 |
| Multi-tenant auth + onboarding wizard | 🔜 |
| Inngest scheduler (durable jobs + crons) | 🔜 |

---

## TL;DR cheat sheet

1. **Ideas** → pick a high-intent, on-brand idea → **Build brief**.
2. **Briefs** → sanity-check the wedge → **Approve**.
3. Engine writes + grades + revises automatically → watch **Pipeline**, read **Quality**.
4. **Add one real first-hand detail + verify/link every stat** (this is the whole game).
5. Publish → review the hidden CMS draft → **go live**.
6. Weekly: work the **Performance** flags (striking distance, low CTR).

*Do steps 4 religiously and this system produces content that actually ranks — not just content at scale.*
