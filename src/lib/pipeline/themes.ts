// "Ideas from my themes & keywords": the operator types themes and/or keywords
// (one per line), the engine suggests titles around each, every title shows its
// closest existing post (same meaning-based check as everywhere else), the
// operator edits and ticks the ones they want, and those become blogs through
// the normal brief → write → grade → Ready pipeline.
//
// Every suggestion is stored (ThemeSuggestion), picked or not, so the same
// theme is not suggested again: earlier titles for a theme are excluded from
// new suggestions, count in every later duplicate check, and the auto ideator
// is told which themes the operator already handled.

import { prisma } from "@/lib/db";
import { structured, MODELS } from "@/lib/ai/claude";
import { aiEnabled } from "@/lib/env";
import { industryFor } from "@/lib/categories/industry";
import { getLivePosts } from "@/lib/pipeline/live-posts";
import { checkTopics, closestFields, existingTopics, type TopicMatch } from "@/lib/pipeline/similarity";
import { findDuplicate } from "@/lib/pipeline/dedupe";

export interface ThemeRequest {
  lines: string[];
  kind: "LOCAL" | "EVERGREEN";
  pillarId?: string | null;
  perLine?: number;
}

export interface ThemeSuggestionVM {
  id: string;
  title: string;
  duplicate: boolean;
  closest: { title: string; url?: string; source: string; similarity: number } | null;
}

export interface ThemeLineResult {
  theme: string;
  /** Set when this theme was used before: how many earlier titles were avoided. */
  usedBefore: { at: string; titles: number } | null;
  suggestions: ThemeSuggestionVM[];
}

const MAX_LINES = 10;
const MAX_PER_LINE = 10;

function normLine(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** A title with the typed line's words taken out ("" when nothing is left). */
function withoutLine(title: string, line: string): string {
  const drop = new Set(normLine(line).split(" "));
  return normLine(title)
    .split(" ")
    .filter((w) => w && !drop.has(w))
    .join(" ");
}

function toVM(id: string, title: string, m: TopicMatch): ThemeSuggestionVM {
  return {
    id,
    title,
    duplicate: m.duplicate,
    closest: m.closest
      ? { title: m.closest.title, url: m.closest.url, source: m.closest.source, similarity: m.similarity }
      : null,
  };
}

const SUGGEST_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { line: { type: "integer" }, titles: { type: "array", items: { type: "string" } } },
        required: ["line", "titles"],
      },
    },
  },
  required: ["lines"],
};

/** Offline titles (no API key): simple, clearly templated variations. */
function offlineTitles(theme: string, n: number, local: boolean): string[] {
  const t = theme.trim();
  const base = local
    ? [`${t} in Texas: What to Know`, `${t} in California: Rules and Costs`, `${t} in Florida: A Buyer's Guide`, `${t} in New York: Step by Step`, `${t} in Ohio: Common Questions`]
    : [`${t}: A Complete Buyer's Guide`, `How Much Does ${t} Cost?`, `${t}: Common Mistakes to Avoid`, `${t} Step by Step`, `${t}: Questions to Ask First`];
  const out: string[] = [];
  for (let i = 0; out.length < n; i++) out.push(i < base.length ? base[i] : `${t}: Guide ${i + 1}`);
  return out;
}

/**
 * Suggest titles for each theme/keyword line, checked against every existing
 * post, idea, draft and earlier suggestion. Stores every suggestion.
 */
export async function suggestThemeTitles(businessId: string, req: ThemeRequest): Promise<ThemeLineResult[]> {
  const lines = [...new Set(req.lines.map((l) => l.trim()).filter(Boolean))].slice(0, MAX_LINES);
  if (!lines.length) throw new Error("Type at least one theme or keyword.");
  const perLine = Math.max(1, Math.min(MAX_PER_LINE, Math.round(req.perLine ?? 5)));

  const live = await getLivePosts(businessId);
  if (!live.ok) throw new Error(live.warning ?? "The store's posts couldn't be read, so titles can't be checked for repeats.");

  const business = await prisma.business.findUnique({ where: { id: businessId }, include: { pillars: true } });
  if (!business) throw new Error("Store not found.");
  const pillar = req.pillarId ? business.pillars.find((p) => p.id === req.pillarId) ?? null : null;
  const industry = industryFor(business);
  const local = req.kind === "LOCAL";

  // What each theme already produced, so new suggestions don't repeat it.
  const earlier = await prisma.themeSuggestion.findMany({
    where: { businessId },
    select: { theme: true, title: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const earlierFor = (line: string) => earlier.filter((e) => normLine(e.theme) === normLine(line));

  // Ask for extra titles per line: some will turn out to be repeats.
  const ask = perLine + 4;
  let raw: string[][];
  if (!aiEnabled()) {
    raw = lines.map((l) => offlineTitles(l, ask, local));
  } else {
    const { lines: out } = await structured<{ lines: { line: number; titles: string[] }[] }>({
      model: MODELS.ideas,
      cheap: true,
      maxTokens: 6000,
      schema: SUGGEST_SCHEMA,
      system:
        `You are a senior SEO content strategist for a store that sells ${industry.label}. ` +
        `You write blog titles that target real searches and are worth writing.` +
        (industry.primer ? `\n\n${industry.primer}` : ""),
      prompt:
        `STORE: ${business.name}\n\nPROFILE:\n${(business.profileMd ?? business.name).slice(0, 3000)}\n\n` +
        `The operator typed these themes and/or keywords (one per line). For EACH line, write ${ask} distinct blog article titles built around it.\n` +
        `- ${local ? "LOCAL: every title targets a specific US state or city/metro (different places across the titles, most populous first)." : "EVERGREEN: not tied to a place."}\n` +
        (pillar ? `- They belong to the content pillar "${pillar.name}"${pillar.description ? ` (${pillar.description})` : ""}.\n` : "") +
        `- If a line is a keyword (a search phrase), keep that phrase in each title where it reads naturally.\n` +
        `- Each title answers a different, specific question a buyer would search. No two titles on the same question.\n` +
        `- Never repeat or lightly reword a title from the "already exists" lists below.\n` +
        `- No people's names, no personas, no clickbait.\n\n` +
        lines
          .map((l, i) => {
            const prev = earlierFor(l).map((e) => `  - ${e.title}`);
            return `LINE ${i}: ${l}${prev.length ? `\n  Titles already suggested for this line before (do not repeat):\n${prev.slice(0, 40).join("\n")}` : ""}`;
          })
          .join("\n\n") +
        `\n\nPOSTS ALREADY ON THE STORE (do not repeat):\n${live.posts.slice(0, 600).map((p) => `- ${p.title}`).join("\n")}`,
    });
    raw = lines.map((_, i) => out.find((o) => o.line === i)?.titles ?? []);
  }

  // One meaning-based check for every title (shared corpus), then keep the best
  // perLine per line: titles that aren't repeats first, then the closest calls.
  const corpus = await existingTopics(businessId);
  const flat = raw.flatMap((titles, li) =>
    titles.map((t) => ({ li, title: t.trim().replace(/\s+/g, " ") })).filter((x) => x.title),
  );
  const matches = await checkTopics(businessId, flat.map((x) => x.title), { corpus });

  const results: ThemeLineResult[] = [];
  for (const [li, line] of lines.entries()) {
    const prior = earlierFor(line);
    const mine = flat
      .map((x, i) => ({ ...x, m: matches[i] }))
      .filter((x) => x.li === li)
      // Same title twice in this batch: keep the first. Titles for a keyword
      // all repeat that keyword, so compare what each adds beyond it.
      .filter((x, i, arr) => {
        const rest = (t: string) => withoutLine(t, line);
        const mineRest = rest(x.title);
        return !mineRest || !findDuplicate(mineRest, arr.slice(0, i).map((y) => rest(y.title)).filter(Boolean));
      });
    mine.sort((a, b) => Number(a.m.duplicate) - Number(b.m.duplicate) || a.m.similarity - b.m.similarity);
    const keep = mine.slice(0, perLine);

    const suggestions: ThemeSuggestionVM[] = [];
    for (const k of keep) {
      const row = await prisma.themeSuggestion.create({
        data: {
          businessId,
          theme: line,
          kind: req.kind,
          pillarId: pillar?.id ?? null,
          title: k.title,
          ...closestFields(k.m),
        },
      });
      suggestions.push(toVM(row.id, k.title, k.m));
    }
    results.push({
      theme: line,
      usedBefore: prior.length ? { at: prior[prior.length - 1].createdAt.toISOString(), titles: prior.length } : null,
      suggestions,
    });
  }
  return results;
}

export interface PickThemeResult {
  started: { ideaId: string; title: string }[];
  skipped: { title: string; reason: string }[];
}

/**
 * Turn the ticked (optionally edited) suggestions into "From my themes" ideas.
 * An edited title is checked again; if the edit turned it into a repeat it is
 * skipped and reported. Returns the ideas created; the caller starts the blogs.
 */
export async function pickThemeTitles(
  businessId: string,
  picks: { id: string; title: string }[],
): Promise<PickThemeResult> {
  const out: PickThemeResult = { started: [], skipped: [] };
  if (!picks.length) return out;
  const rows = await prisma.themeSuggestion.findMany({
    where: { businessId, id: { in: picks.map((p) => p.id) } },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));

  const edited = picks.filter((p) => {
    const r = byId.get(p.id);
    return r && p.title.trim() && p.title.trim() !== r.title;
  });
  // Compare edits against everything except the ticked suggestions themselves
  // (an edit must not count as a repeat of its own original wording).
  const own = new Set(rows.map((r) => normLine(r.title)));
  const editedChecks = edited.length
    ? await checkTopics(businessId, edited.map((p) => p.title.trim()), {
        corpus: (await existingTopics(businessId)).filter((t) => !(t.source === "theme" && own.has(normLine(t.title)))),
      })
    : [];
  const editedMatch = new Map(edited.map((p, i) => [p.id, editedChecks[i]]));

  for (const p of picks) {
    const r = byId.get(p.id);
    if (!r) continue;
    if (r.picked && r.ideaId) {
      out.skipped.push({ title: r.title, reason: "Already used." });
      continue;
    }
    const title = p.title.trim() || r.title;
    const m = editedMatch.get(p.id);
    if (m?.duplicate && m.closest) {
      out.skipped.push({
        title,
        reason: `Your edit repeats “${m.closest.title}” (${m.similarity}% similar), so it wasn't started.`,
      });
      continue;
    }
    const closest = m
      ? closestFields(m)
      : { closestTitle: r.closestTitle, closestUrl: r.closestUrl, closestSource: r.closestSource, closestSimilarity: r.closestSimilarity };
    const idea = await prisma.idea.create({
      data: {
        businessId,
        pillarId: r.pillarId,
        title,
        targetKeyword: r.theme, // the line the operator typed is the main target keyword
        origin: "THEMES",
        theme: r.theme,
        kind: r.kind,
        score: 80,
        rationale: `From my themes: “${r.theme}”.`,
        status: "PROPOSED",
        ...closest,
        closestCheckedAt: new Date(),
      },
    });
    await prisma.themeSuggestion.update({ where: { id: r.id }, data: { picked: true, ideaId: idea.id, title } });
    out.started.push({ ideaId: idea.id, title });
  }
  return out;
}

/** Themes the operator already handled (newest first), for the auto ideator. */
export async function usedThemes(businessId: string, limit = 40): Promise<string[]> {
  const rows = await prisma.themeSuggestion.findMany({
    where: { businessId },
    select: { theme: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const k = normLine(r.theme);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r.theme);
    if (out.length >= limit) break;
  }
  return out;
}
