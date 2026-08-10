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
import { buildBrief, type BriefSpec } from "@/lib/agents/research";
import { writeDraft, reviseDraft } from "@/lib/agents/writer";
import { gradeDraft } from "@/lib/agents/grader";
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

/** Approve a brief → create the Draft and dispatch the writer/grader pipeline. */
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

  // Durable path in production (Inngest), synchronous fallback offline/dev.
  if (inngestEnabled()) {
    await inngest.send({ name: "content/brief.approved", data: { briefId } });
  } else {
    await runPipelineForBrief(briefId);
  }
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

  // Grade → revise → re-grade, persisting each pass immediately so partial
  // progress survives (and the dashboard updates live) even if the run is long.
  const briefContext = JSON.stringify(spec);
  let currentDraft = body;
  let loop = 0;
  let passed = false;
  let overall = 0;

  for (loop = 1; loop <= MAX_REVISION_LOOPS; loop++) {
    const grade = await gradeDraft(currentDraft, briefContext, threshold);
    passed = grade.passed;
    overall = grade.overall;

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
    await prisma.draft.update({
      where: { id: draft.id },
      data: {
        bodyMd: currentDraft,
        version: loop,
        status: passed ? "PASSED" : loop === MAX_REVISION_LOOPS ? "FAILED" : "REVISING",
      },
    });

    if (passed || loop === MAX_REVISION_LOOPS) break;

    // Revise the weakest dimensions, then loop back to re-grade.
    const weakest = weakestDimensions(grade.dimensions).slice(0, 3);
    currentDraft = await reviseDraft(currentDraft, grade.feedback, weakest);
    await prisma.draft.update({
      where: { id: draft.id },
      data: { bodyMd: currentDraft, status: "GRADING" },
    });
  }

  let pageUrl: string | undefined;
  if (passed) {
    pageUrl = await publishDraft(draft.id);
  }

  return { draftId: draft.id, passed, overall, loops: loop, pageUrl };
}

/**
 * Publish a PASSED draft. Uses the business's CMS connector when one is
 * configured and decryptable; otherwise records a local page URL so the
 * pipeline still completes offline.
 */
export async function publishDraft(draftId: string): Promise<string> {
  requireDb();
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

  // Only attempt a real publish when we can actually decrypt the connector config.
  if (connector && connector.status === "CONNECTED" && encryptionEnabled()) {
    try {
      const config = decryptJson(connector.configEnc);
      const adapter = getCmsAdapter(platform, config);
      const res = await adapter.publish({
        title: draft.title,
        html: draft.bodyMd,
        slug,
        metaDescription: draft.title,
        publishState: "published",
      });
      cmsId = res.cmsId;
      url = res.url;
    } catch {
      // Fall back to a local page record; leave a note in the URL scheme.
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
