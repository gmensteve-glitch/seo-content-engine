// Offline fallbacks — deterministic, clearly-labeled placeholder output used
// when ANTHROPIC_API_KEY is not set. They keep the full pipeline runnable with
// zero credentials (for local dev, demos, and tests). Everything produced here
// is explicitly marked as a placeholder so it is never mistaken for real,
// research-grounded content.

import type { BusinessProfile } from "@/lib/agents/intake";
import type { BriefSpec } from "@/lib/agents/research";
import { RUBRIC, computeOverall, type DimensionScore, type GradeResult } from "@/lib/grader/rubric";

const NOTE = "Generated offline (no ANTHROPIC_API_KEY set) — placeholder, not researched content.";

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function offlineProfile(domain: string): BusinessProfile {
  return {
    profileMd: [
      `# ${domain}`,
      "",
      `_${NOTE}_`,
      "",
      "- **Business:** (infer from the live site once Firecrawl + Claude are configured)",
      "- **Audience:** (to be inferred)",
      "- **Offering:** (to be inferred)",
      "- **Differentiators:** (to be inferred)",
    ].join("\n"),
    brandVoice:
      "Clear, warm, and authoritative. Explain plainly and empathetically; avoid hype. Do: be specific and reassuring. Don't: use pushy sales language.",
    pillars: ["Buying guide", "Costs", "Immediate steps", "Local resources", "Eco options"],
  };
}

export function offlineBrief(targetKeyword: string): BriefSpec {
  const title = titleCase(targetKeyword);
  return {
    title: `${title}: a complete guide`,
    targetKeyword,
    angle: `Be the most complete, most citable resource on "${targetKeyword}" — answer-first, clearly structured, and grounded in real specifics. ${NOTE}`,
    gap: `Competing pages cover the basics of "${targetKeyword}" but leave costs, concrete steps, and local specifics thin.`,
    wordTarget: 1600,
    outline: [
      "Answer-first introduction",
      `What "${title}" means`,
      "Key costs and the factors that drive them",
      "Step-by-step: how to approach it",
      "Common mistakes to avoid",
      "FAQ",
    ],
    questions: [
      `What is ${title.toLowerCase()}?`,
      `How much does ${targetKeyword} cost?`,
      `How do I choose the right option?`,
    ],
    requiredSchema: ["FAQPage", "Article"],
  };
}

export function offlineDraft(brief: BriefSpec, brandVoice: string): string {
  const faq = brief.questions
    .map((q) => `### ${q}\n\nA concise, self-contained answer (~130–170 words) goes here once real generation is enabled.`)
    .join("\n\n");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: brief.questions.map((q) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: "Placeholder answer." },
    })),
  };

  return [
    `<!-- ${NOTE} -->`,
    `# ${brief.title}`,
    "",
    `> Answer-first intro: this page targets **${brief.targetKeyword}**. ${brief.angle}`,
    "",
    `_Brand voice: ${brandVoice}_`,
    "",
    "## Table of contents",
    ...brief.outline.map((s, i) => `${i + 1}. ${s}`),
    "",
    ...brief.outline.flatMap((s) => [`## ${s}`, "", "Placeholder section body.", ""]),
    "## FAQ",
    "",
    faq,
    "",
    "```json",
    JSON.stringify(jsonLd, null, 2),
    "```",
    "",
  ].join("\n");
}

export function offlineRevise(draft: string): string {
  if (draft.includes("<!-- revised offline -->")) return draft;
  return `${draft}\n\n<!-- revised offline -->`;
}

// Deterministic passing grade (sums to 94/100) so the offline loop reaches
// PASSED and exercises publish. Notes flag it as a placeholder.
const OFFLINE_SCORES: Record<string, number> = {
  intentMatch: 15,
  depth: 13,
  eeat: 12,
  aeo: 15,
  originality: 9,
  linking: 10,
  readability: 10,
  conversion: 10,
};

export function offlineGrade(_draftMarkdown: string, threshold: number): GradeResult {
  const dimensions: Record<string, DimensionScore> = {};
  for (const d of RUBRIC) {
    const raw = OFFLINE_SCORES[d.key] ?? d.max;
    dimensions[d.key] = {
      score: Math.min(d.max, raw),
      max: d.max,
      note: `Offline placeholder score — real grading requires ANTHROPIC_API_KEY.`,
    };
  }
  const overall = computeOverall(dimensions);
  return {
    overall,
    passed: overall >= threshold,
    dimensions,
    feedback: `Placeholder grade generated offline. Set ANTHROPIC_API_KEY for a real 0–100 evaluation.`,
  };
}
