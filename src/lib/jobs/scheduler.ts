// In-process scheduler — the heartbeat that makes the calendar roll out on its
// own with NO external service. Railway runs a single persistent `next start`
// process, so a timer here fires reliably. Started once at server boot from
// src/instrumentation.ts.
//
// Two loops:
//   1. PUBLISH   — every few minutes, publish any scheduled draft whose time has
//                  arrived (the content-calendar auto-rollout).
//   2. REPLENISH — every few hours, top up each business's idea pool so the
//                  pipeline never runs dry (the supply side of the loop).
//
// When Inngest is connected it takes over these crons (durable + observable);
// this in-process scheduler is the zero-dependency default. Guarded so only one
// instance ever runs, and every tick is best-effort (errors never crash boot).

import { hasDatabase } from "@/lib/db";
import { inngestEnabled } from "@/lib/env";

const WORKER_INTERVAL_MS = 45 * 1000; // drain the pipeline queue every 45s
const PUBLISH_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
const ADVANCE_INTERVAL_MS = 20 * 60 * 1000; // auto-advance the pipeline every 20 min
const REPLENISH_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
const BOOT_DELAY_MS = 30 * 1000; // let the server settle before the first tick

// Survive module re-evaluation / HMR: stash the singleton on globalThis.
const g = globalThis as unknown as { __seoScheduler?: { started: boolean } };

async function publishTick(): Promise<void> {
  try {
    const { publishScheduled } = await import("@/lib/pipeline/service");
    const { published } = await publishScheduled();
    if (published.length) {
      console.log(`[scheduler] auto-published ${published.length} scheduled piece(s)`);
    }
  } catch (e) {
    console.error("[scheduler] publish tick failed:", e instanceof Error ? e.message : e);
  }
}

async function workerTick(): Promise<void> {
  try {
    const { processQueuedDrafts } = await import("@/lib/pipeline/service");
    const n = await processQueuedDrafts();
    if (n) console.log(`[scheduler] worker processed ${n} queued draft(s)`);
  } catch (e) {
    console.error("[scheduler] worker tick failed:", e instanceof Error ? e.message : e);
  }
}

async function boostTick(): Promise<void> {
  try {
    const { processBoostRequests } = await import("@/lib/pipeline/service");
    const n = await processBoostRequests();
    if (n) console.log(`[scheduler] processed ${n} boost request(s)`);
  } catch (e) {
    console.error("[scheduler] boost tick failed:", e instanceof Error ? e.message : e);
  }
}

async function replenishTick(): Promise<void> {
  try {
    const { replenishAllIdeas } = await import("@/lib/pipeline/service");
    const counts = await replenishAllIdeas();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total) console.log(`[scheduler] replenished ${total} idea(s) across businesses`);
  } catch (e) {
    console.error("[scheduler] replenish tick failed:", e instanceof Error ? e.message : e);
  }
}

// Auto-advance: idea → brief → approve, self-throttled to a Ready backlog.
// This is what keeps the Ready list stocked without any manual gates.
async function autoAdvanceTick(): Promise<void> {
  try {
    const { autoAdvanceAll } = await import("@/lib/pipeline/service");
    const counts = await autoAdvanceAll();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total) console.log(`[scheduler] auto-advanced ${total} new piece(s) toward Ready`);
  } catch (e) {
    console.error("[scheduler] auto-advance tick failed:", e instanceof Error ? e.message : e);
  }
}

export function startScheduler(): void {
  if (g.__seoScheduler?.started) return;
  if (!hasDatabase) {
    console.log("[scheduler] no DATABASE_URL — scheduler idle (offline/mock mode).");
    return;
  }
  if (inngestEnabled()) {
    console.log("[scheduler] Inngest connected — it owns the crons; in-process scheduler idle.");
    return;
  }

  g.__seoScheduler = { started: true };
  console.log(
    "[scheduler] starting in-process scheduler (worker every 45s, publish every 5m, replenish every 6h).",
  );

  // First ticks shortly after boot, then on their intervals. The worker tick
  // also heals any drafts stranded by a previous crash/restart/timeout.
  setTimeout(() => {
    void workerTick();
    void boostTick();
    void publishTick();
    void replenishTick();
    void autoAdvanceTick();
  }, BOOT_DELAY_MS);

  setInterval(() => void workerTick(), WORKER_INTERVAL_MS);
  setInterval(() => void boostTick(), WORKER_INTERVAL_MS);
  setInterval(() => void publishTick(), PUBLISH_INTERVAL_MS);
  setInterval(() => void autoAdvanceTick(), ADVANCE_INTERVAL_MS);
  setInterval(() => void replenishTick(), REPLENISH_INTERVAL_MS);
}
