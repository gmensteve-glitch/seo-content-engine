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
  PipelineHealthVM,
  ScoreCalibrationVM,
  GoalDiagnosticsVM,
  CostSummaryVM,
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
  SeoOpportunitiesVM,
  MoversVM,
  GeoVisibilityVM,
  RecommendationVM,
  OnboardingStatusVM,
} from "@/lib/data/types";
import { fetchGscRows, strikingDistance, decayingPages } from "@/lib/connectors/gsc";
import { isConnectable } from "@/lib/connectors/connect-fields";
import { activeBizId } from "@/lib/active-business";
import { gscEnabled, geoEnabled } from "@/lib/env";
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
  localRatio?: number;
  qualityThreshold?: number;
}): BusinessSummary {
  return {
    id: b.id,
    name: b.name,
    short: initials(b.name),
    domain: b.domain,
    cms: b.cmsPlatform.toLowerCase() as CmsPlatform,
    status: b.status.toLowerCase() as BusinessSummary["status"],
    localRatio: b.localRatio ?? 50,
    qualityThreshold: b.qualityThreshold ?? 85,
  };
}

export async function getBusinesses(): Promise<BusinessSummary[]> {
  if (!hasDatabase) return BUSINESSES;
  const rows = await prisma.business.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map(toBusinessSummary);
}

const FALLBACK_PILLARS = [
  { name: "Immediate steps", desc: "What to do in the first hours/days after a death." },
  { name: "Costs", desc: "Casket, funeral, cremation and burial pricing." },
  { name: "Buying guide", desc: "How to choose caskets — size, material, value." },
  { name: "Local resources", desc: "City/state funeral homes, benefits, regulations." },
  { name: "Eco options", desc: "Green burial, biodegradable caskets." },
];

/** Live onboarding state for a store — powers the guided setup checklist. */
export async function getOnboardingStatus(bizId?: string): Promise<OnboardingStatusVM> {
  bizId = bizId ?? (await activeBizId());
  const empty = (name: string, domain: string): OnboardingStatusVM => ({
    businessId: bizId!,
    name,
    domain,
    status: "onboarding",
    hasProfile: false,
    profileExcerpt: null,
    brandVoice: null,
    pillarCount: 0,
    shopifyConnected: false,
    gscConnected: gscEnabled(),
    ideas: 0,
    writing: 0,
    ready: 0,
    published: 0,
  });
  if (!hasDatabase) return empty("Store", "example.com");

  const biz = await prisma.business.findUnique({ where: { id: bizId } });
  if (!biz) return empty("Store", "example.com");

  const inflight = ["RESEARCHING", "DRAFTED", "GRADING", "REVISING"] as const;
  const [connectors, pillarCount, ideas, writing, ready, published] = await Promise.all([
    prisma.connector.findMany({ where: { businessId: bizId }, select: { type: true, status: true } }),
    prisma.pillar.count({ where: { businessId: bizId } }),
    prisma.idea.count({ where: { businessId: bizId, status: "PROPOSED" } }),
    prisma.draft.count({ where: { businessId: bizId, status: { in: [...inflight] } } }),
    prisma.draft.count({ where: { businessId: bizId, status: "PASSED", scheduledFor: null, rejectedAt: null } }),
    prisma.draft.count({ where: { businessId: bizId, status: "PUBLISHED" } }),
  ]);
  const byType = new Map(connectors.map((c) => [c.type, c.status]));

  const profileMd = biz.profileMd?.trim() || null;
  const excerpt = profileMd
    ? profileMd.replace(/[#*_`>]/g, "").replace(/\s+/g, " ").trim().slice(0, 320)
    : null;

  return {
    businessId: bizId,
    name: biz.name,
    domain: biz.domain,
    status: biz.status.toLowerCase() as OnboardingStatusVM["status"],
    hasProfile: Boolean(profileMd),
    profileExcerpt: excerpt,
    brandVoice: biz.brandVoice?.trim() || null,
    pillarCount,
    shopifyConnected: byType.get("SHOPIFY") === "CONNECTED",
    gscConnected: byType.get("GSC") === "CONNECTED" || gscEnabled(),
    ideas,
    writing,
    ready,
    published,
  };
}

/** The content pillars configured for a store (falls back to the defaults). */
export async function getPillars(bizId?: string): Promise<{ name: string; desc: string }[]> {
  bizId = bizId ?? (await activeBizId());
  if (!hasDatabase) return FALLBACK_PILLARS;
  const rows = await prisma.pillar
    .findMany({ where: { businessId: bizId }, orderBy: { createdAt: "asc" } })
    .catch(() => []);
  return rows.length ? rows.map((p) => ({ name: p.name, desc: p.description ?? "" })) : FALLBACK_PILLARS;
}

export async function getBusiness(id?: string): Promise<BusinessSummary> {
  if (!hasDatabase) return BUSINESSES.find((b) => b.id === id) ?? BUSINESSES[0];
  // No explicit id → the operator's active store (cookie), else the oldest.
  const wanted = id ?? (await activeBizId());
  const row = await prisma.business.findUnique({ where: { id: wanted } });
  const chosen = row ?? (await prisma.business.findFirst({ orderBy: { createdAt: "asc" } }));
  // Fall back to mock if the DB has no businesses at all.
  return chosen ? toBusinessSummary(chosen) : BUSINESSES[0];
}

// ─────────────────────────────────────────────────────────────
// KPIs (overview)
// ─────────────────────────────────────────────────────────────

/** Live pipeline health: stage counts + whether the background engine is moving. */
export async function getPipelineHealth(bizId?: string): Promise<PipelineHealthVM> {
  bizId = bizId ?? (await activeBizId());
  const empty: PipelineHealthVM = {
    ideas: 0, briefs: 0, writing: 0, ready: 0, failed: 0, published: 0, stuck: 0,
    lastActivityAt: null, engineHealthy: false, lastActivityLabel: "no activity yet",
  };
  if (!hasDatabase) return empty;

  const business = await prisma.business.findUnique({ where: { id: bizId } });
  const threshold = business?.qualityThreshold ?? 85;
  const inflight = ["RESEARCHING", "DRAFTED", "GRADING", "REVISING"] as const;
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000);

  const [ideas, briefs, writing, passed, failed, published, latest, stuck] = await Promise.all([
    prisma.idea.count({ where: { businessId: bizId, status: "PROPOSED" } }),
    prisma.brief.count({ where: { businessId: bizId, status: "PENDING_APPROVAL" } }),
    prisma.draft.count({ where: { businessId: bizId, status: { in: [...inflight] } } }),
    prisma.draft.findMany({
      where: { businessId: bizId, status: "PASSED", scheduledFor: null, rejectedAt: null },
      include: { grades: { orderBy: { version: "desc" }, take: 1 } },
    }),
    prisma.draft.count({ where: { businessId: bizId, status: "FAILED" } }),
    prisma.draft.count({ where: { businessId: bizId, status: "PUBLISHED" } }),
    prisma.draft.findFirst({
      where: { businessId: bizId },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.draft.count({
      where: {
        businessId: bizId,
        status: { in: [...inflight] },
        processingStartedAt: { lt: staleBefore },
      },
    }),
  ]);

  const ready = passed.filter((d) => (d.grades[0]?.overall ?? 0) >= threshold).length;

  const lastMs = latest ? Date.now() - latest.updatedAt.getTime() : null;
  const lastActivityLabel =
    lastMs === null
      ? "no activity yet"
      : lastMs < 60_000
        ? "just now"
        : lastMs < 3_600_000
          ? `${Math.round(lastMs / 60_000)}m ago`
          : `${Math.round(lastMs / 3_600_000)}h ago`;

  return {
    ideas, briefs, writing, ready, failed, published, stuck,
    lastActivityAt: latest?.updatedAt.toISOString() ?? null,
    engineHealthy: lastMs !== null && lastMs < 40 * 60 * 1000,
    lastActivityLabel,
  };
}

/**
 * Score calibration: learn the "good enough" bar from YOUR decisions. Compares
 * the grades of pieces you published/liked vs pieces you rejected, and suggests
 * a threshold — so the bar reflects what actually works for this industry, not a
 * guessed number. (Sharpens further once GSC performance is wired in.)
 */
export async function getScoreCalibration(bizId?: string): Promise<ScoreCalibrationVM> {
  bizId = bizId ?? (await activeBizId());
  const bestScore = (d: { grades: { overall: number }[] }) => d.grades[0]?.overall ?? 0;
  if (!hasDatabase) {
    return {
      acceptedCount: 0, acceptedAvg: null, acceptedMin: null,
      rejectedCount: 0, rejectedAvg: null, recommended: null,
      note: "No data yet — using an industry-realistic default while the loop learns.",
    };
  }

  const grade = { grades: { orderBy: { overall: "desc" as const }, take: 1 } };
  const [accepted, rejected] = await Promise.all([
    prisma.draft.findMany({
      where: { businessId: bizId, OR: [{ status: "PUBLISHED" }, { feedback: { some: { verdict: "LIKE" } } }] },
      include: grade,
    }),
    prisma.draft.findMany({
      where: { businessId: bizId, OR: [{ rejectedAt: { not: null } }, { feedback: { some: { verdict: "REJECT" } } }] },
      include: grade,
    }),
  ]);

  const acc = accepted.map(bestScore).filter((s) => s > 0);
  const rej = rejected.map(bestScore).filter((s) => s > 0);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const acceptedMin = acc.length ? Math.min(...acc) : null;

  // Recommend the lowest score you were willing to ship, floored above the
  // rejected average, clamped to a realistic band. Needs a little data first.
  let recommended: number | null = null;
  let note = "Publish or reject a few pieces and I'll suggest a bar from your own decisions.";
  if (acc.length >= 3) {
    const rejAvg = avg(rej);
    let r = acceptedMin ?? 70;
    if (rejAvg !== null) r = Math.max(r, rejAvg + 1);
    recommended = Math.max(60, Math.min(85, r));
    note = `Based on ${acc.length} accepted vs ${rej.length} rejected pieces.`;
  }

  return {
    acceptedCount: acc.length, acceptedAvg: avg(acc), acceptedMin,
    rejectedCount: rej.length, rejectedAvg: avg(rej), recommended, note,
  };
}

/**
 * The "brain": given your goal (10 = 5 local + 5 evergreen) and the scores of the
 * pieces the engine has produced, work out how many are ready at the current bar
 * and what single change gets you to 10 — lower the bar (and to what), or produce
 * more (supply-limited). Drives the Overview status + one-click Optimize.
 */
export async function getGoalDiagnostics(bizId?: string): Promise<GoalDiagnosticsVM> {
  bizId = bizId ?? (await activeBizId());
  const total = 10;
  const base = (bar: number, ratio: number): GoalDiagnosticsVM => {
    const localTarget = Math.round((total * ratio) / 100);
    return {
      total, localTarget, everTarget: total - localTarget,
      readyLocal: 0, readyEver: 0, currentBar: bar,
      recommendedBar: null, projectedLocal: 0, projectedEver: 0,
      limiting: "supply", poolLocal: 0, poolEver: 0,
    };
  };
  if (!hasDatabase) return base(85, 50);

  const business = await prisma.business.findUnique({ where: { id: bizId } });
  const bar = business?.qualityThreshold ?? 85;
  const ratio = business?.localRatio ?? 50;
  const localTarget = Math.round((total * ratio) / 100);
  const everTarget = total - localTarget;

  // Pool = pieces that could become ready (passed or near-miss, not rejected/
  // scheduled/published), with their best score + category.
  const pool = await prisma.draft.findMany({
    where: { businessId: bizId, status: { in: ["PASSED", "FAILED"] }, rejectedAt: null, scheduledFor: null },
    include: {
      brief: { select: { idea: { select: { kind: true } } } },
      grades: { orderBy: { overall: "desc" }, take: 1 },
    },
  });
  const localScores = pool
    .filter((d) => d.brief?.idea?.kind === "LOCAL")
    .map((d) => d.grades[0]?.overall ?? 0)
    .filter((s) => s > 0);
  const everScores = pool
    .filter((d) => d.brief?.idea?.kind !== "LOCAL")
    .map((d) => d.grades[0]?.overall ?? 0)
    .filter((s) => s > 0);

  const readyAt = (b: number) => ({
    local: localScores.filter((s) => s >= b).length,
    ever: everScores.filter((s) => s >= b).length,
  });
  const cur = readyAt(bar);

  // Highest bar (≥60) that still meets BOTH category targets — least lowering.
  let goalBar: number | null = null;
  for (let b = bar; b >= 60; b--) {
    const r = readyAt(b);
    if (r.local >= localTarget && r.ever >= everTarget) {
      goalBar = b;
      break;
    }
  }

  let limiting: GoalDiagnosticsVM["limiting"];
  let recommendedBar: number | null;
  if (goalBar === bar) {
    limiting = "none";
    recommendedBar = null;
  } else if (goalBar !== null) {
    limiting = "bar";
    recommendedBar = goalBar;
  } else {
    // Even at 60 we can't fill both categories — need more content.
    limiting = "supply";
    const at60 = readyAt(60);
    recommendedBar = at60.local + at60.ever > cur.local + cur.ever ? 60 : null;
  }
  const proj = readyAt(recommendedBar ?? bar);

  return {
    total, localTarget, everTarget,
    readyLocal: cur.local, readyEver: cur.ever, currentBar: bar,
    recommendedBar, projectedLocal: proj.local, projectedEver: proj.ever,
    limiting, poolLocal: localScores.length, poolEver: everScores.length,
  };
}

/** Real per-blog cost, and cost broken down by score band — the actual $/quality
 *  curve from recorded token usage (replaces estimates). */
export async function getCostSummary(bizId?: string): Promise<CostSummaryVM> {
  bizId = bizId ?? (await activeBizId());
  const empty: CostSummaryVM = {
    count: 0, totalCents: 0, avgCents: null, todayCents: 0, todayCount: 0, byBand: [],
  };
  if (!hasDatabase) return empty;

  const drafts = await prisma.draft.findMany({
    where: { businessId: bizId, costCents: { gt: 0 } },
    select: { costCents: true, createdAt: true, grades: { orderBy: { overall: "desc" }, take: 1 } },
  });
  if (drafts.length === 0) return empty;

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const todayRows = drafts.filter((d) => d.createdAt >= startOfDay);
  const todayCents = todayRows.reduce((a, d) => a + d.costCents, 0);

  const rows = drafts.map((d) => ({ cost: d.costCents, score: d.grades[0]?.overall ?? 0 }));
  const totalCents = rows.reduce((a, r) => a + r.cost, 0);

  const BANDS: { band: string; lo: number; hi: number }[] = [
    { band: "< 70", lo: 0, hi: 69 },
    { band: "70–73", lo: 70, hi: 73 },
    { band: "74–76", lo: 74, hi: 76 },
    { band: "77–79", lo: 77, hi: 79 },
    { band: "80+", lo: 80, hi: 1000 },
  ];
  const byBand = BANDS.map((b) => {
    const inBand = rows.filter((r) => r.score >= b.lo && r.score <= b.hi);
    return {
      band: b.band,
      count: inBand.length,
      avgCents: inBand.length ? inBand.reduce((a, r) => a + r.cost, 0) / inBand.length : 0,
    };
  }).filter((b) => b.count > 0);

  return {
    count: rows.length,
    totalCents,
    avgCents: totalCents / rows.length,
    todayCents,
    todayCount: todayRows.length,
    byBand,
  };
}

/**
 * Live Google Search Console opportunities for the Overview panel: the page-2
 * "striking distance" keywords worth targeting, and the pages decaying enough to
 * refresh. Returns { connected: false } when GSC isn't wired or returns no data,
 * so the panel can prompt to connect instead of showing an empty state.
 */
export async function getSeoOpportunities(): Promise<SeoOpportunitiesVM> {
  const empty: SeoOpportunitiesVM = {
    connected: false,
    totalClicks28d: 0,
    totalImpressions28d: 0,
    striking: [],
    decaying: [],
  };
  if (!gscEnabled()) return empty;
  try {
    const [rows, decaying] = await Promise.all([
      fetchGscRows({ days: 28, dimensions: ["query"], rowLimit: 1000 }),
      decayingPages({ window: 28, minPriorClicks: 20, minDropPct: 30 }),
    ]);
    if (!rows) return empty;

    const striking = strikingDistance(rows)
      .slice(0, 12)
      .map((r) => ({
        query: r.query,
        position: r.position,
        impressions: r.impressions,
        clicks: r.clicks,
      }));

    return {
      connected: true,
      totalClicks28d: rows.reduce((a, r) => a + r.clicks, 0),
      totalImpressions28d: rows.reduce((a, r) => a + r.impressions, 0),
      striking,
      decaying: (decaying ?? []).slice(0, 6).map((d) => ({
        path: d.page.replace(/^https?:\/\/[^/]+/, ""),
        dropPct: d.dropPct,
        recentClicks: d.recentClicks,
        priorClicks: d.priorClicks,
      })),
    };
  } catch (e) {
    console.error("[gsc] getSeoOpportunities failed:", e instanceof Error ? e.message : e);
    return empty;
  }
}

/**
 * Rank movement from the stored KeywordRank history: compares the most recent
 * snapshot to one ~7 days earlier (or the earliest we have) and surfaces the
 * keywords that climbed toward page 1 and those slipping. Returns
 * hasHistory:false until at least two snapshot days exist, so the UI can show a
 * "collecting data" state rather than an empty one.
 */
export async function getKeywordMovers(bizId?: string): Promise<MoversVM> {
  bizId = bizId ?? (await activeBizId());
  const empty: MoversVM = { hasHistory: false, daysSpan: 0, climbers: [], droppers: [] };
  if (!hasDatabase) return empty;

  // Distinct snapshot days, newest first.
  const days = await prisma.keywordRank.findMany({
    where: { businessId: bizId },
    distinct: ["date"],
    select: { date: true },
    orderBy: { date: "desc" },
    take: 30,
  });
  if (days.length < 2) return empty;

  const latest = days[0].date;
  const weekMs = 7 * 86_400_000;
  // Prefer a snapshot ~7 days back; else the oldest we have.
  const prior =
    days.find((d) => latest.getTime() - d.date.getTime() >= weekMs)?.date ??
    days[days.length - 1].date;
  const daysSpan = Math.round((latest.getTime() - prior.getTime()) / 86_400_000);

  const [latestRows, priorRows] = await Promise.all([
    prisma.keywordRank.findMany({
      where: { businessId: bizId, date: latest },
      select: { query: true, position: true, impressions: true },
    }),
    prisma.keywordRank.findMany({
      where: { businessId: bizId, date: prior },
      select: { query: true, position: true },
    }),
  ]);

  const priorPos = new Map(priorRows.map((r) => [r.query, r.position]));
  const movers = latestRows
    .filter((r) => r.impressions >= 10 && priorPos.has(r.query))
    .map((r) => ({
      query: r.query,
      position: r.position,
      impressions: r.impressions,
      // Lower position = better rank, so improvement = prior − latest.
      delta: (priorPos.get(r.query) as number) - r.position,
    }))
    .filter((m) => Math.abs(m.delta) >= 0.5); // ignore rank noise

  const climbers = movers
    .filter((m) => m.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 6);
  const droppers = movers
    .filter((m) => m.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 6);

  return { hasHistory: true, daysSpan, climbers, droppers };
}

/**
 * GEO visibility from the latest citation check: how often AI answer engines
 * cite us for our target questions, plus the win list and the not-cited
 * opportunity list. connected:false until an answer-engine key is wired and a
 * check has run.
 */
export async function getGeoVisibility(bizId?: string): Promise<GeoVisibilityVM> {
  bizId = bizId ?? (await activeBizId());
  const keyConfigured = geoEnabled();
  const empty: GeoVisibilityVM = {
    keyConfigured, connected: false, tested: 0, citedCount: 0, mentionedCount: 0,
    citationRate: 0, lastCheckedAt: null, cited: [], notCited: [],
  };
  if (!hasDatabase || !keyConfigured) return empty;

  let rows: Awaited<ReturnType<typeof prisma.geoCitation.findMany>> = [];
  let latestDate: Date | null = null;
  try {
    const latest = await prisma.geoCitation.findFirst({
      where: { businessId: bizId },
      orderBy: { date: "desc" },
      select: { date: true },
    });
    if (!latest) return empty;
    latestDate = latest.date;
    rows = await prisma.geoCitation.findMany({
      where: { businessId: bizId, date: latest.date },
      orderBy: [{ cited: "desc" }, { query: "asc" }],
    });
  } catch (e) {
    console.error("[geo] getGeoVisibility failed:", e instanceof Error ? e.message : e);
    return empty;
  }
  const toVM = (r: (typeof rows)[number]) => ({
    query: r.query,
    cited: r.cited,
    mentioned: r.mentioned,
    position: r.position,
  });
  const citedCount = rows.filter((r) => r.cited).length;
  const mentionedCount = rows.filter((r) => r.mentioned).length;
  return {
    keyConfigured,
    connected: true,
    tested: rows.length,
    citedCount,
    mentionedCount,
    citationRate: rows.length ? Math.round((citedCount / rows.length) * 100) : 0,
    lastCheckedAt: latestDate ? latestDate.toISOString() : null,
    cited: rows.filter((r) => r.cited).map(toVM),
    notCited: rows.filter((r) => !r.cited).map(toVM),
  };
}

export async function getKpis(bizId?: string): Promise<Kpis> {
  bizId = bizId ?? (await activeBizId());
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

export async function getPipeline(bizId?: string): Promise<PipelineCard[]> {
  bizId = bizId ?? (await activeBizId());
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

  // Review — near-miss drafts (FAILED) the engine keeps auto-boosting.
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
      meta: "auto-boosting",
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

export async function getIdeas(bizId?: string): Promise<IdeaVM[]> {
  bizId = bizId ?? (await activeBizId());
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
    kind: i.kind === "LOCAL" ? ("LOCAL" as const) : ("EVERGREEN" as const),
  }));
}

// ─────────────────────────────────────────────────────────────
// Briefs awaiting approval
// ─────────────────────────────────────────────────────────────

export async function getPendingBriefs(bizId?: string): Promise<BriefVM[]> {
  bizId = bizId ?? (await activeBizId());
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

export async function getLatestScorecard(bizId?: string): Promise<ScorecardVM> {
  bizId = bizId ?? (await activeBizId());
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

export async function getLivePages(bizId?: string): Promise<LivePageVM[]> {
  bizId = bizId ?? (await activeBizId());
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
export async function getReadyToSchedule(bizId?: string): Promise<ReadyDraftVM[]> {
  bizId = bizId ?? (await activeBizId());
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
export async function getScheduledDrafts(bizId?: string): Promise<ScheduledItemVM[]> {
  bizId = bizId ?? (await activeBizId());
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
  brief: { targetKeyword: string; idea?: { kind: string } | null };
  grades: { overall: number; feedback: string | null; dimensions: unknown; version: number }[];
  costCents?: number;
  heroImageData?: string | null;
  heroImageUrl?: string | null;
  heroImageSource?: string | null;
  refreshedAt?: Date | null;
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
    kind: d.brief.idea?.kind === "LOCAL" ? "LOCAL" : "EVERGREEN",
    overall: g?.overall ?? 0,
    threshold,
    status: d.status.toLowerCase() as PolishDraftVM["status"],
    bodyMd: d.bodyMd,
    feedback: g?.feedback ?? "",
    dimensions,
    loop: g?.version ?? 1,
    experienceNotes: extractExperienceNotes(d.bodyMd),
    costCents: d.costCents ?? 0,
    hasHeroImage: Boolean(d.heroImageData || d.heroImageUrl),
    heroImageSource: d.heroImageSource ?? null,
    refreshedAt: d.refreshedAt ? d.refreshedAt.toISOString() : null,
    updatedAt: d.updatedAt.toISOString(),
  };
}

/** Ready-to-review: PASSED pieces that have cleared the bar but haven't been
 *  reviewed+moved yet. They sit here with full scorecard + post for a final look
 *  before you move them to the calendar's ready-to-schedule queue. */
export async function getReadyForReview(bizId?: string): Promise<PolishDraftVM[]> {
  bizId = bizId ?? (await activeBizId());
  if (!hasDatabase) return [];
  const business = await prisma.business.findUnique({ where: { id: bizId } });
  const threshold = business?.qualityThreshold ?? 85;
  const drafts = await prisma.draft.findMany({
    where: { businessId: bizId, status: "PASSED", scheduledFor: null, rejectedAt: null },
    // Best grade the piece achieved — matches the stored best-version body.
    include: { brief: { include: { idea: { select: { kind: true } } } }, grades: { orderBy: { overall: "desc" }, take: 1 } },
    orderBy: { updatedAt: "desc" },
  });
  // Only genuinely-graded pieces — filters out any placeholder/seed rows that
  // were marked PASSED without a real grade (they'd show a 0/empty scorecard).
  return drafts.map((d) => toPolishVM(d, threshold)).filter((vm) => vm.overall >= vm.threshold);
}

/** Near-miss drafts (FAILED) that need a human E-E-A-T pass before they can pass. */
export async function getNeedsPolish(bizId?: string): Promise<PolishDraftVM[]> {
  bizId = bizId ?? (await activeBizId());
  if (!hasDatabase) return [];
  const business = await prisma.business.findUnique({ where: { id: bizId } });
  const threshold = business?.qualityThreshold ?? 85;

  const drafts = await prisma.draft.findMany({
    where: { businessId: bizId, status: "FAILED", rejectedAt: null },
    include: { brief: { include: { idea: { select: { kind: true } } } }, grades: { orderBy: { overall: "desc" }, take: 1 } },
    orderBy: { updatedAt: "desc" },
  });
  // Only genuine near-misses — pieces whose best score is still below the bar.
  return drafts.map((d) => toPolishVM(d, threshold)).filter((vm) => vm.overall < vm.threshold);
}

/** A single draft for the focused polish page. Returns null if not found. */
export async function getPolishDraft(draftId: string): Promise<PolishDraftVM | null> {
  if (!hasDatabase) return null;
  const d = await prisma.draft.findUnique({
    where: { id: draftId },
    include: {
      brief: { include: { idea: { select: { kind: true } } } },
      business: true,
      grades: { orderBy: { overall: "desc" }, take: 1 },
    },
  });
  if (!d) return null;
  return toPolishVM(d, d.business.qualityThreshold);
}

/** Merged month-grid feed: scheduled (future) + published (past) entries. */
export async function getCalendarEntries(bizId?: string): Promise<CalendarEntryVM[]> {
  bizId = bizId ?? (await activeBizId());
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
  { type: "SLACK", label: "Slack", detail: "SEO recommendations → your channel" },
];

export async function getConnectors(bizId?: string): Promise<ConnectorVM[]> {
  bizId = bizId ?? (await activeBizId());
  if (!hasDatabase) {
    return (CONNECTORS[bizId] ?? []).map((c) => ({
      ...c,
      managed: false,
      connectable: isConnectable(c.type),
    }));
  }

  const rows = await prisma.connector.findMany({ where: { businessId: bizId } });
  const byType = new Map(rows.map((r) => [r.type, r.status]));

  return CONNECTOR_ROSTER.map((c) => {
    // A stored DB row (entered via the in-app Connect flow) wins — that's the
    // per-site credential. Otherwise fall back to an env-provided key.
    const dbStatus = byType.get(c.type as never) as string | undefined;
    let status: ConnectorVM["status"] = "disconnected";
    if (dbStatus) status = dbStatus.toLowerCase() as ConnectorVM["status"];
    else if (c.fromEnv && process.env[c.fromEnv]) status = "connected";
    return {
      type: c.type,
      label: c.label,
      status,
      detail: c.detail,
      managed: Boolean(dbStatus),
      connectable: isConnectable(c.type),
    };
  });
}

/** SEO recommendations for a business — open first, then newest. */
export async function getRecommendations(bizId?: string): Promise<RecommendationVM[]> {
  bizId = bizId ?? (await activeBizId());
  if (!hasDatabase) return [];
  const rows = await prisma.recommendation.findMany({
    where: { businessId: bizId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }], // OPEN sorts before DONE
    take: 100,
  });
  return rows.map((r) => ({
    id: r.id,
    note: r.note,
    author: r.author,
    imageData: r.imageData,
    imageMime: r.imageMime,
    status: r.status === "DONE" ? "done" : "open",
    createdAt: r.createdAt.toISOString(),
  }));
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
  { key: "briefs", label: "Briefs", tone: "accent" },
  { key: "in_progress", label: "Writing & grading", tone: "accent" },
  { key: "review", label: "Auto-review & boost", tone: "accent" },
  { key: "scheduled", label: "Ready to publish", tone: "success", href: "/ready" },
  { key: "live", label: "Live", tone: "success", href: "/performance" },
];
