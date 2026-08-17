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
- 2–4 links to authoritative EXTERNAL sources (prefer .gov / recognized institutions), placed inline where a claim needs backing.
- Soft calls-to-action at the top and bottom (never pushy).
- End with a fenced \`\`\`json block of valid JSON-LD for the required schema types, with complete fields (datePublished/author where applicable).

QUALITY — this is what gets it ranked:
- Take a clear point of view / thesis. Own the wedge from the brief; don't hedge.
- Use concrete, verifiable specifics: real price ranges, real timeframes, named standards or regulations — but ONLY ones you are confident are real. NEVER invent a statute, statistic, citation, or source.
- Write like an experienced practitioner: specific, plain, reassuring.
- BAN these AI-slop tells: em-dash overuse, "in conclusion", "it's important to note", "when it comes to", "navigate/navigating", "delve", "in today's world", and reflexive hedging ("generally", "typically", "often") unless genuinely warranted.
- Where real first-hand experience would strengthen the page (a specific customer scenario, an original photo, a number only this business knows), insert a clearly-marked callout: "> **Add your experience:** <what to add>". That callout is the ONLY way to signal missing first-hand detail — never fabricate the experience itself.

Write in the brand voice provided.`;

export async function writeDraft(brief: BriefSpec, brandVoice: string): Promise<string> {
  if (!aiEnabled()) return offlineDraft(brief, brandVoice);

  const prompt = `BRAND VOICE:\n${brandVoice}\n\nBRIEF:\nTitle: ${brief.title}\nTarget keyword: ${brief.targetKeyword}\nAngle / wedge: ${brief.angle}\nTarget length: ~${brief.wordTarget} words\nRequired schema: ${brief.requiredSchema.join(", ")}\nOutline:\n${brief.outline.map((s) => `- ${s}`).join("\n")}\nQuestions to answer:\n${brief.questions.map((q) => `- ${q}`).join("\n")}\nGap to fill (what competitors miss): ${brief.gap}\n\n${TEMPLATE_GUIDANCE}`;

  return completeText({ model: MODELS.writer, prompt, maxTokens: 16000 });
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
- Do NOT increase the word count to fix things — improve quality, don't add bulk. If anything, tighten.
- Preserve the structure, the FAQ, and the JSON-LD block (keep it valid).
- Keep any "> **Add your experience:**" callouts.
- Do not introduce AI-slop tells (em-dash spam, "in conclusion", "it's important to note", reflexive hedging).
- Return the full revised Markdown (not a diff).

DRAFT:
${draft}`;

  return completeText({ model: MODELS.writer, prompt, maxTokens: 16000 });
}
