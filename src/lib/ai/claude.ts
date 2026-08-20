// Thin wrapper around the Anthropic SDK — the one place every agent talks to Claude.
//
// MODEL STRATEGY (cost vs quality): each stage runs on the cheapest model that
// still holds the standard, instead of Opus for everything.
//   • Haiku  — high-volume, low-stakes generation (idea brainstorming, keyword
//              extraction). Cheap and fast; a weaker model here costs nothing.
//   • Sonnet — the workhorse: the writer (biggest token spender at ~20k output ×
//              several passes), the grader (runs on every revise/boost loop), the
//              competitive research/brief, and business profiling. Sonnet 5 writes
//              and judges at near-Opus quality for a fraction of the cost.
//   • Opus   — reserved. Not in the routine loop; opt in per run via PIPELINE_MODEL
//              when a flagship piece justifies the premium.
// Set PIPELINE_MODEL to override every stage at once (a global cost/speed lever).
//
// Request bodies are cast to `any` at the call site because SDK typings lag new
// params (adaptive thinking, output_config) — the wire shape is correct.

import Anthropic from "@anthropic-ai/sdk";

const HAIKU = "claude-haiku-4-5-20251001";
const SONNET = "claude-sonnet-5";

export const MODELS = {
  intake: SONNET, // business profiling — rare, wants good synthesis
  keyword: HAIKU, // simple extraction
  ideas: HAIKU, // idea brainstorming — high volume, low stakes
  research: SONNET, // competitive gap-map brief
  writer: SONNET, // the content — quality lever + biggest spender
  grader: SONNET, // reliable rubric judgment, runs often
} as const;

let _client: Anthropic | null = null;
function client(): Anthropic {
  _client ??= new Anthropic(); // reads ANTHROPIC_API_KEY
  return _client;
}

function textFrom(msg: Anthropic.Message): string {
  return msg.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("\n")
    .trim();
}

export interface CompleteOpts {
  prompt: string;
  system?: string;
  model?: string;
  maxTokens?: number;
}

/** Free-form text generation (e.g. the writer). */
export async function completeText(opts: CompleteOpts): Promise<string> {
  const body = {
    // PIPELINE_MODEL (if set) overrides every stage — a global cost/speed lever.
    model: process.env.PIPELINE_MODEL || opts.model || MODELS.writer,
    max_tokens: opts.maxTokens ?? 16000,
    thinking: { type: "adaptive" },
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const msg = (await client().messages.create(body as any)) as Anthropic.Message;
  if (msg.stop_reason === "refusal") {
    throw new Error("Claude declined this request (refusal).");
  }
  return textFrom(msg);
}

export interface StructuredOpts<_T> extends CompleteOpts {
  /** JSON Schema the response must satisfy (additionalProperties:false + required). */
  schema: Record<string, unknown>;
}

/** Schema-constrained JSON output (research, grader). Returns the parsed object. */
export async function structured<T>(opts: StructuredOpts<T>): Promise<T> {
  const body = {
    model: process.env.PIPELINE_MODEL || opts.model || MODELS.grader,
    max_tokens: opts.maxTokens ?? 16000,
    thinking: { type: "adaptive" },
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
    output_config: { format: { type: "json_schema", schema: opts.schema } },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const msg = (await client().messages.create(body as any)) as Anthropic.Message;
  if (msg.stop_reason === "refusal") {
    throw new Error("Claude declined this request (refusal).");
  }
  return JSON.parse(textFrom(msg)) as T;
}
