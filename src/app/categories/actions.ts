// Server actions for category pages. Drafting runs in the background (brief +
// draft + editor pass + grade takes a couple of minutes) and the screens poll
// while a row is DRAFTING. Note what is NOT here: anything that writes to
// Shopify.

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  rescanCategoryPages,
  draftCategoryPage,
  draftCategoryTier,
  fixCategoryPage,
  fixCategoryPassage,
  markCategoryLive,
  markCategoryNeedsRefresh,
  markCategoryNotLive,
  setCategoryStrategy,
} from "@/lib/categories/service";

function refresh(id?: string): void {
  revalidatePath("/categories");
  revalidatePath("/categories/live");
  if (id) {
    revalidatePath(`/categories/${id}`);
    revalidatePath(`/categories/${id}/paste`);
  }
}

const settle = () => new Promise((r) => setTimeout(r, 400));

export async function rescanCategoriesAction(): Promise<void> {
  await rescanCategoryPages().catch((e) =>
    console.error("[categories] rescan failed:", e instanceof Error ? e.message : e),
  );
  refresh();
}

export async function draftCategoryAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  void draftCategoryPage(id).catch((e) =>
    console.error("[categories] draft failed:", e instanceof Error ? e.message : e),
  );
  await settle();
  refresh(id);
  // From the queue, take the operator straight to the page so they watch it write.
  if (formData.get("go") === "1") redirect(`/categories/${id}`);
}

export async function draftTierAction(formData: FormData): Promise<void> {
  const tier = Number(formData.get("tier") ?? 0);
  if (![1, 2, 3].includes(tier)) return;
  void draftCategoryTier(tier).catch((e) =>
    console.error("[categories] tier draft failed:", e instanceof Error ? e.message : e),
  );
  await settle();
  refresh();
}

/** "Fix these" — redraft with the current issues + grader feedback as the steer. */
export async function autoFixCategoryAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  void draftCategoryPage(id, { note: "Fix every issue and grader note from the previous draft." }).catch((e) =>
    console.error("[categories] auto-fix failed:", e instanceof Error ? e.message : e),
  );
  await settle();
  refresh(id);
}

export async function fixCategoryAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "");
  const remember = formData.get("remember") === "on";
  if (!id) return;
  void fixCategoryPage(id, note, remember).catch((e) =>
    console.error("[categories] fix failed:", e instanceof Error ? e.message : e),
  );
  await settle();
  refresh(id);
}

export type PassageFixResult = { ok: boolean; message: string } | null;

/** Highlight → "fix this": rewrites only the highlighted passage. Awaited so the
 *  operator sees the result in place (one small model call + a re-grade). */
export async function fixPassageCategoryAction(
  _prev: PassageFixResult,
  formData: FormData,
): Promise<PassageFixResult> {
  const id = String(formData.get("id") ?? "");
  const selectedText = String(formData.get("selectedText") ?? "");
  const instruction = String(formData.get("instruction") ?? "");
  if (!id || !selectedText.trim() || !instruction.trim()) {
    return { ok: false, message: "Highlight some text and say what to change." };
  }
  try {
    const res = await fixCategoryPassage(id, selectedText, instruction);
    refresh(id);
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[categories] passage fix failed:", msg);
    return { ok: false, message: `Couldn't apply that fix: ${msg}` };
  }
}

export async function markCategoryLiveAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await markCategoryLive(id).catch((e) =>
    console.error("[categories] mark live failed:", e instanceof Error ? e.message : e),
  );
  refresh(id);
  redirect(`/categories/live?just=${encodeURIComponent(id)}`);
}

export async function markCategoryNotLiveAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await markCategoryNotLive(id).catch(() => {});
  refresh(id);
}

export async function markCategoryRefreshAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await markCategoryNeedsRefresh(id).catch(() => {});
  refresh(id);
}

export async function setCategoryStrategyAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await setCategoryStrategy(id, {
    tier: Number(formData.get("tier") ?? 0) || undefined,
    targetKeyword: String(formData.get("targetKeyword") ?? ""),
  }).catch(() => {});
  refresh(id);
}
