// The idea-generation agent — keeps the top of the funnel full of GOOD ideas.
//
// It is the "supply" side of the autopilot loop: given the business profile,
// its content pillars, and a feedback signal (what's already published + how it
// performs), it proposes fresh article ideas that (a) don't duplicate existing
// content, (b) target a real search query, and (c) advance topical authority in
// an under-served pillar. Each idea is scored 0–100 so the best rise first.
//
// Degrades to deterministic, clearly-labeled offline ideas when no
// ANTHROPIC_API_KEY is set, so the loop still turns with zero credentials.

import { structured, MODELS } from "@/lib/ai/claude";
import { aiEnabled } from "@/lib/env";

export interface IdeaProposal {
  title: string;
  pillar: string; // must map to one of the business's pillars (or "General")
  targetKeyword: string;
  score: number; // 0–100 opportunity score
  rationale: string; // why this is worth writing now
  kind: "LOCAL" | "EVERGREEN"; // geo-targeted vs informational/evergreen
}

export interface IdeationContext {
  businessName: string;
  profileMd: string;
  brandVoice?: string;
  /** The business's content pillars (topical clusters). */
  pillars: string[];
  /** Titles already published or in-flight — so we never duplicate. */
  existingTitles: string[];
  /**
   * Feedback signal from live content: which pillars are already well covered,
   * which are thin, and (when GSC is connected) what's winning vs decaying.
   * Free-text so it degrades gracefully before analytics are wired.
   */
  performanceNote?: string;
  count: number;
  /** How many of `count` should be LOCAL (geo-targeted) vs EVERGREEN. */
  targetLocal?: number;
  targetEvergreen?: number;
}

const IDEA_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    ideas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          pillar: { type: "string" },
          targetKeyword: { type: "string" },
          score: { type: "integer" },
          rationale: { type: "string" },
          kind: { type: "string", enum: ["LOCAL", "EVERGREEN"] },
        },
        required: ["title", "pillar", "targetKeyword", "score", "rationale", "kind"],
      },
    },
  },
  required: ["ideas"],
};

const IDEATION_SYSTEM = `You are a senior SEO content strategist. You propose article ideas that build durable topical authority and win qualified organic traffic.

Rules for every idea:
- Target a REAL search query a human would type — specific, not generic ("how much does a pine casket cost" not "caskets").
- Match clear search intent (informational, commercial, or transactional) that fits the business.
- Do NOT duplicate or lightly reword anything in the existing-content list. Find genuine gaps.
- Prefer ideas that strengthen an under-served pillar, or that naturally link to/from existing content (topic clusters).
- Favor buyer-journey coverage and questions with real "People Also Ask" demand.
- Score 0–100 by opportunity = (search demand + intent fit + ease of ranking + business value). Be honest; reserve 85+ for genuinely strong plays.
- Ground every idea in the business profile. Never invent facts about the business.

Each idea is either LOCAL or EVERGREEN — set "kind" accordingly:
- LOCAL = geo-targeted, high commercial intent, tied to a specific US city, metro, or state (e.g. "Caskets in San Diego: delivery times & which funeral homes accept them", "Texas casket delivery & burial laws"). Great local ideas answer a buyer's real question about THAT place — delivery speed to the area, which local funeral homes accept online caskets, state/city rules, local cemeteries. Never a thin "we ship to [City]" template; each must have genuine local substance. Prefer metros/states NOT already in the existing-content list.
- EVERGREEN = informational/authority content not tied to a place ("How to choose a casket", "What is a green burial?").`;

/** Deterministic offline ideas, derived from pillars. Clearly labeled. */
function offlineIdeas(ctx: IdeationContext): IdeaProposal[] {
  const NOTE = "Generated offline (no ANTHROPIC_API_KEY) — placeholder idea.";
  const pillars = ctx.pillars.length ? ctx.pillars : ["General"];
  const seed = [
    (p: string) => `${p}: the complete buyer's guide`,
    (p: string) => `How much does ${p.toLowerCase()} cost? (2026 breakdown)`,
    (p: string) => `${p} vs. the alternatives: how to choose`,
    (p: string) => `Common mistakes with ${p.toLowerCase()} (and how to avoid them)`,
    (p: string) => `${p}: a step-by-step checklist`,
  ];
  const CITIES = [
    "Los Angeles", "Houston", "Phoenix", "Dallas", "San Diego",
    "Chicago", "Atlanta", "Miami", "Seattle", "Denver",
  ];
  const have = new Set(ctx.existingTitles.map((t) => t.toLowerCase()));
  const out: IdeaProposal[] = [];
  const wantLocal = ctx.targetLocal ?? 0;

  // Local ideas first (up to the target), then evergreen from pillars.
  for (const city of CITIES) {
    if (out.filter((o) => o.kind === "LOCAL").length >= wantLocal) break;
    const title = `Caskets in ${city}: delivery times & which funeral homes accept them`;
    if (have.has(title.toLowerCase())) continue;
    out.push({
      title,
      pillar: pillars[0],
      targetKeyword: `caskets in ${city.toLowerCase()}`,
      score: 62,
      rationale: NOTE,
      kind: "LOCAL",
    });
  }

  let i = 0;
  while (out.length < ctx.count && i < pillars.length * seed.length) {
    const pillar = pillars[i % pillars.length];
    const make = seed[Math.floor(i / pillars.length) % seed.length];
    const title = make(pillar);
    i++;
    if (have.has(title.toLowerCase())) continue;
    out.push({
      title,
      pillar,
      targetKeyword: title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
      score: 60,
      rationale: NOTE,
      kind: "EVERGREEN",
    });
  }
  return out.slice(0, ctx.count);
}

export async function generateIdeaProposals(ctx: IdeationContext): Promise<IdeaProposal[]> {
  if (!aiEnabled()) return offlineIdeas(ctx);

  const existing = ctx.existingTitles.length
    ? ctx.existingTitles.map((t) => `- ${t}`).join("\n")
    : "(none yet)";

  const { ideas } = await structured<{ ideas: IdeaProposal[] }>({
    model: MODELS.ideas,
    system: IDEATION_SYSTEM,
    schema: IDEA_SCHEMA,
    prompt: `BUSINESS: ${ctx.businessName}

PROFILE:
${ctx.profileMd}

BRAND VOICE: ${ctx.brandVoice ?? "(not set)"}

CONTENT PILLARS (assign each idea to the best-fitting one):
${ctx.pillars.map((p) => `- ${p}`).join("\n") || "- General"}

ALREADY PUBLISHED OR IN-FLIGHT (do NOT duplicate these):
${existing}

PERFORMANCE / COVERAGE SIGNAL:
${ctx.performanceNote ?? "(no analytics yet — prioritize pillars with the least existing coverage above)"}

CONTENT MIX — propose exactly ${ctx.targetLocal ?? 0} LOCAL (geo-targeted) idea(s) and ${ctx.targetEvergreen ?? ctx.count} EVERGREEN idea(s), for ${ctx.count} total. Tag each idea's "kind". For the LOCAL ideas, target distinct US metros/states that aren't already covered above.

Propose ${ctx.count} NEW article ideas. Return the strongest, most distinct opportunities, each scored honestly.`,
  });

  return ideas.slice(0, ctx.count);
}
