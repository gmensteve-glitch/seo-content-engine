// Category-page service — discovery → facts → brief → draft → editor pass →
// fact-check → grade (with revision loops), plus the manual-publish
// bookkeeping. Deliberately has NO function that writes to a collection page:
// the deliverable is paste-ready blocks, and a person marks a page live after
// pasting.

import { prisma, hasDatabase } from "@/lib/db";
import { activeBizId } from "@/lib/active-business";
import { discoverCollections, localityFor } from "@/lib/categories/discover";
import { fetchCatalogFacts, type CatalogFacts } from "@/lib/categories/facts";
import { fetchStorePolicies } from "@/lib/categories/policies";
import {
  buildCategoryBrief,
  writeCategoryDraft,
  reviseCategoryDraft,
  tightenCategoryDraft,
  rewriteCategoryPassage,
  tierSpec,
  type CategoryBrief,
  type CategoryContext,
  type CategoryDraftJson,
  type LinkTarget,
  type PassageTarget,
} from "@/lib/agents/category-writer";
import {
  assembleBodyHtml,
  faqJsonLd,
  factCheck,
  draftAsMarkdown,
  snapshotHash,
  wordCount,
  linkCounts,
  bodyAsText,
} from "@/lib/categories/assemble";
import { gradeDraft } from "@/lib/agents/grader";
import { RUBRIC, type GradeResult } from "@/lib/grader/rubric";
import { buildContentGuidance } from "@/lib/pipeline/service";
import type { CategoryStatus } from "@prisma/client";

const REFRESH_DAYS = 90;
const POLICY_TTL_DAYS = 7;
const MAX_REVISE_LOOPS = 2;

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
  locality: string | null;
  targetKeyword: string | null;
  secondaryKeywords: string[];
  status: CategoryStatus;
  overall: number | null;
  factIssues: string[];
  words: number | null;
  links: { internal: number; external: number } | null;
  draftedAt: string | null;
  liveAt: string | null;
  refreshDueAt: string | null;
  lastCrawledAt: string | null;
}

export interface GradeDimensionVM {
  key: string;
  label: string;
  score: number;
  max: number;
  note: string;
}

export interface CategoryPageDetailVM extends CategoryPageVM {
  h1: string | null;
  intro: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  draftFailed: boolean; // the last (re)draft hit a technical error
  seoTitle: string | null;
  metaDescription: string | null;
  faqJsonLd: string | null;
  gradeNotes: string | null;
  gradeDimensions: GradeDimensionVM[];
  fixNotes: string[];
  facts: CatalogFacts | null;
  brief: CategoryBrief | null;
  hasPolicies: boolean;
  threshold: number;
  drifted: boolean; // blocks changed since they were marked live
}

type Row = NonNullable<Awaited<ReturnType<typeof prisma.categoryPage.findUnique>>>;

function words(row: Row): number | null {
  if (!row.bodyHtml) return null;
  const text = `${row.intro ?? ""} ${row.bodyHtml.replace(/<[^>]+>/g, " ")}`;
  return text.split(/\s+/).filter(Boolean).length;
}

function tierOf(row: Row): 1 | 2 | 3 {
  return (row.tier === 1 || row.tier === 3 ? row.tier : 2) as 1 | 2 | 3;
}

function toVM(row: Row, domain: string): CategoryPageVM {
  return {
    id: row.id,
    handle: row.handle,
    url: row.url,
    title: row.h1 ?? row.liveTitle ?? row.handle,
    liveTitle: row.liveTitle,
    productCount: row.productCount,
    liveHasContent: row.liveHasContent,
    removed: row.removedAt != null,
    tier: tierOf(row),
    locality: localityFor(row.handle),
    targetKeyword: row.targetKeyword,
    secondaryKeywords: row.secondaryKeywords,
    status: row.status,
    overall: row.overall,
    factIssues: row.factIssues,
    words: words(row),
    links: row.bodyHtml ? linkCounts(row.bodyHtml, domain) : null,
    draftedAt: row.draftedAt?.toISOString() ?? null,
    liveAt: row.liveAt?.toISOString() ?? null,
    refreshDueAt: row.refreshDueAt?.toISOString() ?? null,
    lastCrawledAt: row.lastCrawledAt?.toISOString() ?? null,
  };
}

async function domainOf(businessId: string): Promise<string> {
  const biz = await prisma.business.findUnique({ where: { id: businessId }, select: { domain: true } });
  return biz?.domain ?? "";
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
  const [rows, domain] = await Promise.all([
    prisma.categoryPage.findMany({ where: { businessId }, orderBy: [{ tier: "asc" }, { handle: "asc" }] }),
    domainOf(businessId),
  ]);
  return rows.map((r) => toVM(r, domain));
}

/** Priority for the human's next action: things to review first, then the
 *  most valuable page to draft. Within a status, hubs first, then more products. */
const STATUS_RANK: Record<CategoryStatus, number> = {
  DRAFT_READY: 0,
  NEEDS_FIX: 1,
  NEEDS_REFRESH: 2,
  NOT_STARTED: 3,
  DRAFTING: 4,
  LIVE: 5,
};

export function sortByPriority(pages: CategoryPageVM[]): CategoryPageVM[] {
  return [...pages].sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      a.tier - b.tier ||
      (b.productCount ?? 0) - (a.productCount ?? 0) ||
      a.handle.localeCompare(b.handle),
  );
}

/** The one page the operator should look at next, or null when everything's live. */
export function nextUp(pages: CategoryPageVM[]): CategoryPageVM | null {
  const live = pages.filter((p) => !p.removed && p.status !== "LIVE");
  return sortByPriority(live)[0] ?? null;
}

export async function listLiveCategoryPages(bizId?: string): Promise<CategoryPageVM[]> {
  const all = await listCategoryPages(bizId);
  return all
    .filter((p) => p.status === "LIVE" || p.status === "NEEDS_REFRESH")
    .sort((a, b) => (a.status === "NEEDS_REFRESH" ? -1 : 1) - (b.status === "NEEDS_REFRESH" ? -1 : 1) || (b.liveAt ?? "").localeCompare(a.liveAt ?? ""));
}

export async function getCategoryPage(id: string): Promise<CategoryPageDetailVM | null> {
  if (!hasDatabase) return null;
  const row = await prisma.categoryPage.findUnique({ where: { id } });
  if (!row) return null;
  const biz = await prisma.business.findUnique({ where: { id: row.businessId } });
  const parse = <T,>(s: string | null): T | null => {
    if (!s) return null;
    try {
      return JSON.parse(s) as T;
    } catch {
      return null;
    }
  };
  const facts = parse<CatalogFacts>(row.factsJson);
  const brief = parse<CategoryBrief>(row.briefJson);
  const grade = parse<{ dimensions?: Record<string, { score: number; max: number; note: string }> }>(row.gradeJson);
  const gradeDimensions: GradeDimensionVM[] = RUBRIC.map((d) => ({
    key: d.key,
    label: d.label,
    score: grade?.dimensions?.[d.key]?.score ?? 0,
    max: d.max,
    note: grade?.dimensions?.[d.key]?.note ?? "",
  }));
  return {
    ...toVM(row, biz?.domain ?? ""),
    h1: row.h1,
    intro: row.intro,
    bodyHtml: row.bodyHtml,
    bodyText: row.bodyHtml ? bodyAsText(row.bodyHtml) : null,
    draftFailed: Boolean(row.gradeNotes?.startsWith("Draft failed")),
    seoTitle: row.seoTitle,
    metaDescription: row.metaDescription,
    faqJsonLd: row.faqJsonLd,
    gradeNotes: row.gradeNotes,
    gradeDimensions: grade ? gradeDimensions : [],
    fixNotes: row.fixNotes,
    facts,
    brief,
    hasPolicies: Boolean(biz?.policyMd),
    threshold: biz?.qualityThreshold ?? 85,
    drifted: row.liveSnapshot != null && row.liveSnapshot !== snapshotHash(row),
  };
}

// ── Drafting ───────────────────────────────────────────────────

/** Store policy text, refreshed weekly from the public site. */
async function storePolicies(businessId: string, domain: string): Promise<string> {
  const biz = await prisma.business.findUnique({
    where: { id: businessId },
    select: { policyMd: true, policyFetchedAt: true },
  });
  const fresh = biz?.policyFetchedAt && Date.now() - biz.policyFetchedAt.getTime() < POLICY_TTL_DAYS * 86400000;
  if (biz?.policyMd && fresh) return biz.policyMd;
  const text = await fetchStorePolicies(domain).catch(() => "");
  if (text) {
    await prisma.business
      .update({ where: { id: businessId }, data: { policyMd: text, policyFetchedAt: new Date() } })
      .catch(() => {});
    return text;
  }
  return biz?.policyMd ?? "";
}

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
  const [links, houseRules, policies] = await Promise.all([
    linkTargets(biz.id, row, facts),
    buildContentGuidance(biz.id).catch(() => ""),
    storePolicies(biz.id, biz.domain),
  ]);
  const fixNotes = [...row.fixNotes, ...(note?.trim() ? [note.trim()] : [])];
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
      tier: tierOf(row),
      keywordSeed: row.targetKeyword ?? row.handle.replace(/-/g, " "),
      locality: localityFor(row.handle),
    },
    facts,
    links,
    policies,
  };
}

interface Assembled {
  draft: CategoryDraftJson;
  bodyHtml: string;
  issues: string[];
  grade: GradeResult;
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
      pageType: "e-commerce CATEGORY page (commercial intent — the shopper is choosing what to buy from the product grid above this copy)",
      gradingNotes:
        "Judge as a category page, not a blog: intentMatch = does it help a buyer decide and find the right products; eeat = real catalog facts, linked standards (FTC/NFDA), no invented experts or credentials — do not penalize the absence of a named author; aeo = answer-first intro and self-contained FAQ answers; linking = internal hub-and-spoke links plus 2–3 authority links; conversion = a clear path back to the grid; readability = no repetition (the intro is the only summary).",
      targetKeyword: brief.primaryKeyword,
      angle: brief.angle,
      wordTarget: brief.wordTarget,
      outline: brief.sections.map((s) => s.heading),
      questions: brief.questions,
    }),
    threshold,
  );
  return { draft, bodyHtml, issues, grade };
}

/**
 * Write (or rewrite) the paste-ready content for one collection page:
 * brief → draft → editor tightening pass → fact-check + grade → up to two
 * targeted revision loops. If it still fails, the draft is kept and the page
 * is marked NEEDS_FIX with the issues visible so a human can steer it.
 */
export async function draftCategoryPage(id: string, opts: { note?: string } = {}): Promise<CategoryPageVM> {
  requireDb();
  const row = await prisma.categoryPage.findUnique({ where: { id } });
  if (!row) throw new Error("Category page not found");
  const biz = await prisma.business.findUnique({ where: { id: row.businessId } });
  const threshold = biz?.qualityThreshold ?? 85;
  const domain = biz?.domain ?? "";
  const hadDraft = Boolean(row.bodyHtml);

  await prisma.categoryPage.update({ where: { id }, data: { status: "DRAFTING" } });
  try {
    const ctx = await contextFor(row, opts.note);
    const brief = await buildCategoryBrief(ctx);
    const first = await writeCategoryDraft(ctx, brief);
    const tightened = await tightenCategoryDraft(ctx, brief, first).catch((e) => {
      console.error("[category] editor pass failed, using draft as-is:", e instanceof Error ? e.message : e);
      return first;
    });
    let result = await assembleAndCheck(ctx, brief, tightened, threshold);

    for (let loop = 0; loop < MAX_REVISE_LOOPS; loop++) {
      const ok = result.issues.length === 0 && result.grade.overall >= threshold;
      if (ok) break;
      const toFix = [
        ...result.issues,
        ...(result.grade.overall < threshold
          ? [`Grader (${result.grade.overall}/${threshold}): ${result.grade.feedback}`]
          : []),
      ];
      const revised = await reviseCategoryDraft(ctx, brief, result.draft, toFix);
      const next = await assembleAndCheck(ctx, brief, revised, threshold);
      // Keep the better of the two — a revision must not make things worse.
      const better =
        next.issues.length < result.issues.length ||
        (next.issues.length === result.issues.length && next.grade.overall >= result.grade.overall);
      if (better) result = next;
    }

    const ok = result.issues.length === 0 && result.grade.overall >= threshold;
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
        overall: result.grade.overall,
        gradeNotes: result.grade.feedback,
        gradeJson: JSON.stringify({ overall: result.grade.overall, dimensions: result.grade.dimensions }),
        draftJson: JSON.stringify(result.draft),
        factIssues: result.issues,
        fixNotes: ctx.fixNotes,
        draftedAt: new Date(),
      },
    });
    console.log(
      `[category] ${row.handle}: ${ok ? "DRAFT_READY" : "NEEDS_FIX"} — grade ${result.grade.overall}/${threshold}, ${wordCount(result.draft)} words, ${result.issues.length} issue(s)`,
    );
    return toVM(updated, domain);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[category] draft failed for ${row.handle}:`, msg);
    const updated = await prisma.categoryPage.update({
      where: { id },
      data: { status: hadDraft ? "NEEDS_FIX" : "NOT_STARTED", gradeNotes: `Draft failed: ${msg}` },
    });
    return toVM(updated, domain);
  }
}

// ── Targeted passage fix ───────────────────────────────────────

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const stripMd = (s: string) =>
  s
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`#>]/g, "")
    .replace(/^\s*([-•]|\d+[.)])\s+/gm, "");

/** Find which block of the draft contains the highlighted text. */
function locatePassage(draft: CategoryDraftJson, selected: string): PassageTarget | null {
  const sel = norm(selected);
  // A long selection may span blocks; match on its opening words.
  const probe = sel.length > 80 ? sel.slice(0, 80) : sel;
  if (!probe) return null;
  const has = (t: string) => norm(stripMd(t)).includes(probe);
  if (has(draft.h1)) return { kind: "h1" };
  if (has(draft.intro)) return { kind: "intro" };
  for (let i = 0; i < draft.sections.length; i++) {
    if (has(draft.sections[i].heading) || has(draft.sections[i].bodyMarkdown)) return { kind: "section", index: i };
  }
  for (let i = 0; i < draft.faqs.length; i++) {
    if (has(draft.faqs[i].question) || has(draft.faqs[i].answer)) return { kind: "faq", index: i };
  }
  if (has(draft.whyUs)) return { kind: "whyUs" };
  return null;
}

/**
 * Rewrite ONE highlighted passage per the operator's instruction, then
 * re-assemble, re-check and re-grade the page. Fast (one small model call +
 * a grade) and surgical — nothing else on the page changes.
 */
export async function fixCategoryPassage(
  id: string,
  selectedText: string,
  instruction: string,
): Promise<{ ok: boolean; message: string }> {
  requireDb();
  const row = await prisma.categoryPage.findUnique({ where: { id } });
  if (!row?.bodyHtml) return { ok: false, message: "Nothing to fix yet — draft the page first." };
  if (!row.draftJson) {
    return { ok: false, message: "This draft predates passage fixes — redraft once, then highlight-to-fix works." };
  }
  let draft: CategoryDraftJson;
  try {
    draft = JSON.parse(row.draftJson) as CategoryDraftJson;
  } catch {
    return { ok: false, message: "Couldn't read the stored draft — redraft the page." };
  }
  const target = locatePassage(draft, selectedText);
  if (!target) {
    return { ok: false, message: "Couldn't find that exact text in the draft. Try highlighting a shorter piece inside one paragraph." };
  }

  const biz = await prisma.business.findUnique({ where: { id: row.businessId } });
  const threshold = biz?.qualityThreshold ?? 85;
  const ctx = await contextFor(row);
  const brief = row.briefJson ? (JSON.parse(row.briefJson) as CategoryBrief) : await buildCategoryBrief(ctx);

  const replacement = await rewriteCategoryPassage(ctx, draft, target, selectedText, instruction);
  if (!replacement.trim()) return { ok: false, message: "The rewrite came back empty — try rephrasing the instruction." };

  const next: CategoryDraftJson = JSON.parse(JSON.stringify(draft)) as CategoryDraftJson;
  switch (target.kind) {
    case "h1":
      next.h1 = replacement;
      break;
    case "intro":
      next.intro = replacement;
      break;
    case "section":
      next.sections[target.index].bodyMarkdown = replacement;
      break;
    case "faq":
      next.faqs[target.index].answer = replacement;
      break;
    case "whyUs":
      next.whyUs = replacement;
      break;
  }

  const result = await assembleAndCheck(ctx, brief, next, threshold);
  const ok = result.issues.length === 0 && result.grade.overall >= threshold;
  const where =
    target.kind === "section"
      ? `“${draft.sections[target.index].heading}”`
      : target.kind === "faq"
        ? "an FAQ answer"
        : target.kind;
  await prisma.categoryPage.update({
    where: { id },
    data: {
      status: row.status === "LIVE" ? "LIVE" : ok ? "DRAFT_READY" : "NEEDS_FIX",
      h1: next.h1.trim(),
      intro: next.intro.trim(),
      bodyHtml: result.bodyHtml,
      faqJsonLd: faqJsonLd(next.faqs),
      overall: result.grade.overall,
      gradeNotes: result.grade.feedback,
      gradeJson: JSON.stringify({ overall: result.grade.overall, dimensions: result.grade.dimensions }),
      draftJson: JSON.stringify(next),
      factIssues: result.issues,
      fixNotes: [...row.fixNotes, `${where}: ${instruction.trim()}`],
      draftedAt: new Date(),
    },
  });
  return {
    ok: true,
    message: ok
      ? `Rewrote ${where}. Score ${result.grade.overall}.`
      : `Rewrote ${where}. Score ${result.grade.overall} — ${result.issues.length ? result.issues[0] : "still under the bar; see Score."}`,
  };
}

/** Draft every undrafted page in a tier, one after another (bounded). */
export async function draftCategoryTier(tier: number, bizId?: string, limit = 12): Promise<number> {
  requireDb();
  const businessId = bizId ?? (await activeBizId());
  const rows = await prisma.categoryPage.findMany({
    where: { businessId, tier, removedAt: null, status: { in: ["NOT_STARTED", "NEEDS_FIX"] } },
    orderBy: [{ productCount: "desc" }, { handle: "asc" }],
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
