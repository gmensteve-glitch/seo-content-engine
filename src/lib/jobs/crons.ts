// Scheduled Inngest functions — the DURABLE version of the in-process scheduler
// (src/lib/jobs/scheduler.ts). When Inngest is connected these crons own the
// rollout + replenish cadence with retries and an observability dashboard; the
// in-process scheduler stands down (see scheduler.ts). Registered in the
// /api/inngest serve route.

import { inngest } from "@/lib/jobs/client";
import { publishScheduled, replenishAllIdeas } from "@/lib/pipeline/service";

/** Every 10 minutes: publish scheduled drafts whose time has arrived. */
export const publishQueueCron = inngest.createFunction(
  { id: "publish-queue", retries: 2, triggers: [{ cron: "*/10 * * * *" }] },
  async ({ step }) => {
    const result = await step.run("publish-due", () => publishScheduled());
    return { publishedCount: result.published.length };
  },
);

/** Every 6 hours: top up each business's idea pool so supply never runs dry. */
export const replenishIdeasCron = inngest.createFunction(
  { id: "replenish-ideas", retries: 1, triggers: [{ cron: "0 */6 * * *" }] },
  async ({ step }) => {
    const counts = await step.run("replenish", () => replenishAllIdeas());
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return { added: total };
  },
);
