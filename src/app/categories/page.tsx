import { Shell } from "@/components/shell";
import { SubmitButton } from "@/components/submit-button";
import { CategoryPoll } from "@/components/category-poll";
import { CategoryList } from "@/components/category-list";
import { getBusiness } from "@/lib/data/repo";
import {
  listCategoryPages,
  flagCategoryRefreshes,
  recoverInterruptedCategoryDrafts,
  sortByPriority,
} from "@/lib/categories/service";
import { rescanCategoriesAction, draftTierAction } from "@/app/categories/actions";
import { Layers, RefreshCw, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CategoriesQueuePage() {
  await Promise.all([flagCategoryRefreshes().catch(() => 0), recoverInterruptedCategoryDrafts().catch(() => 0)]);
  const [biz, pages] = await Promise.all([getBusiness(), listCategoryPages()]);
  const active = pages.filter((p) => !p.removed);
  const count = (s: string) => active.filter((p) => p.status === s).length;
  const drafting = count("DRAFTING");
  const ready = count("DRAFT_READY");
  const look = count("NEEDS_FIX");
  const live = count("LIVE");
  const refresh = count("NEEDS_REFRESH");
  const hubsToDraft = active.filter((p) => p.tier === 1 && p.status === "NOT_STARTED").length;

  return (
    <Shell>
      <CategoryPoll active={drafting > 0} />
      <div className="mx-auto flex max-w-[760px] flex-col gap-6 pt-4">
        {/* Header — the counts live here; the list below is the work */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight">Category pages</h1>
            {active.length > 0 ? (
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[13px] text-[var(--muted)]">
                <span>{active.length} pages on {biz.domain}</span>
                {ready > 0 && (
                  <>
                    <span>·</span>
                    <span className="font-medium text-[var(--success)]">{ready} ready to review</span>
                  </>
                )}
                {look > 0 && (
                  <>
                    <span>·</span>
                    <span className="font-medium text-[var(--warn)]">{look} need a look</span>
                  </>
                )}
                {drafting > 0 && (
                  <>
                    <span>·</span>
                    <span className="font-medium text-[var(--accent)]">{drafting} writing</span>
                  </>
                )}
                {refresh > 0 && (
                  <>
                    <span>·</span>
                    <span className="font-medium text-[var(--danger)]">{refresh} due for refresh</span>
                  </>
                )}
                <span>·</span>
                <span>{live} live</span>
              </p>
            ) : (
              <p className="mt-1 text-[13px] text-[var(--muted)]">You paste, the engine writes. Nothing here publishes on its own.</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {hubsToDraft > 0 && drafting === 0 && (
              <form action={draftTierAction}>
                <input type="hidden" name="tier" value="1" />
                <SubmitButton
                  icon={<Sparkles size={13} />}
                  pendingLabel="Starting…"
                  title={`Draft the ${hubsToDraft} hub pages that haven’t been started, one after another`}
                  className="flex h-[38px] items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-3.5 text-[12px] font-medium text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                >
                  Draft all hubs ({hubsToDraft})
                </SubmitButton>
              </form>
            )}
            <form action={rescanCategoriesAction}>
              <SubmitButton
                icon={<RefreshCw size={13} />}
                pendingLabel="Scanning…"
                title="Crawl the store and refresh the list of collection pages"
                className="flex h-[38px] items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-3.5 text-[12px] font-medium text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              >
                Rescan site
              </SubmitButton>
            </form>
          </div>
        </div>

        {pages.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-8 py-12 text-center">
            <Layers size={26} className="text-[var(--muted)]" />
            <div className="text-[16px] font-medium">No collection pages yet</div>
            <p className="max-w-md text-[13px] text-[var(--muted)]">
              Scan {biz.domain} and every collection page shows up here with its current title, product count and a
              starting keyword — before anyone writes a word.
            </p>
            <form action={rescanCategoriesAction}>
              <SubmitButton
                icon={<RefreshCw size={14} />}
                pendingLabel="Scanning site…"
                className="flex h-[46px] items-center gap-2 rounded-full bg-[var(--accent)] px-6 text-[14px] font-semibold text-white hover:opacity-90"
              >
                Scan the site now
              </SubmitButton>
            </form>
          </div>
        ) : (
          <CategoryList pages={sortByPriority(pages)} />
        )}
      </div>
    </Shell>
  );
}
