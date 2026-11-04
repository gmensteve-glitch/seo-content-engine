// Meaning-based duplicate check for blog topics.
//
// Every candidate title is compared against EVERYTHING the store already has or
// the engine ever made: every article on Shopify (any status), every idea (any
// status), every draft, and every title the themes box ever suggested. Word
// overlap alone misses rewordings ("Can You Bury a Headstone in Winter?" vs
// "Installing a Grave Marker When the Ground Is Frozen"), so a model judges
// meaning and search intent. The word-overlap check (dedupe.ts) still runs as
// a backstop: a title it flags is always a duplicate.
//
// The existing-topic list is sent as a cached system block, so checking a
// batch costs a fraction of a cent. Callers decide what to do when the check
// itself fails; it throws rather than guessing "not a duplicate".

import { prisma } from "@/lib/db";
import { structured, MODELS } from "@/lib/ai/claude";
import { aiEnabled } from "@/lib/env";
import { getLivePosts } from "@/lib/pipeline/live-posts";
import { topicSimilarity, DUPLICATE_THRESHOLD } from "@/lib/pipeline/dedupe";

export type TopicSource = "shopify" | "idea" | "draft" | "theme";

export interface ExistingTopic {
  title: string;
  source: TopicSource;
  url?: string;
  /** Idea/draft id, so a check can leave out the candidate's own records. */
  ideaId?: string;
  draftId?: string;
}

export interface TopicMatch {
  /** The closest existing topic, or null when nothing exists to compare with. */
  closest: ExistingTopic | null;
  /** 0–100: how close in meaning and search intent. */
  similarity: number;
  /** True when writing this would repeat the closest topic. */
  duplicate: boolean;
  reason: string;
}

/** A model "duplicate" verdict needs at least this similarity to count. */
const DUPLICATE_MIN_SIMILARITY = 75;
const MAX_CORPUS = 4000;
const BATCH = 15;

function norm(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Everything a new topic must not repeat. Throws when the store's live-post
 * list can't be read: comparing against an empty list would pass every repeat.
 */
export async function existingTopics(businessId: string): Promise<ExistingTopic[]> {
  const [live, ideas, drafts, themes] = await Promise.all([
    getLivePosts(businessId),
    prisma.idea.findMany({
      where: { businessId },
      select: { id: true, title: true, brief: { select: { draft: { select: { id: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.draft.findMany({
      where: { businessId },
      select: { id: true, title: true, brief: { select: { ideaId: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.themeSuggestion.findMany({
      where: { businessId, picked: false },
      select: { title: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (!live.ok) throw new Error(live.warning ?? "The store's live-post list couldn't be read.");

  const out: ExistingTopic[] = [];
  const seen = new Set<string>();
  const add = (t: ExistingTopic) => {
    const k = norm(t.title);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };
  // Shopify first: when an idea repeats a live post, name the post.
  for (const p of live.posts) add({ title: p.title, source: "shopify", url: p.url });
  for (const d of drafts) add({ title: d.title, source: "draft", draftId: d.id, ideaId: d.brief?.ideaId });
  for (const i of ideas) add({ title: i.title, source: "idea", ideaId: i.id, draftId: i.brief?.draft?.id });
  for (const t of themes) add({ title: t.title, source: "theme" });
  return out.slice(0, MAX_CORPUS);
}

const SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          candidate: { type: "integer" },
          closest: { type: "integer" },
          similarity: { type: "integer" },
          duplicate: { type: "boolean" },
          reason: { type: "string" },
        },
        required: ["candidate", "closest", "similarity", "duplicate", "reason"],
      },
    },
  },
  required: ["results"],
};

const SYSTEM = `You check whether proposed blog articles would repeat articles a store already has.

Two titles are DUPLICATES when a reader who searched for one would be fully served by the other: same subject, same question, same search intent, even if worded completely differently or one is a narrower slice of the other that the existing article already answers.
They are NOT duplicates when they answer a genuinely different question, target a different buyer need, or (important) name a different US state, city or region: "Headstone rules in Ohio" and "Headstone rules in Texas" are two different pages on purpose.

Similarity 0–100 means closeness in meaning and intent: 90–100 the same article; 75–89 the same question reworded or narrowed; 50–74 related topic, different question; below 50 unrelated.`;

function corpusBlock(corpus: ExistingTopic[]): string {
  return `EXISTING ARTICLES AND TOPICS (#index: title):\n${corpus.map((t, i) => `#${i}: ${t.title}`).join("\n")}`;
}

/** The closest existing topic by word overlap (the backstop). */
function lexicalBest(title: string, corpus: ExistingTopic[]): { index: number; score: number } {
  let best = { index: -1, score: 0 };
  corpus.forEach((t, i) => {
    const s = topicSimilarity(title, t.title);
    if (s > best.score) best = { index: i, score: s };
  });
  return best;
}

/**
 * Check candidate titles against existing topics (`existingTopics` unless a
 * corpus is passed). Leaves out records with the given idea/draft ids, so a
 * piece is never its own duplicate. One result per candidate, in order.
 */
export async function checkTopics(
  businessId: string,
  titles: string[],
  opts: { corpus?: ExistingTopic[]; excludeIdeaIds?: string[]; excludeDraftIds?: string[] } = {},
): Promise<TopicMatch[]> {
  const exIdeas = new Set(opts.excludeIdeaIds ?? []);
  const exDrafts = new Set(opts.excludeDraftIds ?? []);
  const corpus = (opts.corpus ?? (await existingTopics(businessId))).filter(
    (t) => !(t.ideaId && exIdeas.has(t.ideaId)) && !(t.draftId && exDrafts.has(t.draftId)),
  );
  if (!titles.length) return [];
  if (!corpus.length) {
    return titles.map(() => ({ closest: null, similarity: 0, duplicate: false, reason: "Nothing to compare with yet." }));
  }

  const lexical = titles.map((t) => lexicalBest(t, corpus));
  const results: TopicMatch[] = titles.map((_, i) => {
    const lx = lexical[i];
    return {
      closest: lx.index >= 0 ? corpus[lx.index] : null,
      similarity: Math.round(lx.score * 100),
      duplicate: lx.score >= DUPLICATE_THRESHOLD,
      reason: lx.score >= DUPLICATE_THRESHOLD ? "Same topic words." : "",
    };
  });
  if (!aiEnabled()) return results; // offline: word overlap only

  const context = [SYSTEM, corpusBlock(corpus)];
  for (let start = 0; start < titles.length; start += BATCH) {
    const batch = titles.slice(start, start + BATCH);
    const { results: judged } = await structured<{
      results: { candidate: number; closest: number; similarity: number; duplicate: boolean; reason: string }[];
    }>({
      model: MODELS.grader,
      effort: "low",
      maxTokens: 4000,
      schema: SCHEMA,
      context,
      prompt:
        `For each PROPOSED title, find the single closest existing article or topic above (by meaning and search intent, not shared words), ` +
        `give its #index (-1 only if the list has nothing remotely related), a similarity 0–100, whether writing the proposal would be a duplicate, ` +
        `and a short reason (one sentence).\n\nPROPOSED:\n` +
        batch.map((t, i) => `${i}: ${t}`).join("\n"),
    });
    for (const j of judged) {
      const i = start + j.candidate;
      if (j.candidate < 0 || j.candidate >= batch.length) continue;
      const lx = results[i];
      const closest = j.closest >= 0 && j.closest < corpus.length ? corpus[j.closest] : null;
      const sim = Math.max(0, Math.min(100, Math.round(j.similarity)));
      // Keep whichever match is stronger; a word-overlap duplicate always stands.
      if (closest && sim >= lx.similarity) {
        results[i] = {
          closest,
          similarity: sim,
          duplicate: lx.duplicate || (j.duplicate && sim >= DUPLICATE_MIN_SIMILARITY),
          reason: j.reason,
        };
      } else if (j.duplicate && sim >= DUPLICATE_MIN_SIMILARITY) {
        results[i] = { ...lx, duplicate: true, reason: j.reason };
      }
    }
  }
  return results;
}

/** Fields to store a match on an Idea / ThemeSuggestion row. */
export function closestFields(m: TopicMatch) {
  return {
    closestTitle: m.closest?.title ?? null,
    closestUrl: m.closest?.url ?? null,
    closestSource: m.closest?.source ?? null,
    closestSimilarity: m.closest ? m.similarity : null,
  };
}
