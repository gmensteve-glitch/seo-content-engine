// Pipeline service — the DB-backed content lifecycle the UI and jobs both call.
//
//   Idea (PROPOSED) → buildBriefFromIdea → Brief (PENDING_APPROVAL)
//   Brief → approveBrief → Draft (RESEARCHING) → runPipelineForBrief
//     → write → grade-until-pass (persists Grade history) → publish → Page
//
// Every agent degrades to offline output when its API key is absent (see
// src/lib/env.ts + src/lib/ai/offline.ts), so this runs end-to-end with zero
// credentials. Publishing falls back to a local URL when no CMS connector is
// configured, so the loop still reaches a published Page offline.

import { Prisma } from "@prisma/client";
import { prisma, hasDatabase } from "@/lib/db";
import { inngest } from "@/lib/jobs/client";
import { inngestEnabled, encryptionEnabled } from "@/lib/env";
import { runIntake } from "@/lib/agents/intake";
import { buildBrief, type BriefSpec } from "@/lib/agents/research";
import { writeDraft, reviseDraft } from "@/lib/agents/writer";
import { gradeDraft } from "@/lib/agents/grader";
import { planLinks, applyLinks, type LinkTarget, type PlannedLink } from "@/lib/agents/linker";
import { generateIdeaProposals, type IdeationContext } from "@/lib/agents/ideator";
import { enrichDraft, rewritePassage, hasResources, type EnrichResources } from "@/lib/agents/enricher";
import { finalizeDraftBody } from "@/lib/agents/finalize";
import { withCostScope } from "@/lib/ai/cost";
import { completeText, MODELS } from "@/lib/ai/claude";

/** Run `fn` in a cost scope and add whatever it spent to the draft's running total. */
async function trackDraftCost<T>(draftId: string, fn: () => Promise<T>): Promise<T> {
  const { result, cents } = await withCostScope(fn);
  if (cents > 0) {
    await prisma.draft
      .update({ where: { id: draftId }, data: { costCents: { increment: cents } } })
      .catch(() => {});
  }
  return result;
}
import { serpTop } from "@/lib/connectors/dataforseo";
import { scrapeMany } from "@/lib/connectors/firecrawl";
import { fetchGscRows, strikingDistance, decayingPages, gscQuery } from "@/lib/connectors/gsc";
import { askAnswerEngine } from "@/lib/connectors/perplexity";
import { dataforseoEnabled, firecrawlEnabled, gscEnabled, geoEnabled, aiEnabled } from "@/lib/env";
import { sourceHeroImage } from "@/lib/media/imager";
import { weakestDimensions, MAX_REVISION_LOOPS } from "@/lib/grader/rubric";
import { getCmsAdapter, type CmsPlatform } from "@/lib/cms";
import type { StalePostVM } from "@/lib/data/types";
import { markdownToHtml } from "@/lib/cms/markdown";
import { sanitizeLinks } from "@/lib/cms/links";
import { preflightPublish, metaIssues } from "@/lib/cms/preflight";
import { decryptJson } from "@/lib/crypto/secrets";

function requireDb() {
  if (!hasDatabase) {
    throw new Error("This action needs a database — set DATABASE_URL (the mock UI is read-only).");
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

/**
 * Derive an SEO meta description from the draft body — no fabrication, it's
 * lifted verbatim from the article's own opening. The writer is instructed to
 * lead with an answer-first bold summary sentence; we prefer that, then fall
 * back to the first substantial paragraph. Clamped to ~155 chars.
 */
/**
 * A clean SEO page title (title_tag) ≤ `max` chars — the on-page headline can be
 * longer, but Google truncates the title tag ~60. Cuts at a word boundary and
 * drops a dangling separator/conjunction so it reads as a complete phrase.
 */
function deriveSeoTitle(title: string, max = 60): string {
  const t = title.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  let cut = t.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  if (sp > 30) cut = cut.slice(0, sp);
  cut = cut.replace(/[\s,;:.\-–—|&]+$/, "").trim();
  cut = cut.replace(/\s+(and|or|the|a|an|to|of|for|with|in|on|&)$/i, "").trim();
  cut = cut.replace(/[\s,;:.\-–—|&]+$/, "").trim(); // strip a separator the conjunction may have exposed
  return cut;
}

function deriveMetaDescription(md: string, fallback: string): string {
  const clamp = (s: string) =>
    s.length > 155 ? s.slice(0, 152).replace(/\s+\S*$/, "").trimEnd() + "…" : s;

  // Strip a leading byline/credit line so it never becomes the description.
  const cleaned = md.replace(/^\s*(#.*\n)?\s*\*\*By [^\n]*\n/i, "");

  // Prefer the longest bold span (the answer-first summary is bold by design).
  const bolds = [...cleaned.matchAll(/\*\*([^*]+)\*\*/g)]
    .map((m) => m[1].trim())
    .filter((s) => /[.!?]$/.test(s) && s.length > 80);
  if (bolds.length) {
    const best = bolds.sort((a, b) => b.length - a.length)[0];
    return clamp(best.replace(/\s+/g, " "));
  }

  // Fallback: first real paragraph, markdown stripped.
  const text = cleaned
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s+.*$/gm, " ")
    .replace(/^>\s?.*$/gm, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const sentence = text.split(/(?<=[.!?])\s/).find((s) => s.trim().length > 60);
  return clamp((sentence ?? text).trim()) || fallback;
}

/** Rebuild the agent's BriefSpec from a stored Brief row (+ its idea title). */
function toBriefSpec(brief: {
  targetKeyword: string;
  angle: string | null;
  wordTarget: number | null;
  outline: unknown;
  questions: unknown;
  requiredSchema: string[];
  gapMap: unknown;
  idea: { title: string };
}): BriefSpec {
  const gap =
    brief.gapMap && typeof brief.gapMap === "object" && "gap" in brief.gapMap
      ? String((brief.gapMap as { gap: unknown }).gap)
      : "";
  return {
    title: brief.idea.title,
    targetKeyword: brief.targetKeyword,
    angle: brief.angle ?? "",
    gap,
    wordTarget: brief.wordTarget ?? 1600,
    outline: asStringArray(brief.outline),
    questions: asStringArray(brief.questions),
    requiredSchema: brief.requiredSchema,
  };
}

// ─────────────────────────────────────────────────────────────
// Onboarding (intake)
// ─────────────────────────────────────────────────────────────

/** Crawl the business's site → generate + save its profile, brand voice, and
 *  starter pillars. Stage 0 of the pipeline. */
export async function runAndSaveIntake(
  businessId: string,
): Promise<{ profileMd: string; brandVoice: string; pillars: string[] }> {
  requireDb();
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) throw new Error(`Business ${businessId} not found`);

  const profile = await runIntake(business.domain, [
    "/",
    "/pages/about",
    "/pages/about-us",
    "/collections/all",
  ]);

  await prisma.business.update({
    where: { id: businessId },
    data: { profileMd: profile.profileMd, brandVoice: profile.brandVoice },
  });

  // Add any pillar the site suggested that we don't already track.
  const existing = await prisma.pillar.findMany({
    where: { businessId },
    select: { name: true },
  });
  const have = new Set(existing.map((p) => p.name.toLowerCase()));
  for (const name of profile.pillars) {
    if (!have.has(name.toLowerCase())) {
      await prisma.pillar.create({ data: { businessId, name } });
    }
  }

  return profile;
}

// ─────────────────────────────────────────────────────────────
// Idea generation (the supply side of the autopilot loop)
// ─────────────────────────────────────────────────────────────

/** Normalize a title for duplicate detection. */
function normTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Build a coverage/performance signal for the ideator: how many live pages sit
 * in each pillar (thin pillars get prioritized), plus any ranking data we have.
 * Degrades gracefully — before analytics are connected it still reports which
 * pillars are under-served so ideation stays smart.
 */
/**
 * Live Search Console opportunities, formatted as an emphatic instruction block
 * for the ideator. Striking-distance queries (ranking page 2, real impressions)
 * are the highest-ROI new content — one strong piece pushes them to page 1.
 * Returns "" when GSC isn't connected, so ideation degrades gracefully.
 */
/**
 * GEO gap signal for the ideator: the target questions AI answer engines do NOT
 * yet cite us for. These become priority topics to write/strengthen so an AI
 * will cite us. "" when GEO isn't configured or there are no gaps.
 */
async function buildGeoOpportunityNote(businessId: string): Promise<string> {
  if (!geoEnabled()) return "";
  try {
    const latest = await prisma.geoCitation.findFirst({
      where: { businessId },
      orderBy: { date: "desc" },
      select: { date: true },
    });
    if (!latest) return "";
    const notCited = await prisma.geoCitation.findMany({
      where: { businessId, date: latest.date, cited: false },
      select: { query: true },
      take: 12,
    });
    if (!notCited.length) return "";
    const list = notCited.map((n) => `"${n.query}"`).join("; ");
    return (
      `AI-ANSWER GAPS — AI answer engines (ChatGPT, Perplexity, Google AI) do NOT yet cite this site ` +
      `when asked these real buyer questions. Prioritize content that answers them in a tight, quotable, ` +
      `self-contained way so an AI will lift and cite us: ${list}.`
    );
  } catch (e) {
    console.error("[geo] opportunity note failed:", e instanceof Error ? e.message : e);
    return "";
  }
}

async function buildGscOpportunityNote(existingTitles: string[] = []): Promise<string> {
  if (!gscEnabled()) return "";
  try {
    const [rows, decaying] = await Promise.all([
      fetchGscRows({ days: 28, dimensions: ["query"], rowLimit: 1000 }),
      decayingPages({ window: 28, minPriorClicks: 20, minDropPct: 30 }),
    ]);
    if (!rows) return "";

    const have = new Set(existingTitles.map((t) => t.toLowerCase()));
    const striking = strikingDistance(rows)
      // Skip queries we clearly already have a titled piece for.
      .filter((r) => !have.has(r.query.toLowerCase()))
      .slice(0, 12);

    let note = "";
    if (striking.length) {
      const list = striking
        .map((r) => `"${r.query}" (pos ${r.position.toFixed(0)}, ${r.impressions} impressions/mo)`)
        .join("; ");
      note +=
        `PRIORITY SEARCH OPPORTUNITIES — this site already ranks on PAGE 2 for these real queries; ` +
        `each has strong monthly impressions but few clicks because it's just off page 1. ` +
        `At least half your ideas MUST directly target these keywords (or a tightly-focused long-tail of them) ` +
        `to push them onto page 1 — this is where the traffic and revenue are: ${list}.`;
    }
    if (decaying && decaying.length) {
      const list = decaying
        .slice(0, 4)
        .map((d) => `${d.page.replace(/^https?:\/\/[^/]+/, "")} (down ${d.dropPct}%)`)
        .join("; ");
      note += ` DECAYING PAGES (losing traffic — propose fresh supporting/cluster content that links to and reinforces these topics): ${list}.`;
    }
    return note;
  } catch (e) {
    console.error("[gsc] opportunity note failed:", e instanceof Error ? e.message : e);
    return "";
  }
}

async function buildPerformanceNote(
  businessId: string,
  pillars: string[],
  existingTitles: string[] = [],
): Promise<string> {
  // Live search-demand + AI-citation gaps come first — the strongest steers.
  const [gscRaw, geoNote] = await Promise.all([
    buildGscOpportunityNote(existingTitles),
    buildGeoOpportunityNote(businessId),
  ]);
  const gscNote = [gscRaw, geoNote].filter(Boolean).join("\n\n");

  const pages = await prisma.page.findMany({
    where: { businessId, publishedAt: { not: null } },
    include: {
      draft: { include: { brief: { include: { idea: { include: { pillar: true } } } } } },
      perf: { orderBy: { date: "desc" }, take: 1 },
    },
  });

  if (pages.length === 0) {
    const base = "No content published yet — prioritize breadth: seed each pillar with a strong cornerstone piece.";
    return gscNote ? `${gscNote}\n\n${base}` : base;
  }

  const counts = new Map<string, number>();
  for (const p of pillars) counts.set(p, 0);
  for (const pg of pages) {
    const name = pg.draft?.brief?.idea?.pillar?.name;
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const coverage = [...counts.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([name, n]) => `${name}: ${n} live`)
    .join("; ");

  // Winners/decayers, if we have ranking data.
  const ranked = pages
    .map((pg) => ({ title: pg.draft?.title ?? pg.url, perf: pg.perf[0] }))
    .filter((x) => x.perf?.position != null);
  let rankNote = "";
  if (ranked.length) {
    const winners = ranked
      .filter((x) => (x.perf!.position ?? 99) <= 10)
      .slice(0, 3)
      .map((x) => x.title);
    const decaying = ranked
      .filter((x) => (x.perf!.position ?? 0) >= 11 && (x.perf!.position ?? 0) <= 20)
      .slice(0, 3)
      .map((x) => x.title);
    if (winners.length) rankNote += ` Winning topics (double down with related angles): ${winners.join("; ")}.`;
    if (decaying.length) rankNote += ` On the cusp (page 2 — worth supporting with cluster links): ${decaying.join("; ")}.`;
  }

  const coverageNote = `Live-content coverage by pillar (fewest first — favor the thin ones): ${coverage}.${rankNote}`;
  return gscNote ? `${gscNote}\n\n${coverageNote}` : coverageNote;
}

/**
 * Generate `count` fresh ideas for a business and insert the non-duplicate ones
 * as PROPOSED. Returns the number actually added. This is the top of the funnel;
 * the human still gates each idea → brief → approval downstream.
 */
export async function generateIdeas(
  businessId: string,
  count = 6,
  mix?: { local: number; evergreen: number },
): Promise<number> {
  requireDb();
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: { pillars: true },
  });
  if (!business) throw new Error(`Business ${businessId} not found`);

  const pillarNames = business.pillars.map((p) => p.name);

  // Everything we already have a title for — ideas (any status), drafts, pages.
  const [ideas, drafts] = await Promise.all([
    prisma.idea.findMany({ where: { businessId }, select: { title: true } }),
    prisma.draft.findMany({ where: { businessId }, select: { title: true } }),
  ]);
  const existingTitles = [...ideas.map((i) => i.title), ...drafts.map((d) => d.title)];
  const seen = new Set(existingTitles.map(normTitle));

  const performanceNote = await buildPerformanceNote(businessId, pillarNames, existingTitles);

  // Split the batch by the business's local/evergreen target ratio — unless the
  // caller passes an explicit mix (used by replenish to target the SHORT kind).
  const targetLocal = mix ? mix.local : Math.round((count * (business.localRatio ?? 50)) / 100);
  const targetEvergreen = mix ? mix.evergreen : count - targetLocal;
  const total = mix ? mix.local + mix.evergreen : count;
  const ctx: IdeationContext = {
    businessName: business.name,
    profileMd: business.profileMd ?? business.name,
    brandVoice: business.brandVoice ?? undefined,
    pillars: pillarNames,
    existingTitles,
    performanceNote,
    count: total,
    targetLocal,
    targetEvergreen,
  };

  const proposals = await generateIdeaProposals(ctx);

  // Map returned pillar name → existing pillarId (best-effort, case-insensitive).
  const pillarByName = new Map(business.pillars.map((p) => [p.name.toLowerCase(), p.id]));

  let added = 0;
  for (const p of proposals) {
    const key = normTitle(p.title);
    if (!key || seen.has(key)) continue; // skip dupes within-batch and vs existing
    seen.add(key);
    await prisma.idea.create({
      data: {
        businessId,
        pillarId: pillarByName.get(p.pillar.toLowerCase()) ?? null,
        title: p.title,
        score: Math.max(0, Math.min(100, Math.round(p.score))),
        rationale: p.rationale,
        kind: p.kind === "LOCAL" ? "LOCAL" : "EVERGREEN",
        status: "PROPOSED",
      },
    });
    added++;
  }
  return added;
}

/**
 * The feedback-loop tick: keep BOTH categories of the idea pool full. If either
 * LOCAL or EVERGREEN has fewer than `floorPerKind` PROPOSED ideas, top up — so
 * auto-advance always has supply of whichever category is short. Called on a
 * cadence by the scheduler.
 */
export async function replenishIdeas(businessId: string, floorPerKind = 6): Promise<number> {
  requireDb();
  const [local, evergreen] = await Promise.all([
    prisma.idea.count({ where: { businessId, status: "PROPOSED", kind: "LOCAL" } }),
    prisma.idea.count({ where: { businessId, status: "PROPOSED", kind: "EVERGREEN" } }),
  ]);
  // Only top up the kind(s) actually short — don't pile on a category that's
  // already full. Over-generate ~1.6× since dedup drops some. This is what keeps
  // the Ready mix honest to the ratio: local supply never starves.
  const needLocal = Math.max(0, floorPerKind - local);
  const needEver = Math.max(0, floorPerKind - evergreen);
  if (needLocal + needEver <= 0) return 0;
  return generateIdeas(businessId, needLocal + needEver, {
    local: Math.ceil(needLocal * 1.6),
    evergreen: Math.ceil(needEver * 1.6),
  });
}

/** Replenish ideas for every active/onboarding business. Returns per-business counts. */
export async function replenishAllIdeas(floor = 6): Promise<Record<string, number>> {
  requireDb();
  const businesses = await prisma.business.findMany({
    where: { status: { in: ["ACTIVE", "ONBOARDING"] } },
    select: { id: true },
  });
  const result: Record<string, number> = {};
  for (const b of businesses) {
    try {
      result[b.id] = await replenishIdeas(b.id, floor);
    } catch {
      result[b.id] = 0;
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────
// GSC sync — pull Search Console data into the DB so it accumulates.
// Feeds rank tracking (KeywordRank), decay/winner detection (PagePerformance),
// and the ideator's live opportunity signal.
// ─────────────────────────────────────────────────────────────

/** Normalize a URL for matching GSC pages against our Page rows. */
function normalizeUrl(u: string): string {
  return u
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

/** Midnight-UTC Date for a YYYY-MM-DD string (stable keys for upserts). */
function dayDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function isoDay(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Pull the last few complete days of Search Console data for a business and
 * persist it: PagePerformance for pages the engine published (matched by URL),
 * and KeywordRank for the top queries (the time series that shows keywords
 * climbing). Idempotent — re-running a day overwrites that day's row. Backfills
 * a short window each run so an occasional missed tick self-heals.
 */
export async function syncGscPerformance(
  businessId: string,
  opts?: { days?: number; topKeywords?: number },
): Promise<{ pages: number; keywords: number }> {
  if (!gscEnabled()) return { pages: 0, keywords: 0 };
  const backfill = opts?.days ?? 3;
  const topKeywords = opts?.topKeywords ?? 200;

  // GSC data lags ~1–2 days; day offset 1 is the freshest complete day.
  const pages = await prisma.page.findMany({
    where: { businessId, publishedAt: { not: null } },
    select: { id: true, url: true },
  });
  const pageByUrl = new Map(pages.map((p) => [normalizeUrl(p.url), p.id]));

  let pageWrites = 0;
  let kwWrites = 0;

  for (let offset = 1; offset <= backfill; offset++) {
    const iso = isoDay(offset + 1); // +1 for the reporting lag
    const date = dayDate(iso);

    // Page-level → PagePerformance (only for pages we know about).
    if (pageByUrl.size > 0) {
      const rows = await gscQuery({ startDate: iso, endDate: iso, dimensions: ["page"], rowLimit: 1000 });
      for (const r of rows ?? []) {
        const pid = pageByUrl.get(normalizeUrl(r.page ?? ""));
        if (!pid) continue;
        await prisma.pagePerformance.upsert({
          where: { pageId_date: { pageId: pid, date } },
          create: { pageId: pid, date, impressions: r.impressions, clicks: r.clicks, ctr: r.ctr, position: r.position },
          update: { impressions: r.impressions, clicks: r.clicks, ctr: r.ctr, position: r.position },
        });
        pageWrites++;
      }
    }

    // Query-level → KeywordRank (top queries by impressions, to bound writes).
    const qRows = await gscQuery({ startDate: iso, endDate: iso, dimensions: ["query"], rowLimit: 1000 });
    const top = (qRows ?? []).sort((a, b) => b.impressions - a.impressions).slice(0, topKeywords);
    for (const r of top) {
      if (!r.query) continue;
      await prisma.keywordRank.upsert({
        where: { businessId_query_date: { businessId, query: r.query, date } },
        create: { businessId, query: r.query, date, position: r.position, impressions: r.impressions, clicks: r.clicks, ctr: r.ctr },
        update: { position: r.position, impressions: r.impressions, clicks: r.clicks, ctr: r.ctr },
      });
      kwWrites++;
    }
  }

  return { pages: pageWrites, keywords: kwWrites };
}

/** Sync GSC for every active business. Called on a daily cadence by the scheduler. */
export async function syncGscAll(): Promise<Record<string, { pages: number; keywords: number }>> {
  requireDb();
  if (!gscEnabled()) return {};
  const businesses = await prisma.business.findMany({
    where: { status: { in: ["ACTIVE", "ONBOARDING"] } },
    select: { id: true },
  });
  const out: Record<string, { pages: number; keywords: number }> = {};
  for (const b of businesses) {
    try {
      out[b.id] = await syncGscPerformance(b.id);
    } catch (e) {
      out[b.id] = { pages: 0, keywords: 0 };
      console.error("[gsc-sync] business failed:", e instanceof Error ? e.message : e);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// GEO — measure whether AI answer engines cite us for our target questions.
// This is to Generative Engine Optimization what GSC is to SEO.
// ─────────────────────────────────────────────────────────────

/**
 * Ask an answer engine our target questions and record whether our site is
 * cited. Builds the question set from the keywords we actually target (Ready +
 * published pieces). One row per (query, engine, day) — the citation-rate time
 * series. No-ops when GEO isn't configured.
 */
export async function syncGeoCitations(
  businessId: string,
  opts?: { max?: number },
): Promise<{ tested: number; cited: number }> {
  if (!geoEnabled()) return { tested: 0, cited: 0 };
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { domain: true },
  });
  if (!business?.domain) return { tested: 0, cited: 0 };

  // Build the test set from what actually matters: top real buyer demand from
  // Search Console FIRST (the money queries), then our own target keywords.
  let gscQueries: string[] = [];
  if (gscEnabled()) {
    const rows = await fetchGscRows({ days: 28, dimensions: ["query"], rowLimit: 1000 }).catch(() => null);
    if (rows) {
      gscQueries = rows
        .filter((r) => r.impressions >= 20)
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 12)
        .map((r) => r.query);
    }
  }
  const drafts = await prisma.draft.findMany({
    where: { businessId, status: { in: ["PASSED", "PUBLISHED"] } },
    select: { brief: { select: { targetKeyword: true } } },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  const draftKw = drafts.map((d) => d.brief?.targetKeyword?.trim()).filter(Boolean) as string[];
  const queries = [
    ...new Set([...gscQueries, ...draftKw].map((q) => q.toLowerCase())),
  ].slice(0, opts?.max ?? 15);
  if (!queries.length) return { tested: 0, cited: 0 };

  const date = dayDate(isoDay(0));
  let cited = 0;
  for (const q of queries) {
    const ans = await askAnswerEngine(q, business.domain);
    if (!ans) continue;
    await prisma.geoCitation.upsert({
      where: {
        businessId_query_engine_date: { businessId, query: q, engine: "perplexity", date },
      },
      create: {
        businessId, query: q, engine: "perplexity", date,
        cited: ans.cited, mentioned: ans.mentioned, position: ans.position,
      },
      update: { cited: ans.cited, mentioned: ans.mentioned, position: ans.position },
    });
    if (ans.cited) cited++;
  }
  return { tested: queries.length, cited };
}

/** Run GEO citation checks for every active business. Called on a slow cadence. */
export async function syncGeoAll(): Promise<Record<string, { tested: number; cited: number }>> {
  requireDb();
  if (!geoEnabled()) return {};
  const businesses = await prisma.business.findMany({
    where: { status: { in: ["ACTIVE", "ONBOARDING"] } },
    select: { id: true },
  });
  const out: Record<string, { tested: number; cited: number }> = {};
  for (const b of businesses) {
    try {
      out[b.id] = await syncGeoCitations(b.id);
    } catch (e) {
      out[b.id] = { tested: 0, cited: 0 };
      console.error("[geo-sync] business failed:", e instanceof Error ? e.message : e);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Auto-advance — "pump out ready-to-publish" with no manual gates.
// Drives idea → brief → approve automatically. Writing/grading is already
// automatic downstream, so finished pieces land in the Ready list on their own.
// ─────────────────────────────────────────────────────────────

// Target: this many finished pieces waiting in Ready every morning, split into
// LOCAL + EVERGREEN by the business's localRatio (e.g. 10 @ 50% = 5 + 5). Because
// publishing is manual, this SELF-THROTTLES: once each category is full the loop
// idles, and refills only as you publish or reject — no flooding, no runaway cost.
const TOTAL_READY_TARGET = 10;
// New pieces to kick off per business per tick.
const AUTO_ADVANCE_PER_TICK = 2;
const INFLIGHT_STATUSES = ["RESEARCHING", "DRAFTED", "GRADING", "REVISING"] as const;

/** Buffer: a brief is safe to auto-approve only if it's structurally complete. */
function isBriefReady(brief: { targetKeyword: string | null; outline: unknown }): boolean {
  const outline = Array.isArray(brief.outline) ? brief.outline : [];
  return Boolean(brief.targetKeyword && brief.targetKeyword.trim().length > 2 && outline.length >= 3);
}

/** Buffer: skip an idea whose exact topic already has a draft (don't repeat work). */
async function isDuplicateIdea(businessId: string, title: string): Promise<boolean> {
  if (!slugify(title)) return true;
  const existing = await prisma.draft.findFirst({
    where: { businessId, title: { equals: title, mode: "insensitive" } },
    select: { id: true },
  });
  return Boolean(existing);
}

/** Per-category Ready targets for a business (LOCAL + EVERGREEN sum to the total). */
async function readyTargets(businessId: string): Promise<{ LOCAL: number; EVERGREEN: number }> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { localRatio: true },
  });
  const localTarget = Math.round((TOTAL_READY_TARGET * (business?.localRatio ?? 50)) / 100);
  return { LOCAL: localTarget, EVERGREEN: TOTAL_READY_TARGET - localTarget };
}

/**
 * Auto-advance one business so each category (LOCAL/EVERGREEN) fills to its
 * target in Ready. Counts already-ready + in-flight per kind, and only builds
 * the kind that's short — so you wake up to ~5 local + ~5 evergreen. Returns how
 * many new pieces it started this tick.
 */
export async function autoAdvanceBusiness(businessId: string): Promise<number> {
  requireDb();

  const targets = await readyTargets(businessId);

  // Already-ready (PASSED, unrejected, unscheduled) + in-flight, bucketed by kind.
  const active = await prisma.draft.findMany({
    where: {
      businessId,
      OR: [
        { status: "PASSED", scheduledFor: null, rejectedAt: null },
        { status: { in: [...INFLIGHT_STATUSES] } },
      ],
    },
    select: { brief: { select: { idea: { select: { kind: true } } } } },
  });
  const activeLocal = active.filter((d) => d.brief?.idea?.kind === "LOCAL").length;
  const need = {
    LOCAL: Math.max(0, targets.LOCAL - activeLocal),
    EVERGREEN: Math.max(0, targets.EVERGREEN - (active.length - activeLocal)),
  };
  let budget = Math.min(AUTO_ADVANCE_PER_TICK, need.LOCAL + need.EVERGREEN);
  if (budget <= 0) return 0;

  let started = 0;

  // 1) Approve complete pending briefs first (already-committed work), counting
  //    them against the kind they belong to.
  const pending = await prisma.brief.findMany({
    where: { businessId, status: "PENDING_APPROVAL" },
    include: { idea: { select: { kind: true } } },
    orderBy: { createdAt: "asc" },
    take: budget * 2,
  });
  for (const b of pending) {
    if (budget <= 0) break;
    const k = b.idea?.kind === "LOCAL" ? "LOCAL" : "EVERGREEN";
    if (need[k] <= 0 || !isBriefReady(b)) continue;
    try {
      await approveBrief(b.id);
      started++;
      budget--;
      need[k]--;
    } catch (e) {
      console.error("[auto-advance] approve failed:", e instanceof Error ? e.message : e);
    }
  }

  // 2) Build fresh pieces for whichever category is still short.
  for (const kind of ["LOCAL", "EVERGREEN"] as const) {
    while (need[kind] > 0 && budget > 0) {
      const idea = await prisma.idea.findFirst({
        where: { businessId, status: "PROPOSED", kind },
        orderBy: { score: "desc" },
      });
      if (!idea) break; // no supply of this kind right now — next tick / replenish
      if (await isDuplicateIdea(businessId, idea.title)) {
        await prisma.idea.update({ where: { id: idea.id }, data: { status: "DISMISSED" } });
        continue;
      }
      try {
        const briefId = await buildBriefFromIdea(idea.id);
        const brief = await prisma.brief.findUnique({ where: { id: briefId } });
        if (brief && isBriefReady(brief)) {
          await approveBrief(briefId);
          started++;
          budget--;
          need[kind]--;
        }
      } catch (e) {
        console.error("[auto-advance] build/approve failed:", e instanceof Error ? e.message : e);
      }
    }
  }

  return started;
}

/** Auto-advance every active business. */
/** Set the business's target local/evergreen content ratio (0–100 = % local). */
export async function setLocalRatio(businessId: string, ratio: number): Promise<void> {
  requireDb();
  const clamped = Math.max(0, Math.min(100, Math.round(ratio)));
  await prisma.business.update({ where: { id: businessId }, data: { localRatio: clamped } });
}

export interface PublishedBlog {
  cmsId: string;
  title: string;
  url: string;
  updatedAt: string;
}

/** List every post on the business's live blog (straight from the CMS). */
export async function listPublishedBlogs(businessId: string): Promise<PublishedBlog[]> {
  requireDb();
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) return [];
  const platform = business.cmsPlatform.toLowerCase() as CmsPlatform;
  const connector = await prisma.connector.findUnique({
    where: { businessId_type: { businessId, type: cmsConnectorType(platform) } },
  });
  if (!connector || connector.status !== "CONNECTED" || !encryptionEnabled()) return [];
  try {
    const adapter = getCmsAdapter(platform, decryptJson(connector.configEnc));
    const pages = await adapter.list({ limit: 250 });
    return pages
      .map((p) => ({ cmsId: p.cmsId, title: p.title, url: p.url, updatedAt: p.updatedAt }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (e) {
    console.error("[listPublishedBlogs] failed:", e instanceof Error ? e.message : e);
    return [];
  }
}

/**
 * Promote FAILED near-misses whose BEST grade already clears the bar to PASSED,
 * so they flow into Ready. No AI re-run — it just re-reads scores against the
 * current threshold. Returns how many were promoted.
 */
export async function promoteQualifyingDrafts(businessId: string): Promise<number> {
  requireDb();
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  const threshold = business?.qualityThreshold ?? 85;
  const failed = await prisma.draft.findMany({
    where: { businessId, status: "FAILED", rejectedAt: null },
    include: { grades: { orderBy: { overall: "desc" }, take: 1 } },
  });
  let promoted = 0;
  for (const d of failed) {
    if ((d.grades[0]?.overall ?? 0) >= threshold) {
      await prisma.draft.update({ where: { id: d.id }, data: { status: "PASSED" } });
      promoted++;
    }
  }
  return promoted;
}

/** Set the min grade a piece must hit to reach the Ready list (0–100). Lowering
 *  it promotes any near-miss that already clears the new bar. */
export async function setQualityThreshold(businessId: string, threshold: number): Promise<number> {
  requireDb();
  const clamped = Math.max(50, Math.min(95, Math.round(threshold)));
  await prisma.business.update({ where: { id: businessId }, data: { qualityThreshold: clamped } });
  return promoteQualifyingDrafts(businessId);
}

export async function autoAdvanceAll(): Promise<Record<string, number>> {
  requireDb();
  const businesses = await prisma.business.findMany({
    where: { status: { in: ["ACTIVE", "ONBOARDING"] } },
    select: { id: true },
  });
  const out: Record<string, number> = {};
  for (const b of businesses) {
    try {
      out[b.id] = await autoAdvanceBusiness(b.id);
    } catch (e) {
      out[b.id] = 0;
      console.error("[auto-advance] business failed:", e instanceof Error ? e.message : e);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Human-gate actions
// ─────────────────────────────────────────────────────────────

/** Idea → gap-map Brief (PENDING_APPROVAL). Returns the brief id. */
export async function buildBriefFromIdea(ideaId: string): Promise<string> {
  requireDb();
  const idea = await prisma.idea.findUnique({
    where: { id: ideaId },
    include: { business: true, brief: true },
  });
  if (!idea) throw new Error(`Idea ${ideaId} not found`);
  if (idea.brief) return idea.brief.id; // already briefed — idempotent

  const spec = await buildBrief({
    targetKeyword: slugify(idea.title).replace(/-/g, " "),
    businessContext: idea.business.profileMd ?? idea.business.name,
  });

  const brief = await prisma.brief.create({
    data: {
      businessId: idea.businessId,
      ideaId: idea.id,
      targetKeyword: spec.targetKeyword,
      angle: spec.angle,
      wordTarget: spec.wordTarget,
      outline: spec.outline,
      questions: spec.questions,
      requiredSchema: spec.requiredSchema,
      gapMap: { gap: spec.gap },
      contentType: "BLOG",
      status: "PENDING_APPROVAL",
    },
  });
  await prisma.idea.update({ where: { id: idea.id }, data: { status: "BRIEFED" } });
  return brief.id;
}

/**
 * Approve a brief → create the Draft and QUEUE the writer/grader pipeline.
 *
 * This returns fast (no multi-minute wait): the draft is created in RESEARCHING
 * and the actual research/write/grade work runs OUT OF BAND — via Inngest when
 * configured, otherwise the in-process background worker (processQueuedDrafts),
 * which is kicked immediately and also runs on a periodic tick. That keeps the
 * UI responsive and immune to request timeouts.
 */
export async function approveBrief(briefId: string): Promise<void> {
  requireDb();
  const brief = await prisma.brief.findUnique({
    where: { id: briefId },
    include: { idea: true, draft: true },
  });
  if (!brief) throw new Error(`Brief ${briefId} not found`);

  await prisma.brief.update({ where: { id: briefId }, data: { status: "APPROVED" } });

  if (!brief.draft) {
    await prisma.draft.create({
      data: {
        businessId: brief.businessId,
        briefId: brief.id,
        title: brief.idea.title,
        bodyMd: "",
        version: 1,
        status: "RESEARCHING",
      },
    });
  }

  if (inngestEnabled()) {
    // Durable path: Inngest runs the pipeline function.
    await inngest.send({ name: "content/brief.approved", data: { briefId } });
  } else {
    // In-process path: kick the worker without blocking the caller. The draft is
    // already queued (RESEARCHING + brief APPROVED), so even if this process is
    // torn down the periodic worker tick (or another instance) picks it up.
    void processQueuedDrafts().catch((e) =>
      console.error("[worker] kick after approve failed:", e instanceof Error ? e.message : e),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Background worker — runs queued pipelines out of band (no HTTP timeout)
// ─────────────────────────────────────────────────────────────

const WORKER_STALE_MS = 15 * 60 * 1000; // reclaim a draft whose worker died mid-run
const WORKER_MAX_ATTEMPTS = 3; // give up (→ FAILED) after this many crashes
const IN_PROGRESS: DraftStatus[] = ["RESEARCHING", "DRAFTED", "GRADING", "REVISING"];

// One worker loop per process at a time (the DB claim-lock guards correctness;
// this just avoids piling up overlapping loops in a single instance).
let workerRunning = false;

type DraftStatus = "RESEARCHING" | "DRAFTED" | "GRADING" | "REVISING" | "PASSED" | "PUBLISHED" | "FAILED";

/**
 * Atomically claim the next draft that needs pipeline work: an approved brief
 * whose draft is still in-progress, not currently locked (or whose lock is
 * stale), and under the attempt cap. Returns the claimed draft or null.
 */
async function claimNextDraft(): Promise<{ id: string; briefId: string } | null> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - WORKER_STALE_MS);

  const candidate = await prisma.draft.findFirst({
    where: {
      status: { in: IN_PROGRESS },
      attempts: { lt: WORKER_MAX_ATTEMPTS },
      brief: { status: "APPROVED" },
      OR: [{ processingStartedAt: null }, { processingStartedAt: { lt: staleBefore } }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, briefId: true },
  });
  if (!candidate) return null;

  // Optimistic lock: only win the claim if it's still unclaimed/stale.
  const claim = await prisma.draft.updateMany({
    where: {
      id: candidate.id,
      OR: [{ processingStartedAt: null }, { processingStartedAt: { lt: staleBefore } }],
    },
    data: { processingStartedAt: now, attempts: { increment: 1 } },
  });
  return claim.count === 1 ? candidate : null;
}

/**
 * Drain the queue: claim and run pipelines one at a time (sequential keeps API
 * cost + load controlled) up to `max` per invocation. Safe to call from the
 * post-approve kick and the periodic scheduler tick; overlapping calls no-op via
 * the workerRunning guard. Stranded drafts (crash/restart/timeout) are healed
 * here because their stale lock makes them claimable again.
 */
export async function processQueuedDrafts(max = 10): Promise<number> {
  requireDb();
  if (workerRunning) return 0;
  workerRunning = true;
  let processed = 0;
  try {
    for (let i = 0; i < max; i++) {
      const claimed = await claimNextDraft();
      if (!claimed) break;
      try {
        await trackDraftCost(claimed.id, async () => {
          await runPipelineForBrief(claimed.briefId);
          // Auto-boost a near-miss with our own data (no human needed). Runs once
          // here; FAILED drafts aren't re-claimed, so it never loops.
          const after = await prisma.draft.findUnique({
            where: { id: claimed.id },
            select: { status: true },
          });
          if (after?.status === "FAILED") {
            // Auto-improve to the piece's ceiling (data boost + keep-best revises).
            await autoImproveDraft(claimed.id).catch((e) => {
              console.error(`[worker] auto-improve failed for ${claimed.id}:`, e instanceof Error ? e.message : e);
            });
          }
          // Give a passed piece a hero image now, so the Ready stack is complete
          // (swappable later on the review page). Best-effort — never block a pass.
          const final = await prisma.draft.findUnique({
            where: { id: claimed.id },
            select: { status: true },
          });
          if (final?.status === "PASSED") {
            await ensureHeroImage(claimed.id).catch((e) => {
              console.error(`[worker] hero image failed for ${claimed.id}:`, e instanceof Error ? e.message : e);
            });
          }
        });
      } catch (e) {
        console.error(
          `[worker] pipeline failed for draft ${claimed.id}:`,
          e instanceof Error ? e.message : e,
        );
        // If it has exhausted its attempts, stop retrying — flag for a human.
        const d = await prisma.draft.findUnique({
          where: { id: claimed.id },
          select: { attempts: true, status: true },
        });
        if (d && d.attempts >= WORKER_MAX_ATTEMPTS && IN_PROGRESS.includes(d.status as DraftStatus)) {
          await prisma.draft
            .update({ where: { id: claimed.id }, data: { status: "FAILED" } })
            .catch(() => {});
        }
      } finally {
        // Release the lock so terminal drafts don't hold it (and a still-in-progress
        // one becomes reclaimable if this run didn't finish it).
        await prisma.draft
          .update({ where: { id: claimed.id }, data: { processingStartedAt: null } })
          .catch(() => {});
      }
      processed++;
    }
  } finally {
    workerRunning = false;
  }
  return processed;
}

/** Skip/reject a brief — takes it out of the queue. */
export async function rejectBrief(briefId: string): Promise<void> {
  requireDb();
  const brief = await prisma.brief.findUnique({ where: { id: briefId } });
  if (!brief) throw new Error(`Brief ${briefId} not found`);
  await prisma.brief.update({ where: { id: briefId }, data: { status: "REJECTED" } });
  await prisma.idea.update({ where: { id: brief.ideaId }, data: { status: "DISMISSED" } });
}

/** Dismiss an idea from the box. */
export async function dismissIdea(ideaId: string): Promise<void> {
  requireDb();
  await prisma.idea.update({ where: { id: ideaId }, data: { status: "DISMISSED" } });
}

// ─────────────────────────────────────────────────────────────
// The engine: write → grade-until-pass → publish
// ─────────────────────────────────────────────────────────────

export interface PipelineOutcome {
  draftId: string;
  passed: boolean;
  overall: number;
  loops: number;
  pageUrl?: string;
}

export async function runPipelineForBrief(briefId: string): Promise<PipelineOutcome> {
  requireDb();
  const brief = await prisma.brief.findUnique({
    where: { id: briefId },
    include: { idea: true, business: true, draft: true },
  });
  if (!brief) throw new Error(`Brief ${briefId} not found`);

  // Ensure a draft exists.
  let draft =
    brief.draft ??
    (await prisma.draft.create({
      data: {
        businessId: brief.businessId,
        briefId: brief.id,
        title: brief.idea.title,
        bodyMd: "",
        version: 1,
        status: "RESEARCHING",
      },
    }));

  const spec = toBriefSpec(brief);
  const brandVoice = brief.business.brandVoice ?? "Clear, warm, and authoritative.";
  const threshold = brief.business.qualityThreshold;
  const finalizeCtx = {
    title: draft.title,
    brandName: brief.business.name,
    isoDate: new Date().toISOString().slice(0, 10),
    metaDescription: "",
  };

  // Write, then auto-finalize (strip placeholders, guarantee valid JSON-LD) so
  // no mechanical defect is ever graded or shipped. House rules from the owner's
  // blog feedback are injected so past corrections shape every new blog.
  await prisma.draft.update({ where: { id: draft.id }, data: { status: "DRAFTED" } });
  const houseRules = await buildContentGuidance(brief.businessId);
  const rawBody = await writeDraft(spec, brandVoice, houseRules);
  finalizeCtx.metaDescription = deriveMetaDescription(rawBody, draft.title);
  const body = finalizeDraftBody(rawBody, finalizeCtx);
  draft = await prisma.draft.update({
    where: { id: draft.id },
    data: { bodyMd: body, status: "GRADING" },
  });

  // Grade → revise → re-grade. We KEEP THE BEST version seen, not the latest —
  // a revision can regress (score down), and the stored draft must never get
  // worse than a version we already produced. The DB always holds the best body.
  const briefContext = JSON.stringify(spec);
  let currentDraft = body;
  let loop = 0;
  let bestBody = body;
  let bestOverall = -1;

  for (loop = 1; loop <= MAX_REVISION_LOOPS; loop++) {
    const grade = await gradeDraft(currentDraft, briefContext, threshold);

    await prisma.grade.create({
      data: {
        draftId: draft.id,
        overall: grade.overall,
        passed: grade.passed,
        dimensions: grade.dimensions as unknown as Prisma.InputJsonValue,
        feedback: grade.feedback,
        version: loop,
      },
    });

    // Track the best-scoring version.
    if (grade.overall > bestOverall) {
      bestOverall = grade.overall;
      bestBody = currentDraft;
    }

    const passed = bestOverall >= threshold; // pass on the BEST achieved, not the last
    const isLast = loop === MAX_REVISION_LOOPS;

    // Persist the BEST body so the stored draft never regresses below a prior version.
    await prisma.draft.update({
      where: { id: draft.id },
      data: {
        bodyMd: bestBody,
        version: loop,
        status: passed ? "PASSED" : isLast ? "FAILED" : "REVISING",
      },
    });

    if (passed || isLast) break;

    // Revise the weakest dimensions, then loop back to re-grade. Keep the stored
    // body as the best-so-far; the unproven revision only replaces it if it grades higher.
    const weakest = weakestDimensions(grade.dimensions).slice(0, 3);
    currentDraft = finalizeDraftBody(
      await reviseDraft(currentDraft, grade.feedback, weakest),
      finalizeCtx,
    );
  }

  const passed = bestOverall >= threshold;

  // A passed draft is finalized and parked in the "ready to schedule" queue.
  // Internal linking, imaging, and the CMS publish all happen at scheduled
  // go-live time (publishNow) — the content calendar controls when it's live.
  return { draftId: draft.id, passed, overall: bestOverall, loops: loop, pageUrl: undefined };
}

// ─────────────────────────────────────────────────────────────
// Review lane — auto-boost a near-miss with our own resources, then re-grade.
// No human writing: real product data (Shopify) + verified web facts do the
// lift. A highlight→instruct editor lets the operator DIRECT targeted tweaks
// without typing prose.
// ─────────────────────────────────────────────────────────────

/** Save a draft body (used by auto-boost + the highlight-edit flow). */
export async function updateDraftBody(draftId: string, bodyMd: string): Promise<void> {
  requireDb();
  await prisma.draft.update({ where: { id: draftId }, data: { bodyMd } });
}

// ─────────────────────────────────────────────────────────────
// Blog feedback loop — fix the current blog AND remember for future ones.
// ─────────────────────────────────────────────────────────────

/** The standard instruction used to scrub fabricated logistics from a blog. */
const FABRICATION_NOTE =
  "Remove only the fabricated specifics about how THIS business operates: invented delivery timelines " +
  "or turnaround, hour-by-hour or day-by-day shipping schedules ('Hour 0–48: build and crate'), named " +
  "carriers, aircraft, airports, routes, transfer points, courier methods, delivery guarantees, or a " +
  "step-by-step 'how a casket travels from order to delivery' process. Replace them with broad, honest " +
  "guidance — timelines vary by destination and carrier, and the reader should confirm exact timing and " +
  "handling with us and the shipping provider directly. Also stop asserting how a specific third-party " +
  "funeral home operates as fact. IMPORTANT: KEEP all pricing, cost ranges, typical fees, general market " +
  "facts, and legal/regulatory information — do NOT remove those. Keep the rest intact too: structure, " +
  "headings, table of contents, FAQ, warm tone, and links. Only strip invented operational process details.";

/** Close an unterminated trailing ```json fence so its schema never leaks into
 *  the visible body as text. No-op when the fence is absent or already closed. */
function ensureJsonLdClosed(md: string): string {
  const idx = md.lastIndexOf("```json");
  if (idx === -1) return md;
  const after = md.slice(idx + "```json".length);
  if (after.includes("```")) return md; // already closed
  return `${md.replace(/\s+$/, "")}\n\`\`\`\n`;
}

/** Apply a plain-language edit instruction to a blog body, preserving structure
 *  and the trailing JSON-LD. Returns the original body on any failure. */
async function reviseBodyWithInstruction(
  bodyMd: string,
  title: string,
  instruction: string,
): Promise<string> {
  if (!aiEnabled()) return bodyMd;
  const jsonFence = bodyMd.match(/```json[\s\S]*?```/i)?.[0];
  try {
    const out = await completeText({
      model: MODELS.writer,
      maxTokens: 20000,
      prompt: `You are editing a published-quality blog article. Apply the operator's instruction below, changing ONLY what it requires and preserving everything else — the overall structure, headings, table of contents, FAQ, warm empathetic tone, internal/external links, and the trailing \`\`\`json JSON-LD schema block (keep it valid and complete). Return the FULL revised article in Markdown and nothing else.

OPERATOR INSTRUCTION:
${instruction}

ARTICLE TITLE: ${title}

ARTICLE (Markdown):
${bodyMd}`,
    });
    // Unwrap a ```markdown … ``` envelope ONLY if the model wrapped its whole
    // reply in one. The old blanket strip of a trailing ``` also ate the closing
    // fence of our legitimate trailing ```json JSON-LD block, leaving it
    // unterminated so the raw schema leaked into the visible body on publish.
    let cleaned = (out || "").trim();
    const envelope = cleaned.match(/^```(?:markdown|md)?\s*\n([\s\S]*)\n```$/);
    if (envelope) cleaned = envelope[1].trim();
    if (cleaned.length < bodyMd.length * 0.4) return bodyMd; // guard against a truncated/bad response
    if (jsonFence && !/```json/i.test(cleaned)) cleaned += `\n\n${jsonFence}`;
    cleaned = ensureJsonLdClosed(cleaned); // belt-and-suspenders: never emit an open fence
    // Never let a revision break a post: if the rewritten body wouldn't render
    // to real HTML (empty / raw text), keep the original.
    try {
      const html = markdownToHtml(cleaned)
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .trim();
      const broke = preflightPublish(html).issues.some((i) => /did not render|raw text/i.test(i));
      if (broke) {
        console.error("[revise] result failed preflight — keeping original body");
        return bodyMd;
      }
    } catch {
      return bodyMd;
    }
    return cleaned;
  } catch (e) {
    console.error("[revise] failed:", e instanceof Error ? e.message : e);
    return bodyMd;
  }
}

/**
 * Operator feedback on a blog: fix THIS blog per the note now, and remember the
 * note as a house rule so every future blog follows it. Keeps the piece in Ready
 * (status unchanged). Returns whether the body actually changed.
 */
export async function applyBlogFeedback(
  draftId: string,
  note: string,
): Promise<{ changed: boolean }> {
  requireDb();
  const clean = note.trim();
  if (!clean) return { changed: false };
  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    select: { id: true, businessId: true, bodyMd: true, title: true },
  });
  if (!draft) throw new Error(`Draft ${draftId} not found`);

  // Remember it (house rule for future blogs).
  await prisma.contentFeedback.create({
    data: { businessId: draft.businessId, draftId, note: clean.slice(0, 1000) },
  });

  // Fix the current blog.
  const revised = await trackDraftCost(draftId, () =>
    reviseBodyWithInstruction(draft.bodyMd, draft.title, clean),
  );
  if (revised !== draft.bodyMd) {
    await prisma.draft.update({ where: { id: draftId }, data: { bodyMd: revised } });
    return { changed: true };
  }
  return { changed: false };
}

/**
 * Scrub fabricated logistics from every Ready (PASSED) blog and record the rule
 * once per business so future blogs avoid it. Best-effort per draft.
 */
export async function scrubAllReadyFabrication(
  businessId?: string,
): Promise<{ scanned: number; changed: number }> {
  requireDb();
  const drafts = await prisma.draft.findMany({
    where: { status: "PASSED", rejectedAt: null, ...(businessId ? { businessId } : {}) },
    select: { id: true, businessId: true, bodyMd: true, title: true },
  });
  const ruleStored = new Set<string>();
  let changed = 0;
  for (const d of drafts) {
    try {
      if (!ruleStored.has(d.businessId)) {
        ruleStored.add(d.businessId);
        await prisma.contentFeedback
          .create({ data: { businessId: d.businessId, note: FABRICATION_NOTE.slice(0, 1000) } })
          .catch(() => {});
      }
      const revised = await trackDraftCost(d.id, () =>
        reviseBodyWithInstruction(d.bodyMd, d.title, FABRICATION_NOTE),
      );
      if (revised !== d.bodyMd) {
        await prisma.draft.update({ where: { id: d.id }, data: { bodyMd: revised } });
        changed++;
      }
    } catch (e) {
      console.error("[scrub] failed for", d.id, e instanceof Error ? e.message : e);
    }
  }
  return { scanned: drafts.length, changed };
}

/**
 * Fix an ALREADY-PUBLISHED post: scrub fabricated business-operations claims from
 * its body, re-render clean HTML, and UPDATE the live Shopify article in place —
 * set to HIDDEN so the operator reviews before re-publishing. Uses the stored CMS
 * id, so no duplicate is created. Returns whether the Shopify article was updated.
 */
export async function fixPublishedPost(draftId: string): Promise<{ updated: boolean }> {
  requireDb();
  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    include: { business: true, page: true },
  });
  if (!draft || !draft.page?.cmsId) return { updated: false };

  // 1. Scrub fabricated operations from the body (keep pricing/facts/structure).
  const scrubbed = await trackDraftCost(draftId, () =>
    reviseBodyWithInstruction(draft.bodyMd, draft.title, FABRICATION_NOTE),
  );
  if (scrubbed !== draft.bodyMd) {
    await prisma.draft.update({ where: { id: draftId }, data: { bodyMd: scrubbed } });
  }

  // 2. Render and push the fix to the live Shopify article, set Hidden.
  const platform = draft.business.cmsPlatform.toLowerCase() as CmsPlatform;
  const connector = await prisma.connector.findUnique({
    where: { businessId_type: { businessId: draft.businessId, type: cmsConnectorType(platform) } },
  });
  if (!connector || connector.status !== "CONNECTED" || !encryptionEnabled()) return { updated: false };
  const config = decryptJson(connector.configEnc);
  const adapter = getCmsAdapter(platform, config);

  let html = markdownToHtml(scrubbed);
  const siteBase = siteBaseFromConfig(platform, config as Record<string, unknown>);
  if (siteBase) {
    try {
      const { html: safe } = await sanitizeLinks(html, { siteBase });
      html = safe;
    } catch (e) {
      console.error("[fix-published] link sanitize failed:", e instanceof Error ? e.message : e);
    }
  }
  html = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/(\s*\n){3,}/g, "\n\n").trim();

  await adapter.update(draft.page.cmsId, {
    title: draft.title,
    html,
    slug: slugify(draft.title),
    metaDescription: deriveMetaDescription(scrubbed, draft.title),
    seoTitle: deriveSeoTitle(draft.title),
    publishState: "draft", // hidden — operator reviews, then pushes live
  });
  return { updated: true };
}

/**
 * Fix every already-published post for the business (or all businesses): scrub +
 * update Shopify + set hidden. Records the fabrication rule once so future blogs
 * avoid it. Best-effort per post.
 */
export async function fixAllPublishedPosts(
  businessId?: string,
): Promise<{ scanned: number; updated: number }> {
  requireDb();
  const drafts = await prisma.draft.findMany({
    where: { status: "PUBLISHED", page: { isNot: null }, ...(businessId ? { businessId } : {}) },
    select: { id: true, businessId: true },
  });
  const ruleStored = new Set<string>();
  let updated = 0;
  for (const d of drafts) {
    try {
      if (!ruleStored.has(d.businessId)) {
        ruleStored.add(d.businessId);
        await prisma.contentFeedback
          .create({ data: { businessId: d.businessId, note: FABRICATION_NOTE.slice(0, 1000) } })
          .catch(() => {});
      }
      const r = await fixPublishedPost(d.id);
      if (r.updated) updated++;
    } catch (e) {
      console.error("[fix-published] failed for", d.id, e instanceof Error ? e.message : e);
    }
  }
  return { scanned: drafts.length, updated };
}

// ─────────────────────────────────────────────────────────────
// Auto-refresh — keep the published library fresh. Rewrites a decaying/stale
// post and moves it back into READY for the operator to review + re-publish
// (which updates the same Shopify article in place).
// ─────────────────────────────────────────────────────────────

const REFRESH_COOLDOWN_DAYS = 90;

/**
 * Refresh ONE published post: rewrite it to be current + more quotable, then
 * move it back into Ready (status PASSED, refreshedAt stamped) for re-review.
 * Keeps its Page/cmsId so re-publishing updates the same Shopify article.
 */
export async function refreshPublishedPost(draftId: string): Promise<{ refreshed: boolean }> {
  requireDb();
  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    select: { id: true, bodyMd: true, title: true },
  });
  if (!draft) throw new Error(`Draft ${draftId} not found`);

  const year = new Date().getFullYear();
  const note =
    `Refresh this published article for ${year}. Update any dates, prices, statistics, and "as of" ` +
    `references so they are current and accurate. Strengthen the opening "Quick answer" block and each ` +
    `section's first sentence so an AI answer engine can quote it verbatim. Add depth where a competitor ` +
    `would be more complete, and fix anything outdated. Keep it strictly accurate — do NOT fabricate ` +
    `numbers or business-operations details. Preserve the structure, tone, links, and the JSON-LD schema.`;

  const revised = await trackDraftCost(draftId, () =>
    reviseBodyWithInstruction(draft.bodyMd, draft.title, note),
  );
  const changed = revised !== draft.bodyMd;
  if (changed) {
    // Real rewrite — move it back into Ready for review; keep the Page so
    // re-publishing updates the same Shopify article in place.
    await prisma.draft.update({
      where: { id: draftId },
      data: {
        bodyMd: revised,
        status: "PASSED",
        reviewedAt: null,
        scheduledFor: null,
        rejectedAt: null,
        refreshedAt: new Date(),
      },
    });
  } else {
    // No-op (nothing to update, or the rewrite failed our guards): don't push an
    // identical article into the review queue. Still stamp refreshedAt — a
    // freshness pass ran and found nothing to change — so it rotates out of the
    // age-based candidate pool. Posts GSC still flags as decaying keep showing
    // up regardless (getStalePosts includes them independent of refreshedAt).
    await prisma.draft.update({ where: { id: draftId }, data: { refreshedAt: new Date() } });
  }
  return { refreshed: changed };
}

/** Pick published posts most worth refreshing: decaying (GSC) first, then the
 *  oldest ones not refreshed within the cooldown. Returns draft ids, best-first. */
async function refreshCandidates(businessId: string, max: number): Promise<string[]> {
  const cutoff = new Date(Date.now() - REFRESH_COOLDOWN_DAYS * 86_400_000);
  const published = await prisma.draft.findMany({
    where: {
      businessId,
      status: "PUBLISHED",
      page: { isNot: null },
      OR: [{ refreshedAt: null }, { refreshedAt: { lt: cutoff } }],
    },
    select: { id: true, page: { select: { url: true } } },
    orderBy: { page: { publishedAt: "asc" } }, // oldest first
    take: 50,
  });
  if (!published.length) return [];

  let decayUrls = new Set<string>();
  if (gscEnabled()) {
    const dp = await decayingPages({ window: 28, minPriorClicks: 20, minDropPct: 30 }).catch(() => null);
    if (dp) decayUrls = new Set(dp.map((d) => normalizeUrl(d.page)));
  }
  const rank = (u: string | undefined) => (u && decayUrls.has(normalizeUrl(u)) ? 0 : 1);
  return [...published]
    .sort((a, b) => rank(a.page?.url) - rank(b.page?.url))
    .slice(0, max)
    .map((d) => d.id);
}

/** Refresh up to `max` decaying/stale posts for a business into Ready. */
export async function autoRefreshBusiness(businessId: string, max = 2): Promise<number> {
  requireDb();
  const ids = await refreshCandidates(businessId, max);
  let done = 0;
  for (const id of ids) {
    try {
      const { refreshed } = await refreshPublishedPost(id);
      if (refreshed) done++;
    } catch (e) {
      console.error("[refresh] failed for", id, e instanceof Error ? e.message : e);
    }
  }
  return done;
}

/** Auto-refresh for every active business. Called on a slow cadence. */
export async function autoRefreshAll(max = 2): Promise<Record<string, number>> {
  requireDb();
  const businesses = await prisma.business.findMany({
    where: { status: { in: ["ACTIVE", "ONBOARDING"] } },
    select: { id: true },
  });
  const out: Record<string, number> = {};
  for (const b of businesses) {
    try {
      out[b.id] = await autoRefreshBusiness(b.id, max);
    } catch {
      out[b.id] = 0;
    }
  }
  return out;
}

/**
 * Surface published posts worth refreshing, worst-first, each with the reason.
 * A post is "stale" if Search Console shows it decaying, OR it hasn't been
 * touched (published or refreshed) within the refresh cooldown. This powers the
 * "Needs refresh" panel — the operator sees WHY before spending a rewrite on it.
 */
export async function getStalePosts(businessId: string, max = 12): Promise<StalePostVM[]> {
  requireDb();
  const now = Date.now();
  const cooldownMs = REFRESH_COOLDOWN_DAYS * 86_400_000;

  const published = await prisma.draft.findMany({
    where: { businessId, status: "PUBLISHED", page: { isNot: null } },
    select: {
      id: true,
      title: true,
      refreshedAt: true,
      page: { select: { url: true, publishedAt: true } },
    },
    orderBy: { page: { publishedAt: "asc" } }, // oldest first
    take: 200,
  });
  if (!published.length) return [];

  // GSC decay map (url → drop), best-effort — absent when GSC isn't wired.
  const decayByUrl = new Map<string, { dropPct: number; priorClicks: number }>();
  if (gscEnabled()) {
    const dp = await decayingPages({ window: 28, minPriorClicks: 20, minDropPct: 25 }).catch(() => null);
    if (dp) for (const d of dp) decayByUrl.set(normalizeUrl(d.page), { dropPct: d.dropPct, priorClicks: d.priorClicks });
  }

  const monthsSince = (d: Date | null | undefined) =>
    d ? Math.max(0, Math.round((now - d.getTime()) / (30 * 86_400_000))) : 0;

  const rows: StalePostVM[] = [];
  for (const p of published) {
    const url = p.page?.url ?? null;
    const touched = p.refreshedAt ?? p.page?.publishedAt ?? null;
    const ageMs = touched ? now - touched.getTime() : Infinity;
    const decay = url ? decayByUrl.get(normalizeUrl(url)) : undefined;
    const overCooldown = ageMs >= cooldownMs;
    if (!decay && !overCooldown) continue; // fresh enough, not decaying — skip

    const ageMonths = monthsSince(touched);
    let reason: string;
    if (decay) {
      reason = `↓${decay.dropPct}% traffic (28d)`;
    } else if (p.refreshedAt) {
      reason = `refreshed ${ageMonths} mo ago`;
    } else {
      reason = touched ? `published ${ageMonths} mo ago` : "no publish date on record";
    }

    rows.push({
      draftId: p.id,
      title: p.title,
      url,
      publishedAt: p.page?.publishedAt ? p.page.publishedAt.toISOString() : null,
      refreshedAt: p.refreshedAt ? p.refreshedAt.toISOString() : null,
      ageMonths,
      dropPct: decay ? decay.dropPct : null,
      priorClicks: decay ? decay.priorClicks : null,
      decaying: Boolean(decay),
      reason,
    });
  }

  // Decaying first (highest ROI — already ranks, just slipping), then oldest.
  rows.sort((a, b) => {
    if (a.decaying !== b.decaying) return a.decaying ? -1 : 1;
    if (a.decaying && b.decaying) return (b.dropPct ?? 0) - (a.dropPct ?? 0);
    return b.ageMonths - a.ageMonths;
  });
  return rows.slice(0, max);
}

/** House rules from accumulated blog feedback, for the writer's prompt. "" when none. */
async function buildContentGuidance(businessId: string): Promise<string> {
  const fb = await prisma.contentFeedback.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: { note: true },
  });
  if (!fb.length) return "";
  const seen = new Set<string>();
  const rules: string[] = [];
  for (const f of fb) {
    const n = f.note.trim();
    const key = n.toLowerCase();
    if (n && !seen.has(key)) {
      seen.add(key);
      rules.push(n);
    }
    if (rules.length >= 12) break;
  }
  return rules.length
    ? `HOUSE RULES from the site owner — you MUST follow every one of these:\n${rules.map((r) => `- ${r}`).join("\n")}`
    : "";
}

/** Domains we treat as authoritative enough to cite for E-E-A-T. */
const AUTHORITATIVE = /(\.gov|\.edu|nfda\.org|consumer\.ftc\.gov|\.org)(\/|$)/i;

/** Gather real enrichment resources for a keyword: the store's product facts
 *  (when the CMS connector is configured) + excerpts from authoritative pages
 *  (DataForSEO SERP → Firecrawl). Degrades to whatever is available. */
async function gatherResources(
  businessId: string,
  keyword: string,
): Promise<EnrichResources> {
  const products: EnrichResources["products"] = [];
  const sources: EnrichResources["sources"] = [];

  // Product facts from the business's CMS catalog.
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (business && encryptionEnabled()) {
    const platform = business.cmsPlatform.toLowerCase() as CmsPlatform;
    const connector = await prisma.connector.findUnique({
      where: { businessId_type: { businessId, type: cmsConnectorType(platform) } },
    });
    if (connector?.status === "CONNECTED") {
      try {
        const adapter = getCmsAdapter(platform, decryptJson(connector.configEnc));
        const facts = (await adapter.listProductFacts?.(keyword)) ?? [];
        products.push(...facts);
      } catch {
        /* no product data available */
      }
    }
  }

  // Authoritative web facts (real, citable).
  if (dataforseoEnabled() && firecrawlEnabled()) {
    try {
      const serp = await serpTop(keyword, { limit: 10 });
      const authoritative = serp.filter((r) => AUTHORITATIVE.test(r.url)).slice(0, 2);
      const urls = (authoritative.length ? authoritative : serp.slice(0, 2)).map((r) => r.url);
      const pages = await scrapeMany(urls);
      for (const p of pages) sources.push({ url: p.url, title: p.title, excerpt: p.markdown });
    } catch {
      /* no web data available */
    }
  }

  return { products, sources };
}

/**
 * Auto-boost a near-miss with real data (no human input): pull product facts +
 * authoritative web facts, have the enricher weave them in, then re-grade. If it
 * now clears the bar → PASSED (flows to the calendar); otherwise stays FAILED.
 */
export async function boostDraft(draftId: string): Promise<{
  overall: number;
  passed: boolean;
  usedProducts: number;
  usedSources: number;
}> {
  requireDb();
  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    include: {
      brief: { include: { idea: true } },
      business: true,
      grades: { orderBy: { version: "desc" }, take: 1 },
    },
  });
  if (!draft) throw new Error(`Draft ${draftId} not found`);

  const spec = toBriefSpec(draft.brief);
  const res = await gatherResources(draft.businessId, spec.targetKeyword);

  if (!hasResources(res)) {
    // Nothing real to add — leave it as a near-miss for a later attempt.
    const g = draft.grades[0];
    return { overall: g?.overall ?? 0, passed: false, usedProducts: 0, usedSources: 0 };
  }

  const weakest = draft.grades[0]
    ? weakestDimensions(draft.grades[0].dimensions as never).slice(0, 3)
    : ["eeat", "depth"];

  const enriched = finalizeDraftBody(await enrichDraft(draft.bodyMd, spec, weakest, res), {
    title: draft.title,
    brandName: draft.business.name,
    isoDate: new Date().toISOString().slice(0, 10),
    metaDescription: deriveMetaDescription(draft.bodyMd, draft.title),
  });
  await prisma.draft.update({ where: { id: draft.id }, data: { bodyMd: enriched } });

  const { overall, passed } = await regradeDraft(draft.id);
  return { overall, passed, usedProducts: res.products.length, usedSources: res.sources.length };
}

/**
 * Auto-improve a near-miss with NO human involvement: one data boost, then ONE
 * keep-best revise+regrade — but only spend tokens on pieces within striking
 * distance of the bar. A piece far below (a lost cause) is left alone rather than
 * burning a dozen long LLM calls on it. Cost-bounded by design.
 */
export async function autoImproveDraft(draftId: string): Promise<void> {
  requireDb();

  // Cheap pre-check: skip pieces that already pass, or are too far below the bar
  // to be worth the (expensive) boost + revise. Only "close" near-misses qualify.
  const pre = await prisma.draft.findUnique({
    where: { id: draftId },
    include: {
      business: { select: { qualityThreshold: true } },
      grades: { orderBy: { overall: "desc" }, take: 1 },
    },
  });
  if (!pre) return;
  const bar = pre.business.qualityThreshold;
  const best0 = pre.grades[0]?.overall ?? 0;
  if (best0 >= bar) return; // already passes
  if (best0 > 0 && best0 < bar - 15) return; // too far — don't throw tokens at it

  const boost = await boostDraft(draftId).catch((e) => {
    console.error(`[auto-improve] boost failed for ${draftId}:`, e instanceof Error ? e.message : e);
    return null;
  });
  if (boost?.passed) return;

  for (let pass = 0; pass < 1; pass++) {
    const draft = await prisma.draft.findUnique({
      where: { id: draftId },
      include: {
        brief: { include: { idea: true } },
        business: true,
        grades: { orderBy: { overall: "desc" }, take: 1 },
      },
    });
    if (!draft) return;
    const threshold = draft.business.qualityThreshold;
    const best = draft.grades[0];
    if (!best || best.overall >= threshold) return; // passed or nothing to improve

    const spec = toBriefSpec(draft.brief);
    const weakest = weakestDimensions(best.dimensions as never).slice(0, 3);
    const candidate = finalizeDraftBody(await reviseDraft(draft.bodyMd, best.feedback ?? "", weakest), {
      title: draft.title,
      brandName: draft.business.name,
      isoDate: new Date().toISOString().slice(0, 10),
      metaDescription: deriveMetaDescription(draft.bodyMd, draft.title),
    });
    const grade = await gradeDraft(candidate, JSON.stringify(spec), threshold);
    const nextVersion = (best.version ?? draft.version) + 1;
    await prisma.grade.create({
      data: {
        draftId,
        overall: grade.overall,
        passed: grade.passed,
        dimensions: grade.dimensions as unknown as Prisma.InputJsonValue,
        feedback: grade.feedback,
        version: nextVersion,
      },
    });
    // Keep-best: only adopt the revision if it graded at least as high.
    if (grade.overall >= best.overall) {
      await prisma.draft.update({
        where: { id: draftId },
        data: { bodyMd: candidate, version: nextVersion, status: grade.passed ? "PASSED" : "FAILED" },
      });
      if (grade.passed) return;
    }
  }
}

/** Request an auto-improve boost on EVERY near-miss (clears a backlog in one go).
 *  Flags them; the background boost worker drains them with autoImproveDraft. */
export async function requestBoostAllNearMisses(businessId: string): Promise<number> {
  requireDb();
  const result = await prisma.draft.updateMany({
    where: { businessId, status: "FAILED", rejectedAt: null, boostRequestedAt: null },
    data: { boostRequestedAt: new Date() },
  });
  return result.count;
}

/** Mark a draft for a background boost (the on-demand "Boost with data" button).
 *  Returns fast; the boost worker runs the heavy work out of band. */
export async function requestBoost(draftId: string): Promise<void> {
  requireDb();
  await prisma.draft.update({ where: { id: draftId }, data: { boostRequestedAt: new Date() } });
}

// One boost loop per process at a time (single instance → this serializes the
// route kick and the periodic tick; boostDraft itself is the unit of work).
let boostRunning = false;

/**
 * Drain pending boost requests: run boostDraft for each draft flagged with
 * boostRequestedAt, then clear the flag (whether it lifted the score or not, so
 * the UI stops "boosting"). Called from the /api/review/boost kick and a periodic
 * scheduler tick (which also picks up any request stranded by a restart).
 */
export async function processBoostRequests(max = 5): Promise<number> {
  requireDb();
  if (boostRunning) return 0;
  boostRunning = true;
  let n = 0;
  try {
    for (let i = 0; i < max; i++) {
      const d = await prisma.draft.findFirst({
        where: { boostRequestedAt: { not: null } },
        orderBy: { boostRequestedAt: "asc" },
        select: { id: true },
      });
      if (!d) break;
      try {
        await trackDraftCost(d.id, () => autoImproveDraft(d.id));
      } catch (e) {
        console.error(`[boost] failed for ${d.id}:`, e instanceof Error ? e.message : e);
      } finally {
        await prisma.draft
          .update({ where: { id: d.id }, data: { boostRequestedAt: null } })
          .catch(() => {});
      }
      n++;
    }
  } finally {
    boostRunning = false;
  }
  return n;
}

/**
 * Highlight → instruct: revise just the selected passage per a short instruction
 * and splice it back into the draft. Returns the updated body. No prose typing —
 * the operator directs, the model edits.
 */
export async function editDraftSelection(
  draftId: string,
  selectedText: string,
  instruction: string,
): Promise<string> {
  requireDb();
  const draft = await prisma.draft.findUnique({ where: { id: draftId } });
  if (!draft) throw new Error(`Draft ${draftId} not found`);
  if (!selectedText.trim() || !instruction.trim()) return draft.bodyMd;
  if (!draft.bodyMd.includes(selectedText)) return draft.bodyMd; // selection not found — no-op

  const revised = await rewritePassage(selectedText, instruction);
  const newBody = draft.bodyMd.replace(selectedText, revised);
  await prisma.draft.update({ where: { id: draftId }, data: { bodyMd: newBody } });
  return newBody;
}

/**
 * Re-grade a (human-polished) draft ONCE — no revision loop. When it now clears
 * the business's bar it's promoted to PASSED and flows to the calendar's
 * "ready to schedule" queue; otherwise it stays FAILED with fresh feedback for
 * another polish pass. This is the last mile that turns an 83 into a 92.
 */
export async function regradeDraft(draftId: string): Promise<{ overall: number; passed: boolean }> {
  requireDb();
  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    include: {
      brief: { include: { idea: true } },
      business: true,
      grades: { orderBy: { version: "desc" }, take: 1 },
    },
  });
  if (!draft) throw new Error(`Draft ${draftId} not found`);

  const spec = toBriefSpec(draft.brief);
  const threshold = draft.business.qualityThreshold;
  const grade = await gradeDraft(draft.bodyMd, JSON.stringify(spec), threshold);
  const nextVersion = (draft.grades[0]?.version ?? draft.version) + 1;

  await prisma.grade.create({
    data: {
      draftId: draft.id,
      overall: grade.overall,
      passed: grade.passed,
      dimensions: grade.dimensions as unknown as Prisma.InputJsonValue,
      feedback: grade.feedback,
      version: nextVersion,
    },
  });
  await prisma.draft.update({
    where: { id: draft.id },
    data: { version: nextVersion, status: grade.passed ? "PASSED" : "FAILED" },
  });
  return { overall: grade.overall, passed: grade.passed };
}

// ─────────────────────────────────────────────────────────────
// Content calendar
// ─────────────────────────────────────────────────────────────

/** Move a reviewed piece out of "Ready" into the calendar's ready-to-schedule
 *  queue (still no date — the operator picks that on the calendar). */
export async function markReadyForSchedule(draftId: string): Promise<void> {
  requireDb();
  await prisma.draft.update({ where: { id: draftId }, data: { reviewedAt: new Date() } });
}

/**
 * Record operator feedback on a finished piece — the training signal used to
 * tune the writer/grader. "LIKE" keeps the piece in Ready; "REJECT" also pulls
 * it off the Ready list (stamps rejectedAt) so you don't see it again.
 */
/**
 * Render the EXACT HTML a draft would publish as (markdown → HTML, scripts
 * stripped) plus the pre-publish check result — for the dashboard preview.
 */
export async function renderPublishPreview(draftId: string): Promise<{
  html: string;
  seoTitle: string;
  metaDescription: string;
  slug: string;
  ok: boolean;
  issues: string[];
}> {
  requireDb();
  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    select: { bodyMd: true, title: true },
  });
  if (!draft) throw new Error(`Draft ${draftId} not found`);
  // Self-heal a stored body left with an unterminated ```json fence by an older
  // revise pass, so its markdown source is clean too (not just the render).
  const healed = ensureJsonLdClosed(draft.bodyMd);
  if (healed !== draft.bodyMd) {
    await prisma.draft.update({ where: { id: draftId }, data: { bodyMd: healed } }).catch(() => {});
  }
  const html = markdownToHtml(healed)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/(\s*\n){3,}/g, "\n\n")
    .trim();
  const seoTitle = deriveSeoTitle(draft.title);
  const metaDescription = deriveMetaDescription(draft.bodyMd, draft.title);
  const issues = [...preflightPublish(html).issues, ...metaIssues(seoTitle, metaDescription)];
  return {
    html,
    seoTitle,
    metaDescription,
    slug: slugify(draft.title),
    ok: issues.length === 0,
    issues,
  };
}

export async function recordDraftFeedback(
  draftId: string,
  verdict: "LIKE" | "REJECT",
  reason: string,
): Promise<void> {
  requireDb();
  await prisma.draftFeedback.create({
    data: { draftId, verdict, reason: reason.trim().slice(0, 4000) },
  });
  if (verdict === "REJECT") {
    await prisma.draft.update({ where: { id: draftId }, data: { rejectedAt: new Date() } });
  }
}

/** Put a passed draft on the calendar for auto-publish at `when`. */
export async function scheduleDraft(draftId: string, when: Date): Promise<void> {
  requireDb();
  await prisma.draft.update({
    where: { id: draftId },
    // Scheduling implies it's been reviewed — stamp reviewedAt if not already.
    data: { scheduledFor: when, status: "PASSED", reviewedAt: new Date() },
  });
}

/** Remove a draft from the calendar (back to the ready queue). */
export async function unscheduleDraft(draftId: string): Promise<void> {
  requireDb();
  await prisma.draft.update({ where: { id: draftId }, data: { scheduledFor: null } });
}

/** Auto-rollout: publish every scheduled draft whose time has arrived. Called
 *  by the scheduler (Inngest cron) or a manual trigger. */
export async function publishScheduled(now: Date = new Date()): Promise<{ published: string[] }> {
  requireDb();
  const due = await prisma.draft.findMany({
    where: { status: "PASSED", scheduledFor: { not: null, lte: now } },
    orderBy: { scheduledFor: "asc" },
  });
  const published: string[] = [];
  for (const d of due) {
    try {
      await publishNow(d.id, "published");
      published.push(d.id);
    } catch (e) {
      // Leave it scheduled; the next run retries. Log so a stuck piece is visible.
      console.error(
        `[publishScheduled] failed to publish draft ${d.id}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }
  return { published };
}

// Rough per-image cost of Gemini image generation, in cents (for the per-blog
// cost tracker). Approximate — the exact price varies by model/resolution.
const GEMINI_IMAGE_CENTS = 4;

/** The store's product-image lookup, if a CMS connector is configured. */
async function productImageLookup(
  businessId: string,
  platform: CmsPlatform,
): Promise<((q: string) => Promise<{ url: string; alt: string } | null>) | undefined> {
  if (!encryptionEnabled()) return undefined;
  const connector = await prisma.connector.findUnique({
    where: { businessId_type: { businessId, type: cmsConnectorType(platform) } },
  });
  if (!connector || connector.status !== "CONNECTED") return undefined;
  try {
    const config = decryptJson(connector.configEnc);
    const adapter = getCmsAdapter(platform, config);
    return adapter.sourceProductImage?.bind(adapter);
  } catch {
    return undefined;
  }
}

/**
 * Turn accumulated image feedback into a steering clause appended to every image
 * prompt — the "training" signal. Rejections become "Avoid …", likes become
 * "Prefer …". Returns undefined when there's no feedback yet.
 */
async function buildImageSteer(businessId: string): Promise<string | undefined> {
  const fb = await prisma.imageFeedback.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  if (!fb.length) return undefined;
  const uniq = (rows: typeof fb) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of rows) {
      const s = r.reason.trim();
      const key = s.toLowerCase();
      if (s && !seen.has(key)) {
        seen.add(key);
        out.push(s);
      }
      if (out.length >= 6) break;
    }
    return out;
  };
  const avoid = uniq(fb.filter((f) => f.verdict === "REJECT"));
  const prefer = uniq(fb.filter((f) => f.verdict === "LIKE"));
  const parts: string[] = [];
  if (avoid.length) parts.push(`Avoid, based on prior rejected images: ${avoid.join("; ")}.`);
  if (prefer.length) parts.push(`Prefer, based on images that worked: ${prefer.join("; ")}.`);
  return parts.length ? parts.join(" ") : undefined;
}

/**
 * Record operator feedback on a generated image. Business-scoped so it steers
 * all future generations (see buildImageSteer). The review page calls this, then
 * regenerates on a reject so the fix is immediate.
 */
export async function recordImageFeedback(
  draftId: string,
  verdict: "LIKE" | "REJECT",
  reason: string,
): Promise<void> {
  requireDb();
  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    select: { businessId: true },
  });
  if (!draft) throw new Error(`Draft ${draftId} not found`);
  await prisma.imageFeedback.create({
    data: { businessId: draft.businessId, draftId, verdict, reason: reason.slice(0, 500) },
  });
}

/** Max image options kept per draft (bounds DB growth). */
const MAX_GALLERY = 12;

/**
 * Append an image to the draft's gallery, mark it the selected one, and mirror
 * it into the scalar hero* fields (used by publish + the image endpoint).
 * Prunes the oldest options past MAX_GALLERY.
 */
async function storeHeroImage(
  draftId: string,
  img: { url?: string | null; base64?: string | null; mime?: string | null; alt: string; source: string },
): Promise<{ imageId: string }> {
  const created = await prisma.draftImage.create({
    data: {
      draftId,
      source: img.source,
      mime: img.mime ?? null,
      data: img.base64 ?? null,
      url: img.url || null,
      alt: img.alt.slice(0, 300),
    },
    select: { id: true },
  });
  await prisma.draft.update({
    where: { id: draftId },
    data: {
      heroImageUrl: img.url || null,
      heroImageData: img.base64 ?? null,
      heroImageMime: img.mime ?? null,
      heroImageAlt: img.alt.slice(0, 300),
      heroImageSource: img.source,
      selectedImageId: created.id,
    },
  });
  const extras = await prisma.draftImage.findMany({
    where: { draftId },
    orderBy: { createdAt: "desc" },
    skip: MAX_GALLERY,
    select: { id: true },
  });
  if (extras.length) {
    await prisma.draftImage.deleteMany({ where: { id: { in: extras.map((e) => e.id) } } });
  }
  return { imageId: created.id };
}

/** The draft's image gallery (newest first). Backfills a row from the legacy
 *  scalar hero fields for drafts created before the gallery existed. */
export async function listDraftImages(
  draftId: string,
): Promise<{ id: string; source: string; selected: boolean; createdAt: string }[]> {
  requireDb();
  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    select: { selectedImageId: true, heroImageData: true, heroImageUrl: true, heroImageMime: true, heroImageAlt: true, heroImageSource: true, title: true },
  });
  if (!draft) return [];
  let images = await prisma.draftImage.findMany({
    where: { draftId },
    orderBy: { createdAt: "desc" },
    select: { id: true, source: true, createdAt: true },
  });
  // Backfill: an older draft has a hero image but no gallery rows yet.
  if (images.length === 0 && (draft.heroImageData || draft.heroImageUrl)) {
    const { imageId } = await storeHeroImage(draftId, {
      url: draft.heroImageUrl,
      base64: draft.heroImageData,
      mime: draft.heroImageMime,
      alt: draft.heroImageAlt || draft.title,
      source: draft.heroImageSource || "ai",
    });
    images = [{ id: imageId, source: draft.heroImageSource || "ai", createdAt: new Date() }];
  }
  const selectedId = (await prisma.draft.findUnique({ where: { id: draftId }, select: { selectedImageId: true } }))?.selectedImageId;
  return images.map((i) => ({
    id: i.id,
    source: i.source,
    selected: i.id === selectedId,
    createdAt: i.createdAt.toISOString(),
  }));
}

/** Make a gallery image the selected hero (mirrors it into the scalar fields). */
export async function selectDraftImage(
  draftId: string,
  imageId: string,
): Promise<{ hasImage: boolean; source: string }> {
  requireDb();
  const img = await prisma.draftImage.findFirst({ where: { id: imageId, draftId } });
  if (!img) throw new Error("Image not found");
  await prisma.draft.update({
    where: { id: draftId },
    data: {
      heroImageUrl: img.url,
      heroImageData: img.data,
      heroImageMime: img.mime,
      heroImageAlt: img.alt,
      heroImageSource: img.source,
      selectedImageId: img.id,
    },
  });
  return { hasImage: true, source: img.source };
}

/**
 * Store an operator-uploaded hero image on the draft (base64). Used by the
 * review page's "Upload your own" — always wins over AI/stock until changed.
 */
export async function setUploadedHeroImage(
  draftId: string,
  base64: string,
  mime: string,
  alt?: string,
): Promise<{ hasImage: boolean; source: string }> {
  requireDb();
  if (!/^image\//i.test(mime)) throw new Error("Unsupported file — please upload an image (JPG, PNG, WebP).");
  // base64 length ≈ 4/3 of byte size; cap ~10MB of actual bytes.
  if (base64.length > 14_000_000) throw new Error("Image too large — keep it under ~10MB.");
  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    select: { title: true, heroImageAlt: true },
  });
  if (!draft) throw new Error(`Draft ${draftId} not found`);
  await storeHeroImage(draftId, {
    base64,
    mime,
    url: null,
    source: "upload",
    alt: alt || draft.heroImageAlt || draft.title,
  });
  return { hasImage: true, source: "upload" };
}

/**
 * Make sure a draft has a hero image, storing it on the draft so the review page
 * can show and swap it. `prefer` ("ai" | "stock") + `force` drive the review
 * page's "generate a new image" / "use a stock photo" buttons. AI images add
 * their cost to the per-blog tracker. Returns a small status for the UI.
 */
export async function ensureHeroImage(
  draftId: string,
  opts?: { prefer?: "ai" | "stock"; force?: boolean; aiOnly?: boolean },
): Promise<{ hasImage: boolean; source: string | null; alt: string }> {
  requireDb();
  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    include: { brief: true, business: true },
  });
  if (!draft) throw new Error(`Draft ${draftId} not found`);

  if (!opts?.force && (draft.heroImageData || draft.heroImageUrl)) {
    return { hasImage: true, source: draft.heroImageSource, alt: draft.heroImageAlt ?? "" };
  }

  const platform = draft.business.cmsPlatform.toLowerCase() as CmsPlatform;
  const productImage = await productImageLookup(draft.businessId, platform);
  const steer = await buildImageSteer(draft.businessId);
  const req = {
    title: draft.title,
    keyword: draft.brief.targetKeyword,
    productImage,
    steer,
    // Avoid handing back the same stock photo when regenerating a stock image.
    excludeStockUrl: draft.heroImageUrl ?? undefined,
  };
  // Strict AI ("generate new" from the UI) lets errors propagate so the user
  // sees the real reason; the auto path swallows and falls back to stock.
  const hero = opts?.aiOnly
    ? await sourceHeroImage(req, { prefer: "ai", aiOnly: true })
    : await sourceHeroImage(req, { prefer: opts?.prefer }).catch(() => null);
  if (!hero) return { hasImage: false, source: null, alt: "" };

  await storeHeroImage(draftId, {
    url: hero.url,
    base64: hero.base64,
    mime: hero.mime,
    alt: hero.alt,
    source: hero.source,
  });
  if (hero.source === "ai") {
    await prisma.draft
      .update({ where: { id: draftId }, data: { costCents: { increment: GEMINI_IMAGE_CENTS } } })
      .catch(() => {});
  }
  return { hasImage: true, source: hero.source, alt: hero.alt };
}

/**
 * Take a finalized draft LIVE: insert surgical internal links (against the
 * current set of published pages), source a hero image, push to the CMS, then
 * record the link graph (forward + backward). Uses the business's CMS connector
 * when configured; otherwise records a local page URL. `publishState` "published"
 * goes live immediately (the calendar default); "draft" lands as a hidden CMS
 * draft for manual review.
 */
export async function publishNow(
  draftId: string,
  publishState: "published" | "draft" = "published",
): Promise<{ url: string; adminUrl: string | null }> {
  requireDb();

  // Internal links go into the body BEFORE it hits the CMS.
  const planned = await applyForwardLinks(draftId);

  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    include: { business: true, brief: true },
  });
  if (!draft) throw new Error(`Draft ${draftId} not found`);

  const slug = slugify(draft.title);
  const platform = draft.business.cmsPlatform.toLowerCase() as CmsPlatform;
  const contentType = draft.brief.contentType;

  let cmsId: string | null = null;
  let url = `/blogs/guides/${slug}`;
  let adminUrl: string | null = null;

  const connector = await prisma.connector.findUnique({
    where: { businessId_type: { businessId: draft.businessId, type: cmsConnectorType(platform) } },
  });

  if (connector && connector.status === "CONNECTED" && encryptionEnabled()) {
    try {
      const config = decryptJson(connector.configEnc);
      const adapter = getCmsAdapter(platform, config);
      // Use the hero image chosen on the review page; generate/source one now if
      // the draft doesn't have one yet (headless/auto-publish path).
      if (!draft.heroImageData && !draft.heroImageUrl) {
        await ensureHeroImage(draft.id).catch((e) =>
          console.error("[publish] hero image failed:", e instanceof Error ? e.message : e),
        );
      }
      const heroRow = await prisma.draft.findUnique({
        where: { id: draft.id },
        select: { heroImageUrl: true, heroImageData: true, heroImageAlt: true },
      });

      // Guarantee no dead link ships: validate every link against the live site
      // (and in-page anchors against the rendered headings). Anything that
      // doesn't resolve is unlinked — the words stay, the broken href goes.
      let html = markdownToHtml(draft.bodyMd);
      const siteBase = siteBaseFromConfig(platform, config as Record<string, unknown>);
      if (siteBase) {
        try {
          const { html: safe, report } = await sanitizeLinks(html, { siteBase });
          html = safe;
          if (report.unlinked.length) {
            console.warn(
              `[publish] ${draft.id}: unlinked ${report.unlinked.length} dead link(s):`,
              report.unlinked,
            );
          }
        } catch (e) {
          console.error("[publish] link sanitize failed, publishing unsanitized:", e);
        }
      }
      // Shopify shows inline <script> as visible text — strip schema/scripts from
      // the body (SEO comes from metafields + the theme's own schema).
      html = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/(\s*\n){3,}/g, "\n\n").trim();

      // BUFFER: final gate. If the rendered HTML still has garbage, or the SEO
      // title/meta description is missing or malformed, refuse to publish.
      const metaDescription = deriveMetaDescription(draft.bodyMd, draft.title);
      const seoTitle = deriveSeoTitle(draft.title);
      const issues = [
        ...preflightPublish(html).issues,
        ...metaIssues(seoTitle, metaDescription),
      ];
      if (issues.length) {
        throw new Error(`Pre-publish check failed — not published: ${issues.join("; ")}`);
      }

      // Re-publish (e.g. a refreshed post) UPDATES the existing article in place
      // — no duplicate; a first publish creates it.
      const existingPage = await prisma.page.findUnique({
        where: { draftId: draft.id },
        select: { cmsId: true },
      });
      const publishInput = {
        title: draft.title,
        html,
        slug,
        metaDescription,
        seoTitle,
        heroImageUrl: heroRow?.heroImageUrl ?? undefined,
        heroImageBase64: heroRow?.heroImageData ?? undefined,
        heroImageAlt: heroRow?.heroImageAlt ?? undefined,
        publishState,
      };
      const res = existingPage?.cmsId
        ? await adapter.update(existingPage.cmsId, publishInput)
        : await adapter.publish(publishInput);
      cmsId = res.cmsId;
      url = res.url;
      // Shopify now hosts the image — drop the base64 blob to reclaim DB space.
      if (heroRow?.heroImageData) {
        await prisma.draft
          .update({ where: { id: draft.id }, data: { heroImageData: null } })
          .catch(() => {});
      }
      // Shopify admin editor URL — where a hidden draft can be reviewed/previewed.
      const storeDomain = (config as Record<string, unknown>).storeDomain;
      if (platform === "shopify" && typeof storeDomain === "string" && cmsId) {
        const handle = storeDomain.replace(/^https?:\/\//, "").replace(/\.myshopify\.com$/, "");
        adminUrl = `https://admin.shopify.com/store/${handle}/content/articles/${cmsId}`;
      }
    } catch {
      cmsId = null;
      url = `/blogs/guides/${slug}`;
    }
  }

  const page = await prisma.page.upsert({
    where: { draftId: draft.id },
    create: {
      businessId: draft.businessId,
      draftId: draft.id,
      url,
      cmsId,
      contentType,
      publishedAt: new Date(),
    },
    update: { url, cmsId, publishedAt: new Date() },
  });

  await prisma.draft.update({ where: { id: draft.id }, data: { status: "PUBLISHED" } });

  // Record the link graph + add a backward link from the top target to this page.
  await recordLinks(draft.id, planned);
  return { url: page.url, adminUrl };
}

/** Public site base URL (for internal-link verification) from a connector config. */
function siteBaseFromConfig(platform: CmsPlatform, config: Record<string, unknown>): string | null {
  if (platform === "shopify" && typeof config.storeDomain === "string") {
    return `https://${config.storeDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  }
  if (platform === "wordpress" && typeof config.baseUrl === "string") {
    return config.baseUrl.replace(/\/+$/, "");
  }
  return null;
}

function cmsConnectorType(platform: CmsPlatform): "SHOPIFY" | "WORDPRESS" | "WEBFLOW" {
  switch (platform) {
    case "shopify":
      return "SHOPIFY";
    case "wordpress":
      return "WORDPRESS";
    case "webflow":
      return "WEBFLOW";
    default:
      return "SHOPIFY";
  }
}

// ─────────────────────────────────────────────────────────────
// Internal linking (stage 8)
// ─────────────────────────────────────────────────────────────

/** Real published pages for a business, as candidate link targets. */
async function linkTargets(businessId: string, excludeDraftId: string): Promise<LinkTarget[]> {
  const pages = await prisma.page.findMany({
    where: { businessId, publishedAt: { not: null }, draftId: { not: excludeDraftId } },
    include: { draft: { include: { brief: true } } },
  });
  return pages.map((p) => ({
    pageId: p.id,
    url: p.url,
    title: p.draft?.title ?? p.url,
    keyword: p.draft?.brief?.targetKeyword,
  }));
}

/** Insert forward links (this draft → existing pages) into the draft body. */
async function applyForwardLinks(draftId: string): Promise<PlannedLink[]> {
  const draft = await prisma.draft.findUnique({ where: { id: draftId }, include: { business: true } });
  if (!draft) return [];
  const targets = await linkTargets(draft.businessId, draftId);
  if (targets.length === 0) return [];

  const planned = await planLinks(draft.bodyMd, targets, draft.business.linksPerPage);
  if (planned.length === 0) return [];

  const linked = applyLinks(draft.bodyMd, planned);
  await prisma.draft.update({ where: { id: draftId }, data: { bodyMd: linked } });
  return planned;
}

/** Record the forward link graph and add a backward link from the top target. */
async function recordLinks(draftId: string, planned: PlannedLink[]): Promise<void> {
  if (planned.length === 0) return;
  const page = await prisma.page.findUnique({ where: { draftId } });
  if (!page) return;

  for (const l of planned) {
    await prisma.linkEdge.upsert({
      where: { fromId_toId: { fromId: page.id, toId: l.targetPageId } },
      create: { businessId: page.businessId, fromId: page.id, toId: l.targetPageId },
      update: {},
    });
  }

  // Backward link: inject a link to THIS page into the single most-relevant target.
  await addBackwardLink(planned[0].targetPageId, page.id, draftId);
}

async function addBackwardLink(
  targetPageId: string,
  newPageId: string,
  newDraftId: string,
): Promise<void> {
  const target = await prisma.page.findUnique({
    where: { id: targetPageId },
    include: { draft: true },
  });
  const newDraft = await prisma.draft.findUnique({ where: { id: newDraftId } });
  const newPage = await prisma.page.findUnique({ where: { id: newPageId } });
  if (!newDraft || !newPage) return;

  // Always record the reverse edge.
  await prisma.linkEdge.upsert({
    where: { fromId_toId: { fromId: targetPageId, toId: newPageId } },
    create: { businessId: newPage.businessId, fromId: targetPageId, toId: newPageId },
    update: {},
  });

  if (!target?.draft) return;

  // Find a natural anchor in the target's body for the new page, then inject it.
  const planned = await planLinks(
    target.draft.bodyMd,
    [{ pageId: newPageId, url: newPage.url, title: newDraft.title }],
    1,
  );
  if (planned.length === 0) return;

  const updatedBody = applyLinks(target.draft.bodyMd, planned);
  await prisma.draft.update({ where: { id: target.draft.id }, data: { bodyMd: updatedBody } });

  // Reflect the change on the live CMS article, if connected.
  if (target.cmsId) {
    await updateCmsBody(target.businessId, target.cmsId, updatedBody).catch(() => {});
  }
}

/** Push an updated body to an already-published CMS article. Best-effort. */
async function updateCmsBody(businessId: string, cmsId: string, html: string): Promise<void> {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) return;
  const platform = business.cmsPlatform.toLowerCase() as CmsPlatform;
  const connector = await prisma.connector.findUnique({
    where: { businessId_type: { businessId, type: cmsConnectorType(platform) } },
  });
  if (!connector || connector.status !== "CONNECTED" || !encryptionEnabled()) return;
  const config = decryptJson(connector.configEnc);
  const adapter = getCmsAdapter(platform, config);
  await adapter.update(cmsId, { html });
}
