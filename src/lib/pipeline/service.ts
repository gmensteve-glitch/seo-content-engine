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
import { sourceHeroImage } from "@/lib/media/imager";
import { weakestDimensions, MAX_REVISION_LOOPS } from "@/lib/grader/rubric";
import { getCmsAdapter, type CmsPlatform } from "@/lib/cms";
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

  const ctx: IdeationContext = {
    businessName: business.name,
    profileMd: business.profileMd ?? business.name,
    brandVoice: business.brandVoice ?? undefined,
    pillars: pillarNames,
    existingTitles,
    performanceNote,
    count,
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

  // Write.
  await prisma.draft.update({ where: { id: draft.id }, data: { status: "DRAFTED" } });
  const body = await writeDraft(spec, brandVoice);
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
    currentDraft = await reviseDraft(currentDraft, grade.feedback, weakest);
  }

  const passed = bestOverall >= threshold;

  // A passed draft is finalized and parked in the "ready to schedule" queue.
  // Internal linking, imaging, and the CMS publish all happen at scheduled
  // go-live time (publishNow) — the content calendar controls when it's live.
  return { draftId: draft.id, passed, overall: bestOverall, loops: loop, pageUrl: undefined };
}

// ─────────────────────────────────────────────────────────────
// Human polish lane — add real E-E-A-T to a near-miss, then re-grade
// ─────────────────────────────────────────────────────────────

/** Save human edits to a draft body (the polish step). */
export async function updateDraftBody(draftId: string, bodyMd: string): Promise<void> {
  requireDb();
  await prisma.draft.update({ where: { id: draftId }, data: { bodyMd } });
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

/** Put a passed draft on the calendar for auto-publish at `when`. */
export async function scheduleDraft(draftId: string, when: Date): Promise<void> {
  requireDb();
  await prisma.draft.update({
    where: { id: draftId },
    data: { scheduledFor: when, status: "PASSED" },
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
): Promise<string> {
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
      const res = await adapter.publish({
        title: draft.title,
        html: draft.bodyMd,
        slug,
        metaDescription: draft.title,
        heroImageUrl: hero?.url,
        heroImageAlt: hero?.alt,
        publishState,
      });
      cmsId = res.cmsId;
      url = res.url;
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
  return page.url;
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
