// The writer agent — turns an approved brief into a schema-rich, AEO-ready draft,
// and revises it against grader feedback.

import { completeText, MODELS } from "@/lib/ai/claude";
import type { BriefSpec } from "@/lib/agents/research";
import { aiEnabled } from "@/lib/env";
import { offlineDraft, offlineRevise } from "@/lib/ai/offline";

const TEMPLATE_GUIDANCE = `Write the page as Markdown.

LENGTH — this matters: hit the target word count and DO NOT exceed it by more than ~10%. Tighter is better; cut anything that repeats or pads. A focused page outranks a bloated one.

STRUCTURE:
- Answer-first intro that satisfies the search intent in the first 1–2 sentences.
- A short table of contents.
- Clear H2/H3 sections; a step-by-step "how-to" where the topic calls for it.
- Self-contained passages of ~130–170 words under key headings so AI answer engines can quote them verbatim.
- An FAQ section near the end (each answer self-contained, ~40–70 words).
- 2–4 links to authoritative EXTERNAL sources (prefer .gov / recognized institutions), placed inline where a claim needs backing. Only link to a real URL you are confident exists.
- Do NOT invent internal links to the site's own pages — never write a relative link like [text](/caskets/pricing-guide) or guess the site's URL structure. Internal links to real published pages are added automatically by the system. The ONLY internal links you may write are in-page jump links in the table of contents that point to your own H2/H3 headings (e.g. [Oversized Caskets](#oversized-caskets)).
- Soft calls-to-action at the top and bottom (never pushy).
- End with a fenced \`\`\`json block of valid JSON-LD for the required schema types, with complete fields (datePublished/author where applicable). The JSON-LD MUST be complete and valid — never truncate it. If you're running low on room, shorten the prose, never the schema.

GEO — BUILT TO BE QUOTED BY AI ANSWER ENGINES (ChatGPT, Perplexity, Google AI Overviews, Gemini). This matters as much as ranking in Google — the goal is for an AI to lift YOUR text as its answer and cite this site:
- Open with a "Quick answer": the FIRST thing right after the H1, before the table of contents, is a bold 2–4 sentence self-contained answer to the exact question the title asks. Lead with the number/range/verdict, then one sentence of context. An AI must be able to quote it verbatim and have a complete, accurate answer with zero other context.
- Under EVERY H2, the first 1–2 sentences must directly and completely answer that section's implied question — no "as mentioned above", no pronouns pointing elsewhere, no setup. Every passage must stand on its own when pulled out of context.
- State key facts as clean, standalone, attributable sentences with concrete numbers, ranges, or named standards (e.g. "A standard adult casket is about 84 inches long and 28 inches wide."). Specific, quotable facts beat vague prose.
- Mention the brand naturally where it fits so the source is attributable (never spammy).
- Make the FAQ answers fully self-contained — they are prime AI-answer real estate.

QUALITY — this is what gets it ranked:
- Take a clear point of view / thesis. Own the wedge from the brief; don't hedge.
- Use concrete, verifiable specifics: real price ranges, real timeframes, named standards or regulations — but ONLY ones you are confident are real. NEVER invent a statute, statistic, citation, or source.
- Author personas / pen names, a first-person voice, quotes, and general experience descriptions ("years in funeral service", "has helped many families") are all allowed and encouraged for warmth and authority. The ONE thing never to fabricate is a verifiable credential NUMBER or ID: no made-up professional license numbers, certification numbers, registration IDs, or membership numbers (e.g. "LFD #4471, California"). This applies in the visible text AND in the JSON-LD author. A persona may describe general background and speak in quotes, but must never cite a specific license/registration/certification number that doesn't exist.
- Real-world PRICING and market facts are ENCOURAGED and valuable: casket/service cost ranges, local and regional price estimates, typical fees, and what things generally cost are all welcome — keep them realistic and, where possible, framed as ranges or "typically". What you must NEVER do is fabricate specifics about how THIS business itself operates: our shipping and delivery PROCESS, delivery timelines or turnaround, what happens "at hour X", how or when a casket is built/crated/handed off, handling steps, or delivery guarantees. Do NOT invent hour-by-hour or day-by-day shipping schedules ("Hour 0–48: build and crate"), named carriers, aircraft, airport routes, transfer points, or a step-by-step "how a casket travels from order to delivery" process. Presented as fact, invented operational details read as PROMISES about our business and create real liability. When the topic touches our shipping, delivery, or timing, stay BROAD: say timelines vary by destination and carrier, and tell the reader to confirm exact timing and handling with us and the shipping provider directly. Likewise, never assert how a SPECIFIC third-party funeral home operates (its exact steps, fees, hours, or timelines) as fact — give general industry norms and tell the reader to verify with their chosen home. (Pricing and general facts are fine; inventing OUR operational process is not.)
- Write like an experienced practitioner: specific, plain, reassuring.
- BAN these AI-slop tells: em-dash overuse, "in conclusion", "it's important to note", "when it comes to", "navigate/navigating", "delve", "in today's world", and reflexive hedging ("generally", "typically", "often") unless genuinely warranted.
- Write the strongest, COMPLETE version you can using the personas, general experience, and verifiable specifics allowed above. This pipeline is fully automated — there is no human to fill in blanks later. Do NOT insert placeholder callouts, bracketed TODOs, "[add …]" notes, or "> **Add your experience:**" markers. The piece must be finished and publishable exactly as written.

TONE — warm and personal: you're talking to a grieving family, not writing a spec sheet. Lead with empathy and reassurance, use plain human language, and be genuinely helpful before anything else. Keep the brand voice below, but never let it get cold, corporate, or salesy.

Write in the brand voice provided.`;

export async function writeDraft(
  brief: BriefSpec,
  brandVoice: string,
  houseRules = "",
): Promise<string> {
  if (!aiEnabled()) return offlineDraft(brief, brandVoice);

  const rules = houseRules.trim() ? `\n\n${houseRules.trim()}\n` : "";
  const prompt = `BRAND VOICE:\n${brandVoice}\n\nBRIEF:\nTitle: ${brief.title}\nTarget keyword: ${brief.targetKeyword}\nAngle / wedge: ${brief.angle}\nTarget length: ~${brief.wordTarget} words\nRequired schema: ${brief.requiredSchema.join(", ")}\nOutline:\n${brief.outline.map((s) => `- ${s}`).join("\n")}\nQuestions to answer:\n${brief.questions.map((q) => `- ${q}`).join("\n")}\nGap to fill (what competitors miss): ${brief.gap}\n\n${TEMPLATE_GUIDANCE}${rules}`;

  return completeText({ model: MODELS.writer, prompt, maxTokens: 20000 });
}

export async function reviseDraft(
  draft: string,
  feedback: string,
  weakest: string[]
): Promise<string> {
  if (!aiEnabled()) return offlineRevise(draft);

  const prompt = `Revise this draft to fix the grader's flagged weaknesses WITHOUT padding it.

Weakest dimensions to fix: ${weakest.join(", ")}.

Grader feedback:
${feedback}

Rules:
- Make surgical edits that directly address the feedback. Keep everything that already works.
- NEVER add length to fix a problem — improve quality by cutting, not padding.
- If the feedback flags length, bloat, or padding: CUT AGGRESSIVELY toward the target — delete whole redundant passages, merge overlapping sections, remove filler and hedging. A shorter, tighter version that keeps the substance is the goal.
- Preserve the structure, the FAQ, and the JSON-LD block (keep it COMPLETE and valid — never truncate the schema).
- The piece must be complete and publishable as-is: remove any leftover placeholder callouts, bracketed TODOs, or "> **Add your experience:**" markers.
- Do not introduce AI-slop tells (em-dash spam, "in conclusion", "it's important to note", reflexive hedging).
- Return the full revised Markdown (not a diff).

DRAFT:
${draft}`;

  return completeText({ model: MODELS.writer, prompt, maxTokens: 20000 });
}
