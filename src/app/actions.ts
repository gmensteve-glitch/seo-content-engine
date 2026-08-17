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
  updateDraftBody,
  regradeDraft,
} from "@/lib/pipeline/service";
import { getBusiness } from "@/lib/data/repo";

export async function buildBriefAction(formData: FormData): Promise<void> {
  await buildBriefFromIdea(String(formData.get("ideaId")));
  revalidatePath("/ideas");
  revalidatePath("/briefs");
  revalidatePath("/pipeline");
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

// ── Human polish lane ────────────────────────────────────────

/** Save the operator's edits to a near-miss draft, then re-grade it. If it now
 *  clears the bar it becomes PASSED and moves to the calendar's ready queue. */
export async function polishAndRegradeAction(formData: FormData): Promise<void> {
  const draftId = String(formData.get("draftId"));
  const bodyMd = String(formData.get("bodyMd") ?? "");
  if (!draftId) return;
  if (bodyMd.trim()) await updateDraftBody(draftId, bodyMd);
  await regradeDraft(draftId);
  revalidatePath("/review");
  revalidatePath("/calendar");
  revalidatePath("/quality");
  revalidatePath("/pipeline");
  revalidatePath("/");
}

/** Save edits without re-grading (park progress). */
export async function saveDraftBodyAction(formData: FormData): Promise<void> {
  const draftId = String(formData.get("draftId"));
  const bodyMd = String(formData.get("bodyMd") ?? "");
  if (!draftId) return;
  await updateDraftBody(draftId, bodyMd);
  revalidatePath("/review");
}
