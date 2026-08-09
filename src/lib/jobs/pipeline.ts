// The content pipeline job: fires when a brief is approved, then runs
// research → write → grade-until-pass as durable, retryable steps.

import { inngest } from "@/lib/jobs/client";
import { buildBrief } from "@/lib/agents/research";
import { writeDraft, reviseDraft } from "@/lib/agents/writer";
import { gradeUntilPass } from "@/lib/agents/grader";

interface BriefApprovedEvent {
  targetKeyword: string;
  businessContext: string;
  brandVoice: string;
  threshold?: number;
}

export const runContentPipeline = inngest.createFunction(
  { id: "run-content-pipeline", retries: 2, triggers: [{ event: "content/brief.approved" }] },
  async ({ event, step }) => {
    const data = event.data as BriefApprovedEvent;

    const brief = await step.run("research", () =>
      buildBrief({ targetKeyword: data.targetKeyword, businessContext: data.businessContext })
    );

    const draft = await step.run("write", () => writeDraft(brief, data.brandVoice));

    const result = await step.run("grade-loop", () =>
      gradeUntilPass(draft, JSON.stringify(brief), reviseDraft, { threshold: data.threshold })
    );

    // Next steps (not yet wired): internal-linking pass → publish via CMS adapter → index.
    return {
      title: brief.title,
      passed: result.grade.passed,
      overall: result.grade.overall,
      loops: result.loops,
    };
  }
);
