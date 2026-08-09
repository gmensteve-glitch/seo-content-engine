// Thin wrapper around the Anthropic SDK — the one place every agent talks to Claude.
// Default model is claude-opus-5; swap a stage to claude-sonnet-5 for lower cost.
// Request bodies are cast to `any` at the call site because SDK typings lag new
// params (adaptive thinking, output_config) — the wire shape is correct.

import Anthropic from "@anthropic-ai/sdk";

export const MODELS = {
  intake: "claude-opus-5",
  keyword: "claude-opus-5",
  research: "claude-opus-5",
  writer: "claude-opus-5",
  grader: "claude-opus-5",
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
    model: opts.model ?? MODELS.writer,
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
    model: opts.model ?? MODELS.grader,
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
