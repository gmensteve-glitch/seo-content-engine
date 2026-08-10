// The writer agent — turns an approved brief into a schema-rich, AEO-ready draft,
// and revises it against grader feedback.

import { completeText, MODELS } from "@/lib/ai/claude";
import type { BriefSpec } from "@/lib/agents/research";
import { aiEnabled } from "@/lib/env";
import { offlineDraft, offlineRevise } from "@/lib/ai/offline";

const TEMPLATE_GUIDANCE = `Write the page as Markdown following this structure:
- An answer-first intro that satisfies the search intent in the first paragraph.
- A short table of contents.
- Clear H2/H3 sections; step-by-step "how-to" where the topic calls for it.
- Self-contained passages of ~130–170 words so AI answer engines can quote them.
- Links to authoritative sources (prefer .gov / recognized institutions) where relevant.
- An FAQ section near the end.
- Soft calls-to-action at the top and bottom (never pushy).
- At the very end, a fenced \`\`\`json block containing the JSON-LD schema for the required types.

Write in the brand voice provided. Add genuine, specific detail — no filler, no hedging, no "in conclusion". Do not fabricate statistics or sources.`;

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

  const prompt = `Here is a draft that needs revision. A quality grader flagged these dimensions as weakest: ${weakest.join(", ")}.\n\nGrader feedback:\n${feedback}\n\nRevise the draft to fix those specific weaknesses. Keep everything that already works, preserve the structure and the JSON-LD block, and return the full revised Markdown (not a diff).\n\nDRAFT:\n${draft}`;

  return completeText({ model: MODELS.writer, prompt, maxTokens: 16000 });
}
