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
