// Inngest client — runs the long AI jobs durably and on schedule, so multi-minute
// research/writing steps never hit a serverless timeout.

import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "seo-content-engine" });
