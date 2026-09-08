// Server actions for category pages. Drafting runs in the background (an Opus
// brief + draft + grade takes a minute or two) and the page polls while a row
// is DRAFTING. Note what is NOT here: anything that writes to Shopify.

"use server";

import { revalidatePath } from "next/cache";
import {
  rescanCategoryPages,
  draftCategoryPage,
  draftCategoryTier,
  fixCategoryPage,
  markCategoryLive,
  markCategoryNeedsRefresh,
  markCategoryNotLive,
  setCategoryStrategy,
} from "@/lib/categories/service";

function refresh(id?: string): void {
  revalidatePath("/categories");
  if (id) revalidatePath(`/categories/${id}`);
}

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
  // Give the DRAFTING status a moment to land so the page reflects it.
  await new Promise((r) => setTimeout(r, 400));
  refresh(id);
}

export async function draftTierAction(formData: FormData): Promise<void> {
  const tier = Number(formData.get("tier") ?? 0);
  if (![1, 2, 3].includes(tier)) return;
  void draftCategoryTier(tier).catch((e) =>
    console.error("[categories] tier draft failed:", e instanceof Error ? e.message : e),
  );
  await new Promise((r) => setTimeout(r, 400));
  refresh();
}

export async function fixCategoryAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "");
  const remember = formData.get("remember") === "on";
  if (!id) return;
  void fixCategoryPage(id, note, remember).catch((e) =>
    console.error("[categories] fix failed:", e instanceof Error ? e.message : e),
  );
  await new Promise((r) => setTimeout(r, 400));
  refresh(id);
}

export async function markCategoryLiveAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await markCategoryLive(id).catch((e) =>
    console.error("[categories] mark live failed:", e instanceof Error ? e.message : e),
  );
  refresh(id);
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
