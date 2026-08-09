// Inngest serve endpoint — Inngest calls this route to run registered functions.

import { serve } from "inngest/next";
import { inngest } from "@/lib/jobs/client";
import { runContentPipeline } from "@/lib/jobs/pipeline";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [runContentPipeline],
});
