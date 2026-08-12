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
} from "@/lib/pipeline/service";

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
  const when = String(formData.get("scheduledFor")); // yyyy-mm-dd or ISO from <input>
  if (!draftId || !when) return;
  // A bare date (yyyy-mm-dd) publishes at 09:00 local-ish; keep it simple and
  // schedule for that day at 14:00 UTC (mid-morning US). Full ISO passes through.
  const date = when.length <= 10 ? new Date(`${when}T14:00:00.000Z`) : new Date(when);
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
