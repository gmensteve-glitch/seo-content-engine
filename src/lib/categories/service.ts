// Category-page service — discovery → facts → brief → draft → fact-check →
// grade, plus the manual-publish bookkeeping. Deliberately has NO function that
// writes to a collection page: the deliverable is paste-ready blocks, and a
// person marks a page live after pasting.

import { prisma, hasDatabase } from "@/lib/db";
import { activeBizId } from "@/lib/active-business";
import { discoverCollections, localityFor } from "@/lib/categories/discover";
import { fetchCatalogFacts, type CatalogFacts } from "@/lib/categories/facts";
import {
  buildCategoryBrief,
  writeCategoryDraft,
  reviseCategoryDraft,
  tierSpec,
  type CategoryBrief,
  type CategoryContext,
  type CategoryDraftJson,
  type LinkTarget,
} from "@/lib/agents/category-writer";
import {
  assembleBodyHtml,
  faqJsonLd,
  factCheck,
  draftAsMarkdown,
  snapshotHash,
  wordCount,
} from "@/lib/categories/assemble";
import { gradeDraft } from "@/lib/agents/grader";
import { buildContentGuidance } from "@/lib/pipeline/service";
import type { CategoryStatus } from "@prisma/client";

const REFRESH_DAYS = 90;

function requireDb(): void {
  if (!hasDatabase) throw new Error("DATABASE_URL is not set");
}

// ── View models ────────────────────────────────────────────────

export interface CategoryPageVM {
  id: string;
  handle: string;
  url: string;
  title: string; // the H1 we wrote, else the live title
  liveTitle: string | null;
  productCount: number | null;
  liveHasContent: boolean;
  removed: boolean;
  tier: 1 | 2 | 3;
  targetKeyword: string | null;
  secondaryKeywords: string[];
  status: CategoryStatus;
  overall: number | null;
  factIssues: string[];
  words: number | null;
  draftedAt: string | null;
  liveAt: string | null;
  refreshDueAt: string | null;
  lastCrawledAt: string | null;
}

export interface CategoryPageDetailVM extends CategoryPageVM {
  h1: string | null;
  intro: string | null;
  bodyHtml: string | null;
  seoTitle: string | null;
  metaDescription: string | null;
  faqJsonLd: string | null;
  gradeNotes: string | null;
  fixNotes: string[];
  facts: CatalogFacts | null;
  brief: CategoryBrief | null;
  threshold: number;
  drifted: boolean; // blocks changed since they were marked live
}

type Row = NonNullable<Awaited<ReturnType<typeof prisma.categoryPage.findUnique>>>;

function words(row: Row): number | null {
  if (!row.bodyHtml) return null;
  const text = `${row.intro ?? ""} ${row.bodyHtml.replace(/<[^>]+>/g, " ")}`;
  return text.split(/\s+/).filter(Boolean).length;
}

function toVM(row: Row): CategoryPageVM {
  return {
    id: row.id,
    handle: row.handle,
    url: row.url,
    title: row.h1 ?? row.liveTitle ?? row.handle,
    liveTitle: row.liveTitle,
    productCount: row.productCount,
    liveHasContent: row.liveHasContent,
    removed: row.removedAt != null,
    tier: (row.tier === 1 || row.tier === 3 ? row.tier : 2) as 1 | 2 | 3,
    targetKeyword: row.targetKeyword,
    secondaryKeywords: row.secondaryKeywords,
    status: row.status,
    overall: row.overall,
    factIssues: row.factIssues,
    words: words(row),
    draftedAt: row.draftedAt?.toISOString() ?? null,
    liveAt: row.liveAt?.toISOString() ?? null,
    refreshDueAt: row.refreshDueAt?.toISOString() ?? null,
    lastCrawledAt: row.lastCrawledAt?.toISOString() ?? null,
  };
}

// ── Discovery ──────────────────────────────────────────────────

/**
 * Crawl the store and sync the CategoryPage roster. Idempotent: new
 * collections are added (with an auto tier + starting keyword), known ones get
 * their live title/product count/content flag refreshed, and anything no
 * longer on the site is flagged removed (never deleted — it may hold a draft).
 * Operator-edited tier/keyword are preserved.
 */
export async function rescanCategoryPages(
  bizId?: string,
): Promise<{ found: number; added: number; removed: number; readable: boolean }> {
  requireDb();
  const businessId = bizId ?? (await activeBizId());
  const biz = await prisma.business.findUnique({ where: { id: businessId } });
  if (!biz) throw new Error("Business not found");

  const found = await discoverCollections(biz.domain);
  if (found.length === 0) return { found: 0, added: 0, removed: 0, readable: false };

  const now = new Date();
  const existing = await prisma.categoryPage.findMany({ where: { businessId } });
  const byHandle = new Map(existing.map((r) => [r.handle, r]));
  let added = 0;

  for (const c of found) {
    const row = byHandle.get(c.handle);
    if (!row) {
      await prisma.categoryPage.create({
        data: {
          businessId,
          handle: c.handle,
          url: c.url,
          liveTitle: c.title,
          productCount: c.productCount,
          liveHasContent: c.hasContent,
          lastCrawledAt: now,
          tier: c.tier,
          targetKeyword: c.keyword,
        },
      });
      added += 1;
    } else {
      await prisma.categoryPage.update({
        where: { id: row.id },
        data: {
          url: c.url,
          liveTitle: c.title,
          productCount: c.productCount ?? row.productCount,
          liveHasContent: c.hasContent,
          lastCrawledAt: now,
          removedAt: null,
          targetKeyword: row.targetKeyword ?? c.keyword,
        },
      });
    }
  }

  const foundHandles = new Set(found.map((c) => c.handle));
  const gone = existing.filter((r) => !foundHandles.has(r.handle) && !r.removedAt);
  for (const r of gone) {
    await prisma.categoryPage.update({ where: { id: r.id }, data: { removedAt: now } });
  }
  return { found: found.length, added, removed: gone.length, readable: true };
}

// ── Listing ────────────────────────────────────────────────────

export async function listCategoryPages(bizId?: string): Promise<CategoryPageVM[]> {
  if (!hasDatabase) return [];
  const businessId = bizId ?? (await activeBizId());
  const rows = await prisma.categoryPage.findMany({
    where: { businessId },
    orderBy: [{ tier: "asc" }, { handle: "asc" }],
  });
  return rows.map(toVM);
}

export async function getCategoryPage(id: string): Promise<CategoryPageDetailVM | null> {
  if (!hasDatabase) return null;
  const row = await prisma.categoryPage.findUnique({ where: { id } });
  if (!row) return null;
  const biz = await prisma.business.findUnique({ where: { id: row.businessId } });
  let facts: CatalogFacts | null = null;
  let brief: CategoryBrief | null = null;
  try {
    facts = row.factsJson ? (JSON.parse(row.factsJson) as CatalogFacts) : null;
  } catch {
    facts = null;
  }
  try {
    brief = row.briefJson ? (JSON.parse(row.briefJson) as CategoryBrief) : null;
  } catch {
    brief = null;
  }
  const current = snapshotHash(row);
  return {
    ...toVM(row),
    h1: row.h1,
    intro: row.intro,
    bodyHtml: row.bodyHtml,
    seoTitle: row.seoTitle,
    metaDescription: row.metaDescription,
    faqJsonLd: row.faqJsonLd,
    gradeNotes: row.gradeNotes,
    fixNotes: row.fixNotes,
    facts,
    brief,
    threshold: biz?.qualityThreshold ?? 85,
    drifted: row.liveSnapshot != null && row.liveSnapshot !== current,
  };
}

// ── Drafting ───────────────────────────────────────────────────

/** Internal pages the writer may link: sibling collections (hubs first), the
 *  business's live blog posts, and this collection's own products. */
async function linkTargets(businessId: string, self: Row, facts: CatalogFacts | null): Promise<LinkTarget[]> {
  const siblings = await prisma.categoryPage.findMany({
    where: { businessId, removedAt: null, NOT: { id: self.id } },
    orderBy: [{ tier: "asc" }, { handle: "asc" }],
  });
  const out: LinkTarget[] = siblings.map((s) => ({
    title: s.h1 ?? s.liveTitle ?? s.handle,
    url: s.url,
    kind: s.tier === 1 ? "hub" : "collection",
  }));
  const pages = await prisma.page.findMany({
    where: { businessId, publishedAt: { not: null }, contentType: "BLOG" },
    include: { draft: { select: { title: true } } },
    orderBy: { publishedAt: "desc" },
    take: 30,
  });
  for (const p of pages) {
    if (!/^https?:\/\//i.test(p.url)) continue;
    out.push({ title: p.draft?.title ?? p.url, url: p.url, kind: "blog" });
  }
  for (const p of facts?.products.slice(0, 6) ?? []) {
    if (p.url && p.title) out.push({ title: p.title, url: p.url, kind: "product" });
  }
  return out;
}

async function contextFor(row: Row, note?: string): Promise<CategoryContext> {
  const biz = await prisma.business.findUnique({ where: { id: row.businessId } });
  if (!biz) throw new Error("Business not found");

  // Fresh catalog facts every draft — prices must be current. Fall back to the
  // last known facts if the site is momentarily unreadable.
  let facts = await fetchCatalogFacts(biz.domain, row.handle);
  if (!facts && row.factsJson) {
    try {
      facts = JSON.parse(row.factsJson) as CatalogFacts;
    } catch {
      facts = null;
    }
  }
  const links = await linkTargets(biz.id, row, facts);
  const houseRules = await buildContentGuidance(biz.id).catch(() => "");
  const fixNotes = [...row.fixNotes, ...(note?.trim() ? [note.trim()] : [])];
  const tier = (row.tier === 1 || row.tier === 3 ? row.tier : 2) as 1 | 2 | 3;
  return {
    businessName: biz.name,
    domain: biz.domain,
    businessContext: biz.profileMd ?? `${biz.name} — ${biz.domain}`,
    brandVoice: biz.brandVoice ?? "",
    houseRules,
    fixNotes,
    collection: {
      title: row.liveTitle ?? row.handle,
      handle: row.handle,
      url: row.url,
      tier,
      keywordSeed: row.targetKeyword ?? row.handle.replace(/-/g, " "),
      locality: localityFor(row.handle),
    },
    facts,
    links,
  };
}

interface Assembled {
  draft: CategoryDraftJson;
  bodyHtml: string;
  issues: string[];
  overall: number;
  feedback: string;
}

async function assembleAndCheck(
  ctx: CategoryContext,
  brief: CategoryBrief,
  draft: CategoryDraftJson,
  threshold: number,
): Promise<Assembled> {
  const bodyHtml = assembleBodyHtml(draft, ctx.businessName, ctx.domain);
  const spec = tierSpec(ctx.collection.tier);
  const issues = factCheck(draft, bodyHtml, ctx.facts, ctx.links, ctx.domain, spec.faqs[0]);
  const grade = await gradeDraft(
    draftAsMarkdown(draft, ctx.businessName),
    JSON.stringify({
      targetKeyword: brief.primaryKeyword,
      angle: brief.angle,
      wordTarget: brief.wordTarget,
      outline: brief.sections.map((s) => s.heading),
      questions: brief.questions,
      pageType: "e-commerce category page (commercial intent)",
    }),
    threshold,
  );
  return { draft, bodyHtml, issues, overall: grade.overall, feedback: grade.feedback };
}

/**
 * Write (or rewrite) the paste-ready content for one collection page. One
 * automatic revision pass if the fact-check or the quality bar fails; if it
 * still fails, the draft is kept and the page is marked NEEDS_FIX with the
 * issues visible so a human can steer it.
 */
export async function draftCategoryPage(id: string, opts: { note?: string } = {}): Promise<CategoryPageVM> {
  requireDb();
  const row = await prisma.categoryPage.findUnique({ where: { id } });
  if (!row) throw new Error("Category page not found");
  const biz = await prisma.business.findUnique({ where: { id: row.businessId } });
  const threshold = biz?.qualityThreshold ?? 85;
  const hadDraft = Boolean(row.bodyHtml);

  await prisma.categoryPage.update({ where: { id }, data: { status: "DRAFTING" } });
  try {
    const ctx = await contextFor(row, opts.note);
    const brief = await buildCategoryBrief(ctx);
    let result = await assembleAndCheck(ctx, brief, await writeCategoryDraft(ctx, brief), threshold);

    if (result.issues.length || result.overall < threshold) {
      const toFix = [
        ...result.issues,
        ...(result.overall < threshold ? [`Grader (${result.overall}/${threshold}): ${result.feedback}`] : []),
      ];
      const revised = await reviseCategoryDraft(ctx, brief, result.draft, toFix);
      result = await assembleAndCheck(ctx, brief, revised, threshold);
    }

    const ok = result.issues.length === 0 && result.overall >= threshold;
    const updated = await prisma.categoryPage.update({
      where: { id },
      data: {
        status: ok ? "DRAFT_READY" : "NEEDS_FIX",
        h1: result.draft.h1.trim(),
        intro: result.draft.intro.trim(),
        bodyHtml: result.bodyHtml,
        seoTitle: result.draft.seoTitle.trim(),
        metaDescription: result.draft.metaDescription.trim(),
        faqJsonLd: faqJsonLd(result.draft.faqs),
        factsJson: ctx.facts ? JSON.stringify(ctx.facts) : row.factsJson,
        briefJson: JSON.stringify(brief),
        targetKeyword: brief.primaryKeyword || row.targetKeyword,
        secondaryKeywords: brief.secondaryKeywords,
        overall: result.overall,
        gradeNotes: result.feedback,
        factIssues: result.issues,
        fixNotes: ctx.fixNotes,
        draftedAt: new Date(),
      },
    });
    console.log(
      `[category] ${row.handle}: ${ok ? "DRAFT_READY" : "NEEDS_FIX"} — grade ${result.overall}/${threshold}, ${wordCount(result.draft)} words, ${result.issues.length} issue(s)`,
    );
    return toVM(updated);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[category] draft failed for ${row.handle}:`, msg);
    const updated = await prisma.categoryPage.update({
      where: { id },
      data: {
        status: hadDraft ? "NEEDS_FIX" : "NOT_STARTED",
        gradeNotes: `Draft failed: ${msg}`,
      },
    });
    return toVM(updated);
  }
}

/** Draft every undrafted page in a tier, one after another (bounded). */
export async function draftCategoryTier(tier: number, bizId?: string, limit = 12): Promise<number> {
  requireDb();
  const businessId = bizId ?? (await activeBizId());
  const rows = await prisma.categoryPage.findMany({
    where: { businessId, tier, removedAt: null, status: { in: ["NOT_STARTED", "NEEDS_FIX"] } },
    orderBy: { handle: "asc" },
    take: limit,
  });
  let n = 0;
  for (const r of rows) {
    await draftCategoryPage(r.id);
    n += 1;
  }
  return n;
}

/** Operator steer: apply a note to this page (and optionally remember it as a
 *  house rule for every future page), then redraft. */
export async function fixCategoryPage(id: string, note: string, remember: boolean): Promise<CategoryPageVM> {
  requireDb();
  const row = await prisma.categoryPage.findUnique({ where: { id } });
  if (!row) throw new Error("Category page not found");
  const clean = note.trim();
  if (clean && remember) {
    await prisma.contentFeedback.create({ data: { businessId: row.businessId, note: clean } });
  }
  return draftCategoryPage(id, { note: clean || undefined });
}

// ── Manual publish bookkeeping ─────────────────────────────────

export async function markCategoryLive(id: string): Promise<void> {
  requireDb();
  const row = await prisma.categoryPage.findUnique({ where: { id } });
  if (!row || !row.bodyHtml) throw new Error("Nothing to mark live — draft it first");
  const now = new Date();
  await prisma.categoryPage.update({
    where: { id },
    data: {
      status: "LIVE",
      liveAt: now,
      liveSnapshot: snapshotHash(row),
      refreshDueAt: new Date(now.getTime() + REFRESH_DAYS * 86400000),
      factIssues: [],
    },
  });
}

export async function markCategoryNeedsRefresh(id: string): Promise<void> {
  requireDb();
  await prisma.categoryPage.update({ where: { id }, data: { status: "NEEDS_REFRESH" } });
}

/** Un-live a page (e.g. it was pasted wrong or pulled) — keeps the draft. */
export async function markCategoryNotLive(id: string): Promise<void> {
  requireDb();
  const row = await prisma.categoryPage.findUnique({ where: { id } });
  if (!row) return;
  await prisma.categoryPage.update({
    where: { id },
    data: { status: row.bodyHtml ? "DRAFT_READY" : "NOT_STARTED", liveAt: null, liveSnapshot: null, refreshDueAt: null },
  });
}

export async function setCategoryStrategy(
  id: string,
  patch: { tier?: number; targetKeyword?: string },
): Promise<void> {
  requireDb();
  const data: { tier?: number; targetKeyword?: string } = {};
  if (patch.tier && [1, 2, 3].includes(patch.tier)) data.tier = patch.tier;
  if (typeof patch.targetKeyword === "string" && patch.targetKeyword.trim()) {
    data.targetKeyword = patch.targetKeyword.trim().toLowerCase();
  }
  if (Object.keys(data).length) await prisma.categoryPage.update({ where: { id }, data });
}

// ── Refresh tracking ───────────────────────────────────────────

/** LIVE pages past their refresh date → NEEDS_REFRESH. Returns how many flipped. */
export async function flagCategoryRefreshes(bizId?: string): Promise<number> {
  if (!hasDatabase) return 0;
  const where = {
    status: "LIVE" as const,
    refreshDueAt: { lte: new Date() },
    ...(bizId ? { businessId: bizId } : {}),
  };
  const res = await prisma.categoryPage.updateMany({ where, data: { status: "NEEDS_REFRESH" } });
  return res.count;
}

export async function categoryCounts(bizId?: string): Promise<Record<CategoryStatus, number>> {
  const base: Record<CategoryStatus, number> = {
    NOT_STARTED: 0,
    DRAFTING: 0,
    DRAFT_READY: 0,
    NEEDS_FIX: 0,
    LIVE: 0,
    NEEDS_REFRESH: 0,
  };
  if (!hasDatabase) return base;
  const businessId = bizId ?? (await activeBizId());
  const groups = await prisma.categoryPage.groupBy({
    by: ["status"],
    where: { businessId, removedAt: null },
    _count: { _all: true },
  });
  for (const g of groups) base[g.status] = g._count._all;
  return base;
}
