// Per-piece cost accounting. Every Claude call reports token usage; we sum the
// dollar cost of all calls made while producing a given draft and store it, so
// "what did this blog cost?" becomes a real number tied to its score.
//
// Attribution uses an AsyncLocalStorage scope: the pipeline wraps a draft's work
// in withCostScope(), and every LLM call inside (write, grade, revise, boost…)
// adds its cost to that scope. No need to thread a draft id through every agent.

import { AsyncLocalStorage } from "node:async_hooks";

export interface TokenUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

// $ per 1,000,000 tokens. APPROXIMATE list prices — edit to your exact rates (or
// override per model via env, e.g. PRICE_CLAUDE_SONNET_5="3,15").
const PRICE: Record<string, { in: number; out: number }> = {
  "claude-opus-5": { in: 15, out: 75 },
  "claude-sonnet-5": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 0.8, out: 4 },
};

function priceFor(model: string): { in: number; out: number } {
  for (const key of Object.keys(PRICE)) {
    if (model.startsWith(key)) return PRICE[key];
  }
  return PRICE["claude-sonnet-5"]; // sensible default
}

/** Cost in cents (float) for one call's usage. Cache reads bill at ~10% of input,
 *  cache writes at ~125%. */
export function centsForUsage(model: string, u: TokenUsage): number {
  const p = priceFor(model);
  const input =
    (u.input_tokens ?? 0) +
    (u.cache_creation_input_tokens ?? 0) * 1.25 +
    (u.cache_read_input_tokens ?? 0) * 0.1;
  const output = u.output_tokens ?? 0;
  const dollars = (input / 1e6) * p.in + (output / 1e6) * p.out;
  return dollars * 100;
}

const als = new AsyncLocalStorage<{ cents: number }>();

/** Called by the Claude wrapper after each API call. Adds to the active scope. */
export function recordUsage(model: string, usage?: TokenUsage): void {
  if (!usage) return;
  const store = als.getStore();
  if (store) store.cents += centsForUsage(model, usage);
}

/** Run `fn` in a fresh cost scope; return its result plus the cents it spent. */
export async function withCostScope<T>(fn: () => Promise<T>): Promise<{ result: T; cents: number }> {
  const store = { cents: 0 };
  const result = await als.run(store, fn);
  return { result, cents: store.cents };
}
