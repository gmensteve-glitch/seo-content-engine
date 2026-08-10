// The content pipeline job: fires when a brief is approved, then runs
// write → grade-until-pass → publish as a durable, retryable step. The actual
// work lives in the pipeline service so the UI (synchronous) and Inngest
// (durable) share one implementation that persists to the DB.

import { inngest } from "@/lib/jobs/client";
import { runPipelineForBrief } from "@/lib/pipeline/service";

interface BriefApprovedEvent {
  briefId: string;
}

export const runContentPipeline = inngest.createFunction(
  { id: "run-content-pipeline", retries: 2, triggers: [{ event: "content/brief.approved" }] },
  async ({ event, step }) => {
    const { briefId } = event.data as BriefApprovedEvent;
    return step.run("write-grade-publish", () => runPipelineForBrief(briefId));
  }
);
