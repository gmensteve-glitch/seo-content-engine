// The 0–100 blog quality rubric — the heart of the quality gate.
// Kept as pure data so the grader agent, the UI scorecard, and analytics all share one source of truth.

export interface RubricDimension {
  key: string;
  label: string;
  max: number;
  /** What the grader agent measures for this dimension. */
  criteria: string;
}

export const RUBRIC: RubricDimension[] = [
  {
    key: "intentMatch",
    label: "Search-intent match",
    max: 15,
    criteria:
      "Does the page directly satisfy the target keyword's intent, matching what the brief specified?",
  },
  {
    key: "depth",
    label: "Depth vs competitors",
    max: 15,
    criteria:
      "Is it more complete than the top-ranking pages, and does it fill the gap-map wedge?",
  },
  {
    key: "eeat",
    label: "E-E-A-T / first-hand experience",
    max: 15,
    criteria:
      "Concrete experience, real figures, expert framing, trust signals — not generic filler.",
  },
  {
    key: "aeo",
    label: "AEO / GEO readiness",
    max: 15,
    criteria:
      "Built to be QUOTED by AI answer engines (ChatGPT, Perplexity, Google AI, Gemini) AND to rank. Requires: (1) the intro's first 1–2 plain sentences fully answer the title's question, lead-with-the-fact (there is deliberately NO bold 'Quick answer' block — do not ask for one), followed by an 'In this guide' table of contents (up to 6 plain-text section labels, deliberately not links) and a 'What to know first' box of exactly 5 one-sentence takeaways of at most 15 words, each supported by the article; (2) every H2 opens with a 1–2 sentence self-contained answer that stands alone when quoted out of context (no 'as above', no dangling pronouns); (3) concrete, standalone, quotable facts (numbers/ranges/named standards) rather than vague prose; (4) a self-contained FAQ; (5) valid required schema (Article + FAQPage). Penalize a buried answer, sections that only make sense in sequence, or prose too vague for an AI to lift verbatim.",
  },
  {
    key: "originality",
    label: "Originality",
    max: 10,
    criteria:
      "Non-duplicate, no AI-slop tells (em-dash spam, hedging, repetition), a real point of view.",
  },
  {
    key: "linking",
    label: "Linking & link-readiness",
    max: 10,
    criteria:
      "2–4 authoritative OUTBOUND links, plus natural anchor opportunities to related topics. NOTE: surgical INTERNAL links are inserted automatically at publish time, so judge link-READINESS (are there good anchor phrases and outbound citations?) — do NOT penalize the draft for internal links not yet being present.",
  },
  {
    key: "readability",
    label: "Readability & concision",
    max: 10,
    criteria:
      "Scannable headings, short paragraphs, clear hierarchy — AND tight: hits its target length, answer-first, every section earns its place. Penalize padding, redundancy, hedging, and a buried answer. A bloated post that makes the reader wade scores LOW here even if well-structured.",
  },
  {
    key: "conversion",
    label: "Conversion",
    max: 10,
    criteria: "Appropriate CTAs and next steps without being salesy.",
  },
];

export const MAX_SCORE = RUBRIC.reduce((s, d) => s + d.max, 0); // 100

export interface DimensionScore {
  score: number;
  max: number;
  note: string;
}

export type GradeResult = {
  overall: number;
  passed: boolean;
  dimensions: Record<string, DimensionScore>;
  feedback: string; // what the next revision loop should fix
};

/** Default: pass at 85. Overridable per business (Business.qualityThreshold). */
export const DEFAULT_THRESHOLD = 85;

/** Max self-revision loops before flagging a human. */
export const MAX_REVISION_LOOPS = 2;

export function computeOverall(dimensions: Record<string, DimensionScore>): number {
  return Math.round(
    Object.values(dimensions).reduce((sum, d) => sum + d.score, 0)
  );
}

/** Dimensions sorted worst-first — what the revision loop targets. */
export function weakestDimensions(
  dimensions: Record<string, DimensionScore>
): string[] {
  return Object.entries(dimensions)
    .sort((a, b) => a[1].score / a[1].max - b[1].score / b[1].max)
    .map(([key]) => key);
}
