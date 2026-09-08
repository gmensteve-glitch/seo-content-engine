// Thin wrapper around the Anthropic SDK — the one place every agent talks to Claude.
//
// MODEL STRATEGY (cost vs quality): three tiers, each stage on the cheapest tier
// that still holds the standard.
//   • BEST  (Opus 5)   — where quality is the product: brainstorming (ideas, the
//                        research brief's angle) and communication (the writer,
//                        the prose people actually read). Thinking on.
//   • MID   (Sonnet 5) — reliable judgment that runs often: the grader, and the
//                        one-off business profiling at intake.
//   • CHEAP (Haiku 4.5) — mechanical work where a small model is as good as a
//                        big one: keyword/fact extraction, structuring, parsing.
//                        ~5× cheaper than Sonnet, ~25× cheaper than Opus on
//                        output tokens. Haiku 4.5 takes no `thinking`/`effort`.
// Set PIPELINE_MODEL to override the BEST/MID stages at once (cheap stages stay
// pinned — mechanical work never needs a premium model).
//
// Request bodies are cast to `any` at the call site because SDK typings lag new
// params (adaptive thinking, output_config, fallbacks) — the wire shape is correct.

import Anthropic from "@anthropic-ai/sdk";
import { recordUsage } from "@/lib/ai/cost";

const HAIKU = "claude-haiku-4-5";
const SONNET = "claude-sonnet-5";
const OPUS = "claude-opus-5";

export const MODELS = {
  intake: SONNET, // business profiling — rare, wants good synthesis
  keyword: HAIKU, // simple extraction
  extract: HAIKU, // structuring / fact extraction / parsing — mechanical
  ideas: OPUS, // brainstorming — the best model, per operator preference
  research: OPUS, // the brief's angle + gap: brainstorming
  writer: OPUS, // the content itself — communication, the quality lever
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

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface CompleteOpts {
  prompt: string;
  system?: string;
  model?: string;
  maxTokens?: number;
  /** Cheap, mechanical stage (extraction, structuring): pin to the small model
   *  and ignore the global PIPELINE_MODEL override. */
  cheap?: boolean;
  /** Thinking depth for models that support it (ignored on Haiku). Default
   *  "high"; use "low"/"medium" for routine work, "xhigh" for flagship prose. */
  effort?: Effort;
}

/** Cache the (stable) system prompt so it isn't re-billed at full price on every
 *  call. Behavior-identical — same text, same position — just cached. */
function cachedSystem(system?: string) {
  if (!system) return undefined;
  return [{ type: "text", text: system, cache_control: { type: "ephemeral" } }];
}

/** Resolve the model: cheap stages stay pinned; everything else honors the
 *  global PIPELINE_MODEL override. */
function resolveModel(opts: CompleteOpts, fallback: string): string {
  if (opts.cheap) return opts.model ?? MODELS.extract;
  return process.env.PIPELINE_MODEL || opts.model || fallback;
}

const isHaiku = (model: string) => model.startsWith("claude-haiku");
const isOpus = (model: string) => model.startsWith("claude-opus");

/** The thinking/effort block for a model. Haiku 4.5 rejects both, so it gets
 *  neither; everything current runs adaptive thinking with an effort level. */
function reasoningFor(model: string, effort?: Effort): Record<string, unknown> {
  if (isHaiku(model)) return {};
  return {
    thinking: { type: "adaptive" },
    ...(effort ? { output_config: { effort } } : {}),
  };
}

/**
 * Send a request. On the BEST tier, opt into server-side refusal fallbacks so a
 * safety-classifier decline (plausible for death/funeral content) re-runs on a
 * fallback model inside the same call instead of failing the piece. If the
 * account/SDK doesn't accept the beta, retry once without it — the fallback
 * is a safety net, never a dependency.
 */
async function send(body: Record<string, unknown>): Promise<Anthropic.Message> {
  const model = String(body.model);
  // Stream every request and take the final message: long outputs (a full
  // category page as JSON, a 2,000-word draft) plus adaptive thinking can run
  // past a non-streaming HTTP timeout and come back cut off mid-JSON.
  if (isOpus(model)) {
    try {
      const msg = await client().beta.messages
        .stream({
          ...body,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .finalMessage();
      return msg as unknown as Anthropic.Message;
    } catch (e) {
      if (!(e instanceof Anthropic.BadRequestError)) throw e;
      console.warn("[claude] fallbacks not accepted, retrying plain:", e.message);
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return client().messages.stream(body as any).finalMessage();
}

function mergeOutputConfig(
  body: Record<string, unknown>,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  const existing = (body.output_config as Record<string, unknown> | undefined) ?? {};
  return { ...body, output_config: { ...existing, ...extra } };
}

/** Free-form text generation (e.g. the writer). */
export async function completeText(opts: CompleteOpts): Promise<string> {
  const model = resolveModel(opts, MODELS.writer);
  const body: Record<string, unknown> = {
    model,
    max_tokens: opts.maxTokens ?? 16000,
    ...reasoningFor(model, opts.effort),
    system: cachedSystem(opts.system),
    messages: [{ role: "user", content: opts.prompt }],
  };
  const msg = await send(body);
  recordUsage(model, msg.usage);
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
  const model = resolveModel(opts, MODELS.grader);
  let body: Record<string, unknown> = {
    model,
    max_tokens: opts.maxTokens ?? 16000,
    ...reasoningFor(model, opts.effort),
    system: cachedSystem(opts.system),
    messages: [{ role: "user", content: opts.prompt }],
  };
  body = mergeOutputConfig(body, { format: { type: "json_schema", schema: opts.schema } });

  // A malformed JSON reply is almost always an output that got cut off
  // (max_tokens) or a transient hiccup — say which, and retry the hiccup once.
  for (let attempt = 0; ; attempt++) {
    const msg = await send(body);
    recordUsage(model, msg.usage);
    if (msg.stop_reason === "refusal") {
      throw new Error("Claude declined this request (refusal).");
    }
    const text = textFrom(msg);
    try {
      return JSON.parse(text) as T;
    } catch (e) {
      if (msg.stop_reason === "max_tokens") {
        throw new Error(
          `Output was cut off at the ${body.max_tokens}-token limit before the JSON finished — raise maxTokens for this call.`,
        );
      }
      if (attempt >= 1) throw e;
      console.warn("[claude] malformed JSON reply — retrying once:", e instanceof Error ? e.message : e);
    }
  }
}
