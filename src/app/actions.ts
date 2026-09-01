// Server actions for the human-gate buttons. These run on the server, mutate
// through the pipeline service, then revalidate the affected routes so the
// dashboard reflects the new state on the next render.

"use server";

import { revalidatePath } from "next/cache";
import {
  buildBriefFromIdea,
  approveBrief,
  rejectBrief,
  dismissIdea,
  scheduleDraft,
  unscheduleDraft,
  publishNow,
  generateIdeas,
  setLocalRatio,
  setQualityThreshold,
  requestBoostAllNearMisses,
  scrubAllReadyFabrication,
  fixAllPublishedPosts,
  syncGeoCitations,
  autoRefreshBusiness,
  refreshPublishedPost,
  saveConnector,
  removeConnector,
} from "@/lib/pipeline/service";
import { getBusiness } from "@/lib/data/repo";
import { CONNECTOR_SPECS, isConnectable } from "@/lib/connectors/connect-fields";
import type { ConnectorType } from "@prisma/client";

// Refresh a few decaying/stale published posts into Ready for re-review
// (background — each is an LLM rewrite). Fire-and-forget.
export async function refreshStalePostsAction(): Promise<void> {
  const biz = await getBusiness();
  void autoRefreshBusiness(biz.id, 3).catch((e) =>
    console.error("[refresh-stale] failed:", e instanceof Error ? e.message : e),
  );
  revalidatePath("/ready");
}

// Refresh ONE specific published post (from the "Needs refresh" panel) back
// into Ready for review. Awaited so the panel reflects it on reload; the rewrite
// is one LLM pass, quick enough to hold the request.
export async function refreshOnePostAction(formData: FormData): Promise<void> {
  const draftId = String(formData.get("draftId"));
  if (!draftId) return;
  await refreshPublishedPost(draftId).catch((e) =>
    console.error("[refresh-one] failed:", e instanceof Error ? e.message : e),
  );
  revalidatePath("/performance");
  revalidatePath("/ready");
}

// Run an on-demand GEO citation check (asks the answer engines our target
// questions now, instead of waiting for the daily sync). Synchronous so the
// page shows fresh results on reload; capped to keep it snappy.
export async function runGeoCheckAction(): Promise<void> {
  const biz = await getBusiness();
  await syncGeoCitations(biz.id, { max: 10 }).catch((e) =>
    console.error("[geo-check] failed:", e instanceof Error ? e.message : e),
  );
  revalidatePath("/geo");
  revalidatePath("/");
}

// Scrub fabricated logistics/timelines from every Ready blog (background — it
// runs an LLM pass per piece). Fire-and-forget so the request returns fast.
export async function scrubReadyFabricationAction(): Promise<void> {
  void scrubAllReadyFabrication().catch((e) =>
    console.error("[scrub-all] failed:", e instanceof Error ? e.message : e),
  );
  revalidatePath("/ready");
}

// Fix every already-published post: scrub fabricated business-operations claims,
// update the live Shopify article, and set it Hidden for review. Background —
// touches live Shopify per post, so it's fire-and-forget.
export async function fixPublishedPostsAction(): Promise<void> {
  void fixAllPublishedPosts().catch((e) =>
    console.error("[fix-published-all] failed:", e instanceof Error ? e.message : e),
  );
  revalidatePath("/ready");
  revalidatePath("/performance");
}

// ── Connectors (in-app plug-and-play) ────────────────────────

/** Save a connector's credentials from the Connect modal, scoped to the current
 *  business. Reads only the fields defined for that connector type. */
export async function connectConnectorAction(formData: FormData): Promise<void> {
  const type = String(formData.get("type"));
  if (!isConnectable(type)) throw new Error(`Unknown or non-storable connector: ${type}`);
  const spec = CONNECTOR_SPECS[type];
  const config: Record<string, string> = {};
  for (const f of spec.fields) {
    const v = String(formData.get(f.name) ?? "").trim();
    if (f.required && !v) throw new Error(`${f.label} is required`);
    if (v) config[f.name] = v;
  }
  const bizId = (await getBusiness()).id;
  await saveConnector(bizId, type as ConnectorType, config);
  revalidatePath("/connectors");
  revalidatePath("/");
}

/** Disconnect a connector (remove its stored credentials). */
export async function disconnectConnectorAction(formData: FormData): Promise<void> {
  const type = String(formData.get("type"));
  if (!isConnectable(type)) return;
  const bizId = (await getBusiness()).id;
  await removeConnector(bizId, type as ConnectorType);
  revalidatePath("/connectors");
  revalidatePath("/");
}

export async function buildBriefAction(formData: FormData): Promise<void> {
  await buildBriefFromIdea(String(formData.get("ideaId")));
  revalidatePath("/ideas");
  revalidatePath("/briefs");
  revalidatePath("/pipeline");
  revalidatePath("/");
}

/** Set the local/evergreen content mix that drives idea generation + auto-advance. */
export async function setLocalRatioAction(formData: FormData): Promise<void> {
  const ratio = Number(formData.get("localRatio"));
  const bizFromForm = formData.get("businessId");
  const bizId = bizFromForm ? String(bizFromForm) : (await getBusiness()).id;
  if (Number.isFinite(ratio)) await setLocalRatio(bizId, ratio);
  revalidatePath("/ideas");
  revalidatePath("/");
}

/** Set the quality bar a piece must clear to reach the Ready list. */
export async function setQualityThresholdAction(formData: FormData): Promise<void> {
  const threshold = Number(formData.get("threshold"));
  const bizFromForm = formData.get("businessId");
  const bizId = bizFromForm ? String(bizFromForm) : (await getBusiness()).id;
  if (Number.isFinite(threshold)) await setQualityThreshold(bizId, threshold);
  revalidatePath("/ideas");
  revalidatePath("/");
}

/** Auto-improve every near-miss (data boost + keep-best revises) in the background. */
export async function boostAllNearMissesAction(formData: FormData): Promise<void> {
  const bizFromForm = formData.get("businessId");
  const bizId = bizFromForm ? String(bizFromForm) : (await getBusiness()).id;
  await requestBoostAllNearMisses(bizId);
  revalidatePath("/review");
  revalidatePath("/");
}

export async function dismissIdeaAction(formData: FormData): Promise<void> {
  await dismissIdea(String(formData.get("ideaId")));
  revalidatePath("/ideas");
  revalidatePath("/pipeline");
}

/** Generate a fresh batch of ideas for the current business (top of the funnel). */
export async function generateIdeasAction(formData: FormData): Promise<void> {
  const bizFromForm = formData.get("businessId");
  const bizId = bizFromForm ? String(bizFromForm) : (await getBusiness()).id;
  await generateIdeas(bizId, 6);
  revalidatePath("/ideas");
  revalidatePath("/pipeline");
  revalidatePath("/");
}

export async function approveBriefAction(formData: FormData): Promise<void> {
  await approveBrief(String(formData.get("briefId")));
  revalidatePath("/briefs");
  revalidatePath("/pipeline");
  revalidatePath("/performance");
  revalidatePath("/");
}

export async function rejectBriefAction(formData: FormData): Promise<void> {
  await rejectBrief(String(formData.get("briefId")));
  revalidatePath("/briefs");
  revalidatePath("/pipeline");
  revalidatePath("/");
}

// ── Content calendar ─────────────────────────────────────────

function revalidateCalendar(): void {
  revalidatePath("/calendar");
  revalidatePath("/pipeline");
  revalidatePath("/");
}

/** Place a ready draft on the calendar for auto-publish at the chosen date. */
export async function scheduleDraftAction(formData: FormData): Promise<void> {
  const draftId = String(formData.get("draftId"));
  const when = String(formData.get("scheduledFor")); // yyyy-mm-dd, datetime-local, or ISO
  if (!draftId || !when) return;
  // Interpret picker values as UTC so the calendar day/time is unambiguous
  // server-side. Bare date → 14:00 UTC (mid-morning US); datetime-local
  // ("YYYY-MM-DDTHH:MM") → that time in UTC; full ISO passes through.
  let iso = when;
  if (/^\d{4}-\d{2}-\d{2}$/.test(when)) iso = `${when}T14:00:00.000Z`;
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when)) iso = `${when}:00.000Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return;
  await scheduleDraft(draftId, date);
  revalidateCalendar();
}

/** Take a draft back off the calendar (return it to the ready queue). */
export async function unscheduleDraftAction(formData: FormData): Promise<void> {
  await unscheduleDraft(String(formData.get("draftId")));
  revalidateCalendar();
}

/** Publish a ready/scheduled draft right now, bypassing its calendar date. */
export async function publishNowAction(formData: FormData): Promise<void> {
  await publishNow(String(formData.get("draftId")), "published");
  revalidateCalendar();
  revalidatePath("/performance");
}

// The Review lane (auto-boost + highlight-edit) runs through /api/review/* so
// the page can update live — see src/app/review/[id]/ReviewEditor.tsx.
