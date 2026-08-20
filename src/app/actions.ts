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
} from "@/lib/pipeline/service";
import { getBusiness } from "@/lib/data/repo";

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
  revalidatePath("/quality");
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
  revalidatePath("/quality");
}

// The Review lane (auto-boost + highlight-edit) runs through /api/review/* so
// the page can update live — see src/app/review/[id]/ReviewEditor.tsx.
