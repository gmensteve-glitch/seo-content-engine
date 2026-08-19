// Repository layer — the ONLY thing the UI calls for data.
//
// Backed by Prisma when DATABASE_URL is set; otherwise it falls back to the
// seeded mock so `npm run dev` works with zero setup. Either way the return
// shapes (and the whole UI) are identical.

import { prisma, hasDatabase } from "@/lib/db";
import { RUBRIC } from "@/lib/grader/rubric";
import type {
  BusinessSummary,
  Kpis,
  PipelineCard,
  IdeaVM,
  BriefVM,
  ScorecardVM,
  LivePageVM,
  ConnectorVM,
  CmsPlatform,
  ReadyDraftVM,
  ScheduledItemVM,
  CalendarEntryVM,
  PolishDraftVM,
} from "@/lib/data/types";
import {
  BUSINESSES,
  KPIS,
  PIPELINE,
  IDEAS,
  BRIEFS,
  SCORECARDS,
  LIVE_PAGES,
  CONNECTORS,
} from "@/lib/mock/seed";

const DEFAULT_BIZ = "trustedcaskets";

// ─────────────────────────────────────────────────────────────
// Businesses
// ─────────────────────────────────────────────────────────────

/** 2-letter badge from a name: "Trusted Caskets" → "TC". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const letters = parts.map((p) => p[0]).join("");
  return (letters.slice(0, 2) || name.slice(0, 2)).toUpperCase();
}

function toBusinessSummary(b: {
  id: string;
  name: string;
  domain: string;
  cmsPlatform: string;
  status: string;
}): BusinessSummary {
  return {
    id: b.id,
    name: b.name,
    short: initials(b.name),
    domain: b.domain,
    cms: b.cmsPlatform.toLowerCase() as CmsPlatform,
    status: b.status.toLowerCase() as BusinessSummary["status"],
  };
}

export async function getBusinesses(): Promise<BusinessSummary[]> {
  if (!hasDatabase) return BUSINESSES;
  const rows = await prisma.business.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map(toBusinessSummary);
}

export async function getBusiness(id?: string): Promise<BusinessSummary> {
  if (!hasDatabase) return BUSINESSES.find((b) => b.id === id) ?? BUSINESSES[0];
  const row = id
    ? await prisma.business.findUnique({ where: { id } })
    : await prisma.business.findFirst({ orderBy: { createdAt: "asc" } });
  const chosen =
    row ?? (await prisma.business.findFirst({ orderBy: { createdAt: "asc" } }));
  // Fall back to mock if the DB has no businesses at all.
  return chosen ? toBusinessSummary(chosen) : BUSINESSES[0];
}

// ─────────────────────────────────────────────────────────────
// KPIs (overview)
// ─────────────────────────────────────────────────────────────

export async function getKpis(bizId = DEFAULT_BIZ): Promise<Kpis> {
  if (!hasDatabase) return KPIS[bizId] ?? KPIS[DEFAULT_BIZ];

  const business = await prisma.business.findUnique({ where: { id: bizId } });

  const pages = await prisma.page.findMany({
    where: { businessId: bizId, publishedAt: { not: null } },
    include: { perf: { orderBy: { date: "desc" }, take: 1 } },
  });

  const livePages = pages.length;
  const indexed = pages.filter((p) => p.perf.length > 0).length;
  const clicks28d = pages.reduce((s, p) => s + (p.perf[0]?.clicks ?? 0), 0);
  const impressions28d = pages.reduce((s, p) => s + (p.perf[0]?.impressions ?? 0), 0);

  // Average quality = mean of the latest grade per graded draft.
  const grades = await prisma.grade.findMany({
    where: { draft: { businessId: bizId } },
    orderBy: { createdAt: "desc" },
  });
  const latestByDraft = new Map<string, number>();
  for (const g of grades) if (!latestByDraft.has(g.draftId)) latestByDraft.set(g.draftId, g.overall);
  const scores = [...latestByDraft.values()];
  const avgQuality = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;

  return {
    livePages,
    indexed,
    clicks28d,
    impressions28d,
    avgQuality,
    autopilot: business?.status === "ACTIVE",
  };
}

// ─────────────────────────────────────────────────────────────
// Pipeline board
// ─────────────────────────────────────────────────────────────

/** Derive a live-page signal from its latest performance row. The returned
 *  subset is valid for both LivePageVM.flag and PipelineCard.flag. */
function pageFlag(
  perf?: { position: number | null; ctr: number },
): "boost" | "rewrite" | "healthy" {
  if (!perf) return "healthy";
  if (perf.position != null && perf.position >= 11 && perf.position <= 20) return "boost";
  if (perf.ctr < 1) return "rewrite";
  return "healthy";
}

const IN_PROGRESS_STATUSES = ["RESEARCHING", "DRAFTED", "GRADING", "REVISING"] as const;

export async function getPipeline(bizId = DEFAULT_BIZ): Promise<PipelineCard[]> {
  if (!hasDatabase) return PIPELINE[bizId] ?? [];

  const cards: PipelineCard[] = [];

  // Ideas — top 3 proposed by score.
  const ideas = await prisma.idea.findMany({
    where: { businessId: bizId, status: "PROPOSED" },
    orderBy: { score: "desc" },
    take: 3,
  });
  for (const i of ideas) {
    cards.push({ id: i.id, title: i.title, stage: "ideas", score: i.score ?? undefined });
  }

  // Briefs — pending approval.
  const briefs = await prisma.brief.findMany({
    where: { businessId: bizId, status: "PENDING_APPROVAL" },
    include: { idea: true },
  });
  for (const b of briefs) {
    const type = b.contentType.toLowerCase() as PipelineCard["contentType"];
    cards.push({
      id: b.id,
      title: b.idea.title,
      stage: "briefs",
      contentType: type,
      meta: b.contentType === "GEO" ? "geo · vetted" : type,
    });
  }

  // In progress — drafts still being researched/written/graded.
  const inProgress = await prisma.draft.findMany({
    where: { businessId: bizId, status: { in: [...IN_PROGRESS_STATUSES] } },
    include: { grades: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  for (const d of inProgress) {
    const researching = d.status === "RESEARCHING";
    cards.push({
      id: d.id,
      title: d.title,
      stage: "in_progress",
      flag: researching ? "researching" : "grading",
      score: d.grades[0]?.overall,
      meta: researching ? "researching" : undefined,
    });
  }

  // Review — near-miss drafts (FAILED) that need a human experience pass.
  const failed = await prisma.draft.findMany({
    where: { businessId: bizId, status: "FAILED" },
    include: { grades: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { updatedAt: "desc" },
  });
  for (const d of failed) {
    cards.push({
      id: d.id,
      title: d.title,
      stage: "review",
      score: d.grades[0]?.overall,
      meta: "add experience",
    });
  }

  // Scheduled — passed drafts awaiting publish.
  const scheduled = await prisma.draft.findMany({
    where: { businessId: bizId, status: "PASSED" },
    orderBy: { createdAt: "asc" },
  });
  for (const d of scheduled) {
    cards.push({ id: d.id, title: d.title, stage: "scheduled", meta: "ready" });
  }

  // Live — published pages.
  const pages = await prisma.page.findMany({
    where: { businessId: bizId, publishedAt: { not: null } },
    include: { draft: true, perf: { orderBy: { date: "desc" }, take: 1 } },
    orderBy: { publishedAt: "desc" },
  });
  for (const p of pages) {
    const perf = p.perf[0];
    const flag = pageFlag(perf);
    const meta = perf
      ? flag === "rewrite"
        ? "low CTR"
        : `position ${perf.position}`
      : undefined;
    cards.push({
      id: p.id,
      title: p.draft?.title ?? p.url,
      stage: "live",
      flag,
      meta,
    });
  }

  return cards;
}

// ─────────────────────────────────────────────────────────────
// Ideas box
// ─────────────────────────────────────────────────────────────

export async function getIdeas(bizId = DEFAULT_BIZ): Promise<IdeaVM[]> {
  if (!hasDatabase) return IDEAS[bizId] ?? [];
  const ideas = await prisma.idea.findMany({
    where: { businessId: bizId, status: "PROPOSED" },
    orderBy: { score: "desc" },
    include: { pillar: true },
  });
  return ideas.map((i) => ({
    id: i.id,
    title: i.title,
    score: i.score ?? 0,
    pillar: i.pillar?.name ?? "—",
    rationale: i.rationale ?? undefined,
  }));
}

// ─────────────────────────────────────────────────────────────
// Briefs awaiting approval
// ─────────────────────────────────────────────────────────────

export async function getPendingBriefs(bizId = DEFAULT_BIZ): Promise<BriefVM[]> {
  if (!hasDatabase) return BRIEFS[bizId] ?? [];
  const briefs = await prisma.brief.findMany({
    where: { businessId: bizId, status: "PENDING_APPROVAL" },
    include: { idea: true },
    orderBy: { createdAt: "asc" },
  });
  return briefs.map((b) => ({
    id: b.id,
    title: b.idea.title,
    targetKeyword: b.targetKeyword,
    contentType: b.contentType.toLowerCase() as BriefVM["contentType"],
    angle: b.angle ?? "",
    wordTarget: b.wordTarget ?? 0,
    questions: Array.isArray(b.questions) ? (b.questions as string[]) : [],
    requiredSchema: b.requiredSchema,
  }));
}

// ─────────────────────────────────────────────────────────────
// Latest scorecard (quality)
// ─────────────────────────────────────────────────────────────

type StoredDimension = { score: number; max?: number; note?: string };

export async function getLatestScorecard(bizId = DEFAULT_BIZ): Promise<ScorecardVM> {
  if (!hasDatabase) return SCORECARDS[bizId] ?? SCORECARDS[DEFAULT_BIZ];

  const business = await prisma.business.findUnique({ where: { id: bizId } });
  const threshold = business?.qualityThreshold ?? 85;

  // Prefer the latest passing grade; fall back to the latest grade overall.
  const grade =
    (await prisma.grade.findFirst({
      where: { draft: { businessId: bizId }, passed: true },
      orderBy: { createdAt: "desc" },
      include: { draft: true },
    })) ??
    (await prisma.grade.findFirst({
      where: { draft: { businessId: bizId } },
      orderBy: { createdAt: "desc" },
      include: { draft: true },
    }));

  if (!grade) {
    return {
      draftTitle: "—",
      overall: 0,
      passed: false,
      threshold,
      loop: 0,
      dimensions: [],
      feedback: "No drafts yet — connect data and approve a brief to begin.",
    };
  }

  const stored = (grade.dimensions ?? {}) as Record<string, StoredDimension>;
  const dimensions = RUBRIC.filter((r) => stored[r.key]).map((r) => ({
    key: r.key,
    label: r.label,
    score: stored[r.key].score,
    max: stored[r.key].max ?? r.max,
    note: stored[r.key].note ?? "",
  }));

  return {
    draftTitle: grade.draft.title,
    overall: grade.overall,
    passed: grade.passed,
    threshold,
    loop: grade.version,
    dimensions,
    feedback: grade.feedback ?? "",
  };
}

// ─────────────────────────────────────────────────────────────
// Live pages (performance)
// ─────────────────────────────────────────────────────────────

export async function getLivePages(bizId = DEFAULT_BIZ): Promise<LivePageVM[]> {
  if (!hasDatabase) return LIVE_PAGES[bizId] ?? [];
  const pages = await prisma.page.findMany({
    where: { businessId: bizId, publishedAt: { not: null } },
    include: { draft: true, perf: { orderBy: { date: "desc" }, take: 1 } },
    orderBy: { publishedAt: "desc" },
  });
  return pages.map((p) => {
    const perf = p.perf[0];
    return {
      id: p.id,
      title: p.draft?.title ?? p.url,
      url: p.url,
      position: perf?.position ?? undefined,
      ctr: perf?.ctr ?? undefined,
      clicks28d: perf?.clicks ?? undefined,
      flag: pageFlag(perf),
    };
  });
}

// ─────────────────────────────────────────────────────────────
// Content calendar
// ─────────────────────────────────────────────────────────────

/** Latest grade for a draft, if any. */
function latestGrade(grades: { overall: number }[]): number {
  return grades[0]?.overall ?? 0;
}

/** The calendar's "ready to schedule" queue: reviewed pieces the operator moved
 *  out of Ready, now awaiting a date. (PASSED, no date yet, reviewed.) */
export async function getReadyToSchedule(bizId = DEFAULT_BIZ): Promise<ReadyDraftVM[]> {
  if (!hasDatabase) return [];
  const drafts = await prisma.draft.findMany({
    where: { businessId: bizId, status: "PASSED", scheduledFor: null, reviewedAt: { not: null } },
    include: {
      brief: true,
      grades: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
  });
  return drafts.map((d) => ({
    id: d.id,
    title: d.title,
    targetKeyword: d.brief.targetKeyword,
    overall: latestGrade(d.grades),
    wordTarget: d.brief.wordTarget ?? 0,
    createdAt: d.createdAt.toISOString(),
  }));
}

/** PASSED drafts that have a scheduledFor date — items placed on the calendar. */
export async function getScheduledDrafts(bizId = DEFAULT_BIZ): Promise<ScheduledItemVM[]> {
  if (!hasDatabase) return [];
  const now = new Date();
  const drafts = await prisma.draft.findMany({
    where: { businessId: bizId, status: "PASSED", scheduledFor: { not: null } },
    include: {
      brief: true,
      grades: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { scheduledFor: "asc" },
  });
  return drafts.map((d) => ({
    id: d.id,
    title: d.title,
    targetKeyword: d.brief.targetKeyword,
    overall: latestGrade(d.grades),
    scheduledFor: d.scheduledFor!.toISOString(),
    overdue: d.scheduledFor! <= now,
  }));
}

/** Extract the writer's "> **Add your experience:** ..." callouts from a body. */
function extractExperienceNotes(body: string): string[] {
  const out: string[] = [];
  const re = /^>\s*\*\*Add your experience:\*\*\s*(.+)$/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) out.push(m[1].trim());
  return out;
}

type PolishRow = {
  id: string;
  title: string;
  bodyMd: string;
  status: string;
  updatedAt: Date;
  brief: { targetKeyword: string };
  grades: { overall: number; feedback: string | null; dimensions: unknown; version: number }[];
};

/** Map a draft (+ its latest grade + brief) into the polish view-model. */
function toPolishVM(d: PolishRow, threshold: number): PolishDraftVM {
  const g = d.grades[0];
  const stored = (g?.dimensions ?? {}) as Record<string, StoredDimension>;
  const dimensions = RUBRIC.filter((r) => stored[r.key]).map((r) => ({
    key: r.key,
    label: r.label,
    score: stored[r.key].score,
    max: stored[r.key].max ?? r.max,
    note: stored[r.key].note ?? "",
  }));
  return {
    id: d.id,
    title: d.title,
    targetKeyword: d.brief.targetKeyword,
    overall: g?.overall ?? 0,
    threshold,
    status: d.status.toLowerCase() as PolishDraftVM["status"],
    bodyMd: d.bodyMd,
    feedback: g?.feedback ?? "",
    dimensions,
    loop: g?.version ?? 1,
    experienceNotes: extractExperienceNotes(d.bodyMd),
    updatedAt: d.updatedAt.toISOString(),
  };
}

/** Ready-to-review: PASSED pieces that have cleared the bar but haven't been
 *  reviewed+moved yet. They sit here with full scorecard + post for a final look
 *  before you move them to the calendar's ready-to-schedule queue. */
export async function getReadyForReview(bizId = DEFAULT_BIZ): Promise<PolishDraftVM[]> {
  if (!hasDatabase) return [];
  const business = await prisma.business.findUnique({ where: { id: bizId } });
  const threshold = business?.qualityThreshold ?? 85;
  const drafts = await prisma.draft.findMany({
    where: { businessId: bizId, status: "PASSED", scheduledFor: null, reviewedAt: null },
    include: { brief: true, grades: { orderBy: { version: "desc" }, take: 1 } },
    orderBy: { updatedAt: "desc" },
  });
  // Only genuinely-graded pieces — filters out any placeholder/seed rows that
  // were marked PASSED without a real grade (they'd show a 0/empty scorecard).
  return drafts.map((d) => toPolishVM(d, threshold)).filter((vm) => vm.overall >= vm.threshold);
}

/** Near-miss drafts (FAILED) that need a human E-E-A-T pass before they can pass. */
export async function getNeedsPolish(bizId = DEFAULT_BIZ): Promise<PolishDraftVM[]> {
  if (!hasDatabase) return [];
  const business = await prisma.business.findUnique({ where: { id: bizId } });
  const threshold = business?.qualityThreshold ?? 85;

  const drafts = await prisma.draft.findMany({
    where: { businessId: bizId, status: "FAILED" },
    include: { brief: true, grades: { orderBy: { version: "desc" }, take: 1 } },
    orderBy: { updatedAt: "desc" },
  });
  return drafts.map((d) => toPolishVM(d, threshold));
}

/** A single draft for the focused polish page. Returns null if not found. */
export async function getPolishDraft(draftId: string): Promise<PolishDraftVM | null> {
  if (!hasDatabase) return null;
  const d = await prisma.draft.findUnique({
    where: { id: draftId },
    include: { brief: true, business: true, grades: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!d) return null;
  return toPolishVM(d, d.business.qualityThreshold);
}

/** Merged month-grid feed: scheduled (future) + published (past) entries. */
export async function getCalendarEntries(bizId = DEFAULT_BIZ): Promise<CalendarEntryVM[]> {
  if (!hasDatabase) return [];
  const now = new Date();
  const hhmm = (d: Date) =>
    `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;

  const [scheduled, pages] = await Promise.all([
    prisma.draft.findMany({
      where: { businessId: bizId, status: "PASSED", scheduledFor: { not: null } },
      select: { id: true, title: true, scheduledFor: true },
    }),
    prisma.page.findMany({
      where: { businessId: bizId, publishedAt: { not: null } },
      include: { draft: { select: { title: true } } },
    }),
  ]);

  const entries: CalendarEntryVM[] = [];
  for (const d of scheduled) {
    const when = d.scheduledFor!;
    entries.push({
      id: d.id,
      title: d.title,
      date: when.toISOString(),
      time: hhmm(when),
      kind: when <= now ? "overdue" : "scheduled",
    });
  }
  for (const p of pages) {
    const when = p.publishedAt!;
    entries.push({
      id: p.id,
      title: p.draft?.title ?? p.url,
      date: when.toISOString(),
      time: hhmm(when),
      kind: "published",
      url: p.url,
    });
  }
  return entries;
}

// ─────────────────────────────────────────────────────────────
// Connectors
// ─────────────────────────────────────────────────────────────

/** Display roster for the Connectors page. Firecrawl is a global env key
 *  (not a per-business row), so its status is read from the environment. */
const CONNECTOR_ROSTER: {
  type: ConnectorVM["type"];
  label: string;
  detail: string;
  fromEnv?: string;
}[] = [
  { type: "GSC", label: "Google Search Console", detail: "position + click data" },
  { type: "DATAFORSEO", label: "DataForSEO", detail: "pay-as-you-go · keyword + SERP" },
  { type: "GA4", label: "Google Analytics 4", detail: "optional · conversions" },
  { type: "FIRECRAWL", label: "Firecrawl", detail: "competitor page extraction", fromEnv: "FIRECRAWL_API_KEY" },
  { type: "GOOGLE_MAPS", label: "Google Maps", detail: "needed for geo pages" },
  { type: "SHOPIFY", label: "Shopify (publish)", detail: "publishing target" },
];

export async function getConnectors(bizId = DEFAULT_BIZ): Promise<ConnectorVM[]> {
  if (!hasDatabase) return CONNECTORS[bizId] ?? [];

  const rows = await prisma.connector.findMany({ where: { businessId: bizId } });
  const byType = new Map(rows.map((r) => [r.type, r.status]));

  return CONNECTOR_ROSTER.map((c) => {
    let status: ConnectorVM["status"] = "disconnected";
    if (c.fromEnv) {
      status = process.env[c.fromEnv] ? "connected" : "disconnected";
    } else {
      const dbStatus = byType.get(c.type as never);
      if (dbStatus) status = dbStatus.toLowerCase() as ConnectorVM["status"];
    }
    return { type: c.type, label: c.label, status, detail: c.detail };
  });
}

/** Column definitions for the pipeline board. `tone` drives the color language:
 *  gray = raw, amber = needs YOU, blue = engine working / queued, green = done. */
export const PIPELINE_COLUMNS: {
  key: PipelineCard["stage"];
  label: string;
  tone: "neutral" | "warn" | "accent" | "success";
  /** Page this stage links to (its detail/action view). Omitted stages (the
   *  automatic "Writing & grading") have no dedicated page. */
  href?: string;
}[] = [
  { key: "ideas", label: "Ideas", tone: "neutral", href: "/ideas" },
  { key: "briefs", label: "Briefs · needs you", tone: "warn", href: "/briefs" },
  { key: "in_progress", label: "Writing & grading", tone: "accent" },
  { key: "review", label: "Review · needs you", tone: "warn", href: "/review" },
  { key: "scheduled", label: "Ready to publish", tone: "success", href: "/ready" },
  { key: "live", label: "Live", tone: "success", href: "/performance" },
];
