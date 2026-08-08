# Agent pipeline

Each stage is a discrete job with a clear input → output contract. They chain: one stage's output is the next's input. All are `businessId`-scoped and read the business config bundle.

## 0. Intake (once per business)
- **In:** domain URL.
- **Does:** crawls the site, infers business type/offering/audience, extracts brand voice.
- **Out:** `Business.profileMd` + `brandVoice`. Seeds initial `Pillar[]`.
- **Data:** Firecrawl (site pages), Claude (synthesis).

## 1. Keyword research
- **In:** business profile + pillars.
- **Does:** pulls volumes/CPC/difficulty (DataForSEO) + cross-checks GSC for "striking distance" (position 11–20) and near-miss queries.
- **Out:** `Keyword[]` with volume/intent/difficulty/currentPosition.

## 2. Idea generation + scoring
- **In:** keywords + pillars + GSC gaps.
- **Does:** proposes titles per pillar; scores each 0–100 on opportunity (volume × intent × attainability × business fit).
- **Out:** `Idea[]` (status PROPOSED) with `score` + `rationale`. Surfaces in the Idea box.

## 3. Deep competitive research → gap map  ⭐
- **In:** an idea/target keyword.
- **Does:**
  1. Pull top-10 SERP (DataForSEO).
  2. Scrape each (Firecrawl): headings, word count, entities, schema, questions answered.
  3. Pull People-Also-Ask + related keywords.
  4. Pull our GSC data for the topic.
  5. Synthesize: what everyone covers vs the **hole** (our wedge) + target length, entities, questions, schema.
- **Out:** `Brief` (status PENDING_APPROVAL) with `gapMap`, `outline`, `questions`, `requiredSchema`, `angle`.

## 4. Human approval gate
- The ONLY routine human touch. Approve/reject in the Briefs screen.
- Approve → `BriefStatus.APPROVED` → fires the writer job.

## 5. Writer
- **In:** approved brief + business brand voice.
- **Does:** drafts in the SEO/AEO template (answer-first intro, TOC, how-to sections, authoritative links, FAQ, CTAs); writes in ~130–170 word citable passages; embeds schema JSON-LD.
- **Out:** `Draft` (status DRAFTED, version 1), `bodyMd`.

## 6. Grader (0–100) + revision loop
- **In:** draft + brief (the benchmark) + `RUBRIC`.
- **Does:** scores all 8 dimensions (see `src/lib/grader/rubric.ts`). If `overall < threshold`, revise the **weakest** dimensions and re-grade. Loop up to `MAX_REVISION_LOOPS`.
- **Out:** `Grade[]` history (every pass stored → the learning loop). Draft → PASSED, or FAILED (flag human).
- **Learning:** each grade stores per-dimension notes + feedback; UI shows "lost 3 pts on E-E-A-T because…".

## 7. Human experience injection (E-E-A-T)
- PASSED drafts surface for the human to add first-hand detail (real figures, examples, a photo). Optional but strongly nudged (it's the #1 ranking lever). Re-grade after.

## 8. Internal linker
- **In:** the draft + existing `Page[]` for the business.
- **Does:** picks 3–5 relevant targets, forward + backward, per `linksPerPage`; anti-spam rules.
- **Out:** link insertions + `LinkEdge[]` records.

## 9. Publisher
- **In:** final HTML (schema included) + business CMS adapter.
- **Does:** `getCmsAdapter(platform, config).publish(...)`.
- **Out:** `Page` row (url, cmsId, publishedAt). Scheduled via `PUBLISH_QUEUE`.

## 10. Indexer
- **Does:** ensures sitemap includes it; for high-value pages, requests indexing via GSC (~10/day budget).

## 11. Monitor + self-improve (scheduled)
- **GSC_SYNC:** pull impressions/clicks/ctr/position → `PagePerformance`.
- **IMPROVE_SWEEP:** flag striking-distance (push), high-impression/low-CTR (rewrite title+meta), decaying (refresh). Each flag creates an improvement task back at the top of the loop.

## 12. Geo scale (campaign mode)
- **In:** a template brief + a city list.
- **Does:** per city, pull vetted local data (Maps API, filter ≥4.4★ / ≥20 reviews), run 5→9 with unique content per city.
- **Out:** many `Page`s (contentType GEO). This is the casket superpower (city funeral-resource pages).

---

## Job orchestration
- Stages 5, 6, 8, 9 run as durable Inngest jobs (minutes-long, retryable).
- Stages 1, 11 run on schedules (`Schedule` rows → Inngest cron).
- The orchestrator can run 1→3 automatically, stop at 4 (approval), then 5→10 on approve.
