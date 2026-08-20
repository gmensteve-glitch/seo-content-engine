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
import { serpTop } from "@/lib/connectors/dataforseo";
import { scrapeMany } from "@/lib/connectors/firecrawl";
import { dataforseoEnabled, firecrawlEnabled } from "@/lib/env";
import { sourceHeroImage } from "@/lib/media/imager";
import { weakestDimensions, MAX_REVISION_LOOPS } from "@/lib/grader/rubric";
import { getCmsAdapter, type CmsPlatform } from "@/lib/cms";
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
async function buildPerformanceNote(businessId: string, pillars: string[]): Promise<string> {
  const pages = await prisma.page.findMany({
    where: { businessId, publishedAt: { not: null } },
    include: {
      draft: { include: { brief: { include: { idea: { include: { pillar: true } } } } } },
      perf: { orderBy: { date: "desc" }, take: 1 },
    },
  });

  if (pages.length === 0) {
    return "No content published yet — prioritize breadth: seed each pillar with a strong cornerstone piece.";
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

  return `Live-content coverage by pillar (fewest first — favor the thin ones): ${coverage}.${rankNote}`;
}

/**
 * Generate `count` fresh ideas for a business and insert the non-duplicate ones
 * as PROPOSED. Returns the number actually added. This is the top of the funnel;
 * the human still gates each idea → brief → approval downstream.
 */
export async function generateIdeas(businessId: string, count = 6): Promise<number> {
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

  const performanceNote = await buildPerformanceNote(businessId, pillarNames);

  // Split the batch by the business's local/evergreen target ratio.
  const targetLocal = Math.round((count * (business.localRatio ?? 50)) / 100);
  const ctx: IdeationContext = {
    businessName: business.name,
    profileMd: business.profileMd ?? business.name,
    brandVoice: business.brandVoice ?? undefined,
    pillars: pillarNames,
    existingTitles,
    performanceNote,
    count,
    targetLocal,
    targetEvergreen: count - targetLocal,
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
 * The feedback-loop tick: keep the idea pool full. If a business has fewer than
 * `floor` PROPOSED ideas, top it back up. Called on a cadence by the scheduler
 * so there is always fresh, vetted supply entering the pipeline.
 */
export async function replenishIdeas(businessId: string, floor = 6): Promise<number> {
  requireDb();
  const proposed = await prisma.idea.count({
    where: { businessId, status: "PROPOSED" },
  });
  if (proposed >= floor) return 0;
  return generateIdeas(businessId, floor - proposed);
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
// Auto-advance — "pump out ready-to-publish" with no manual gates.
// Drives idea → brief → approve automatically. Writing/grading is already
// automatic downstream, so finished pieces land in the Ready list on their own.
// ─────────────────────────────────────────────────────────────

// Keep up to this many finished pieces waiting in Ready. Because publishing is
// manual, this SELF-THROTTLES: once Ready is full the loop idles and refills
// only as you publish or reject — no flooding, no runaway cost.
const READY_TARGET = 5;
// New pieces to kick off per business per tick (a gentle drip).
const AUTO_ADVANCE_PER_TICK = 1;
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

/** Auto-advance one business toward the Ready-backlog target. Returns how many
 *  new pieces it started this tick. */
export async function autoAdvanceBusiness(businessId: string): Promise<number> {
  requireDb();

  const [readyCount, inflightCount] = await Promise.all([
    prisma.draft.count({
      where: { businessId, status: "PASSED", scheduledFor: null, rejectedAt: null },
    }),
    prisma.draft.count({ where: { businessId, status: { in: [...INFLIGHT_STATUSES] } } }),
  ]);
  let budget = Math.min(AUTO_ADVANCE_PER_TICK, READY_TARGET - readyCount - inflightCount);
  if (budget <= 0) return 0;

  let started = 0;

  // 1) Approve any structurally-complete briefs already waiting.
  const pending = await prisma.brief.findMany({
    where: { businessId, status: "PENDING_APPROVAL" },
    orderBy: { createdAt: "asc" },
    take: budget,
  });
  for (const b of pending) {
    if (budget <= 0) break;
    if (!isBriefReady(b)) continue;
    try {
      await approveBrief(b.id);
      started++;
      budget--;
    } catch (e) {
      console.error("[auto-advance] approve failed:", e instanceof Error ? e.message : e);
    }
  }

  // 2) If budget remains, turn top proposed ideas into briefs and approve them,
  //    preferring the kind (LOCAL/EVERGREEN) that's currently under its target
  //    share so the live mix tracks the business's localRatio.
  if (budget > 0) {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { localRatio: true },
    });
    const activeDrafts = await prisma.draft.findMany({
      where: {
        businessId,
        OR: [
          { status: "PASSED", scheduledFor: null, rejectedAt: null },
          { status: { in: [...INFLIGHT_STATUSES] } },
        ],
      },
      select: { brief: { select: { idea: { select: { kind: true } } } } },
    });
    const localCount = activeDrafts.filter((d) => d.brief?.idea?.kind === "LOCAL").length;
    const localPct = activeDrafts.length ? (localCount / activeDrafts.length) * 100 : 0;
    const preferLocal = localPct < (business?.localRatio ?? 50);

    const ideas = await prisma.idea.findMany({
      where: { businessId, status: "PROPOSED" },
      orderBy: { createdAt: "asc" },
      take: budget * 4, // headroom to skip near-duplicates + pick the right kind
    });
    ideas.sort((a, b) => {
      const aPref = (a.kind === "LOCAL") === preferLocal ? 0 : 1;
      const bPref = (b.kind === "LOCAL") === preferLocal ? 0 : 1;
      return aPref - bPref;
    });
    for (const idea of ideas) {
      if (budget <= 0) break;
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
  // no mechanical defect is ever graded or shipped.
  await prisma.draft.update({ where: { id: draft.id }, data: { status: "DRAFTED" } });
  const rawBody = await writeDraft(spec, brandVoice);
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
 * Auto-improve a near-miss to its ceiling with NO human involvement: one data
 * boost, then up to 2 keep-best writer revise+regrade passes. Stops early once
 * it passes or stops improving. This is what turns a 65 into the best score the
 * piece can reach on its own.
 */
export async function autoImproveDraft(draftId: string): Promise<void> {
  requireDb();
  const boost = await boostDraft(draftId).catch((e) => {
    console.error(`[auto-improve] boost failed for ${draftId}:`, e instanceof Error ? e.message : e);
    return null;
  });
  if (boost?.passed) return;

  for (let pass = 0; pass < 2; pass++) {
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
        await autoImproveDraft(d.id);
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
  const html = markdownToHtml(draft.bodyMd)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/(\s*\n){3,}/g, "\n\n")
    .trim();
  const seoTitle = draft.title;
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
      // Source a tasteful hero image + alt (Unsplash, or a store product photo).
      const hero = await sourceHeroImage({
        title: draft.title,
        keyword: draft.brief.targetKeyword,
        productImage: adapter.sourceProductImage?.bind(adapter),
      }).catch(() => null);

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
      const issues = [
        ...preflightPublish(html).issues,
        ...metaIssues(draft.title, metaDescription),
      ];
      if (issues.length) {
        throw new Error(`Pre-publish check failed — not published: ${issues.join("; ")}`);
      }

      const res = await adapter.publish({
        title: draft.title,
        html,
        slug,
        metaDescription,
        seoTitle: draft.title,
        heroImageUrl: hero?.url,
        heroImageAlt: hero?.alt,
        publishState,
      });
      cmsId = res.cmsId;
      url = res.url;
      // Shopify admin editor URL — where a hidden draft can be reviewed/previewed.
      const storeDomain = (config as Record<string, unknown>).storeDomain;
      if (platform === "shopify" && typeof storeDomain === "string" && cmsId) {
        const handle = storeDomain.replace(/^https?:\/\//, "").replace(/\.myshopify\.com$/, "");
        adminUrl = `https://admin.shopify.com/store/${handle}/articles/${cmsId}`;
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
