// Inngest serve endpoint — Inngest calls this route to run registered functions.

import { serve } from "inngest/next";
import { inngest } from "@/lib/jobs/client";
import { runContentPipeline } from "@/lib/jobs/pipeline";
import { publishQueueCron, replenishIdeasCron } from "@/lib/jobs/crons";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [runContentPipeline, publishQueueCron, replenishIdeasCron],
});
