// The 0–100 grader + revise-until-it-passes loop. Scores a draft against the
// shared RUBRIC using the research brief as the benchmark.

import { structured, MODELS } from "@/lib/ai/claude";
import { aiEnabled } from "@/lib/env";
import { offlineGrade } from "@/lib/ai/offline";
import {
  RUBRIC,
  DEFAULT_THRESHOLD,
  MAX_REVISION_LOOPS,
  computeOverall,
  weakestDimensions,
  type DimensionScore,
  type GradeResult,
} from "@/lib/grader/rubric";

// JSON schema the grader must return: a {score, note} per rubric dimension + feedback.
function gradeSchema(): Record<string, unknown> {
  const dimProps: Record<string, unknown> = {};
  for (const d of RUBRIC) {
    dimProps[d.key] = {
      type: "object",
      additionalProperties: false,
      properties: {
        score: { type: "integer", description: `0..${d.max}` },
        note: { type: "string" },
      },
      required: ["score", "note"],
    };
  }
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      dimensions: {
        type: "object",
        additionalProperties: false,
        properties: dimProps,
        required: RUBRIC.map((d) => d.key),
      },
      feedback: { type: "string" },
    },
    required: ["dimensions", "feedback"],
  };
}

type RawGrade = {
  dimensions: Record<string, { score: number; note: string }>;
  feedback: string;
};

const GRADER_SYSTEM = `You are a strict SEO/AEO content editor. Score the draft honestly against the rubric and the brief it was written from. Be specific in each note about what would earn the missing points. Do not inflate scores.`;

export async function gradeDraft(
  draftMarkdown: string,
  briefContext: string,
  threshold = DEFAULT_THRESHOLD
): Promise<GradeResult> {
  if (!aiEnabled()) return offlineGrade(draftMarkdown, threshold);

  const rubricText = RUBRIC.map(
    (d) => `- ${d.key} (max ${d.max}): ${d.label} — ${d.criteria}`
  ).join("\n");

  const prompt = `RUBRIC:\n${rubricText}\n\nBRIEF (the benchmark this draft should satisfy):\n${briefContext}\n\nDRAFT:\n${draftMarkdown}\n\nScore each dimension and give one paragraph of feedback on the highest-leverage fixes.`;

  // A malformed grade (every dimension 0) is almost always a model hiccup, not a
  // genuine zero — retry once before trusting it, so a blip doesn't burn a
  // revision loop or pollute the grade history with a spurious 0.
  let raw = await structured<RawGrade>({
    model: MODELS.grader,
    system: GRADER_SYSTEM,
    schema: gradeSchema(),
    prompt,
  });
  const allZero = (g: RawGrade) => RUBRIC.every((d) => !(g.dimensions?.[d.key]?.score > 0));
  if (allZero(raw)) {
    console.warn("[grader] all-zero grade — retrying once");
    raw = await structured<RawGrade>({
      model: MODELS.grader,
      system: GRADER_SYSTEM,
      schema: gradeSchema(),
      prompt,
    });
  }

  const dimensions: Record<string, DimensionScore> = {};
  for (const d of RUBRIC) {
    const got = raw.dimensions[d.key];
    dimensions[d.key] = {
      score: Math.max(0, Math.min(d.max, Math.round(got?.score ?? 0))),
      max: d.max,
      note: got?.note ?? "",
    };
  }
  const overall = computeOverall(dimensions);
  return { overall, passed: overall >= threshold, dimensions, feedback: raw.feedback };
}

export interface GradeLoopResult {
  draft: string;
  grade: GradeResult;
  loops: number;
  grades: GradeResult[]; // full history (the learning log)
}

/**
 * Grade → if below threshold, revise the weakest dimensions and re-grade,
 * up to MAX_REVISION_LOOPS. `revise` is the writer's revision function.
 */
export async function gradeUntilPass(
  initialDraft: string,
  briefContext: string,
  revise: (draft: string, feedback: string, weakest: string[]) => Promise<string>,
  opts: { threshold?: number; maxLoops?: number } = {}
): Promise<GradeLoopResult> {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const maxLoops = opts.maxLoops ?? MAX_REVISION_LOOPS;

  let draft = initialDraft;
  const grades: GradeResult[] = [];

  for (let loop = 1; loop <= maxLoops; loop++) {
    const grade = await gradeDraft(draft, briefContext, threshold);
    grades.push(grade);
    if (grade.passed || loop === maxLoops) {
      return { draft, grade, loops: loop, grades };
    }
    const weakest = weakestDimensions(grade.dimensions).slice(0, 3);
    draft = await revise(draft, grade.feedback, weakest);
  }

  // Unreachable (loop returns on last iteration), but satisfies the type checker.
  const grade = grades[grades.length - 1];
  return { draft, grade, loops: grades.length, grades };
}
