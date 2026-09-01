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
  runAndSaveIntake,
  cloneBusinessSetup,
  relocalizeAllPosts,
  submitRecommendation,
  setRecommendationStatus,
  deleteRecommendation,
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

// Rebuild every existing LOCAL post to the strong local + AEO template, landing
// them in Ready for review. Background (LLM rewrite per post), fire-and-forget.
export async function relocalizePostsAction(): Promise<void> {
  const biz = await getBusiness();
  void relocalizeAllPosts(biz.id).catch((e) =>
    console.error("[relocalize-all] failed:", e instanceof Error ? e.message : e),
  );
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

// ── Store onboarding ─────────────────────────────────────────

/** Run brand intake for the active store: crawl its site → generate + save its
 *  profile, brand voice, and starter pillars. Awaited so the setup page shows the
 *  result the moment it finishes (the crawl + LLM take ~30–60s). */
export async function runIntakeAction(): Promise<void> {
  const biz = await getBusiness();
  await runAndSaveIntake(biz.id).catch((e) =>
    console.error("[intake] failed:", e instanceof Error ? e.message : e),
  );
  revalidatePath("/setup");
  revalidatePath("/strategy");
  revalidatePath("/");
}

/** Copy an existing store's brand setup (profile, voice, pillars, settings) onto
 *  the active store — for near-identical stores. Source id comes from the form. */
export async function cloneSetupAction(formData: FormData): Promise<void> {
  const sourceId = String(formData.get("sourceId") ?? "");
  if (!sourceId) throw new Error("Choose a store to copy from.");
  const biz = await getBusiness();
  await cloneBusinessSetup(sourceId, biz.id);
  revalidatePath("/setup");
  revalidatePath("/strategy");
  revalidatePath("/");
}

/** Kick off a first batch of ideas for the active store (onboarding jump-start). */
export async function seedIdeasAction(): Promise<void> {
  const biz = await getBusiness();
  await generateIdeas(biz.id, 8).catch((e) =>
    console.error("[seed-ideas] failed:", e instanceof Error ? e.message : e),
  );
  revalidatePath("/setup");
  revalidatePath("/ideas");
}

// ── SEO recommendations inbox ────────────────────────────────

const MAX_REC_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB screenshot cap

/** Submit an SEO recommendation (note + optional screenshot) from the dashboard. */
export async function submitRecommendationAction(formData: FormData): Promise<void> {
  const note = String(formData.get("note") ?? "").trim();
  if (!note) throw new Error("A note is required.");
  const author = String(formData.get("author") ?? "").trim();

  let imageData: string | undefined;
  let imageMime: string | undefined;
  const file = formData.get("image");
  if (file && typeof file === "object" && "arrayBuffer" in file && file.size > 0) {
    if (file.size > MAX_REC_IMAGE_BYTES) throw new Error("Screenshot too large (max 5 MB).");
    const mime = file.type || "image/png";
    if (!mime.startsWith("image/")) throw new Error("Attachment must be an image.");
    const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    imageData = `data:${mime};base64,${b64}`;
    imageMime = mime;
  }

  const bizId = (await getBusiness()).id;
  await submitRecommendation(bizId, { note, author: author || undefined, imageData, imageMime });
  revalidatePath("/recommendations");
  revalidatePath("/");
}

/** Toggle a recommendation between open and done. */
export async function recommendationStatusAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") === "DONE" ? "DONE" : "OPEN";
  if (!id) return;
  await setRecommendationStatus(id, status);
  revalidatePath("/recommendations");
}

/** Delete a recommendation. */
export async function deleteRecommendationAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteRecommendation(id);
  revalidatePath("/recommendations");
}

// Build a brief from an idea AND kick off the blog — full-auto: one click takes
// the idea all the way (brief → approve → the writer/grader pipeline runs out of
// band and the finished piece lands in Ready). No manual approval gate.
export async function buildBriefAction(formData: FormData): Promise<void> {
  const ideaId = String(formData.get("ideaId"));
  if (!ideaId) return;
  const briefId = await buildBriefFromIdea(ideaId);
  await approveBrief(briefId);
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
  revalidatePath("/strategy");
  revalidatePath("/ideas");
  revalidatePath("/");
}

/** Set the quality bar a piece must clear to reach the Ready list. */
export async function setQualityThresholdAction(formData: FormData): Promise<void> {
  const threshold = Number(formData.get("threshold"));
  const bizFromForm = formData.get("businessId");
  const bizId = bizFromForm ? String(bizFromForm) : (await getBusiness()).id;
  if (Number.isFinite(threshold)) await setQualityThreshold(bizId, threshold);
  revalidatePath("/strategy");
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
