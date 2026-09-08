import Link from "next/link";
import { Shell } from "@/components/shell";
import { SubmitButton } from "@/components/submit-button";
import { CategoryPoll } from "@/components/category-poll";
import { CategoryGroups, type Group } from "@/components/category-groups";
import { getBusiness } from "@/lib/data/repo";
import { listCategoryPages, flagCategoryRefreshes, nextUp } from "@/lib/categories/service";
import { rescanCategoriesAction, draftCategoryAction, autoFixCategoryAction } from "@/app/categories/actions";
import { Layers, RefreshCw, Sparkles, ArrowRight, Loader2, Wand2 } from "lucide-react";

export const dynamic = "force-dynamic";

const GROUPS: Omit<Group, "pages">[] = [
  { tier: 1, title: "Hubs", blurb: "Head-term money pages. Deep guide, comparison table, 6–8 FAQs." },
  { tier: 2, title: "Sub-collections", blurb: "Use-case and material pages. Focused guide, 5–6 FAQs." },
  { tier: 3, title: "State & colour pages", blurb: "Short copy that links back to the hub. State pages are localized." },
];

function tierName(t: 1 | 2 | 3): string {
  return t === 1 ? "Hub" : t === 2 ? "Sub-collection" : "State / colour page";
}

export default async function CategoriesQueuePage() {
  await flagCategoryRefreshes().catch(() => 0);
  const [biz, pages] = await Promise.all([getBusiness(), listCategoryPages()]);
  const active = pages.filter((p) => !p.removed);
  const next = nextUp(pages);
  const count = (s: string) => active.filter((p) => p.status === s).length;
  const drafting = count("DRAFTING");

  return (
    <Shell>
      <CategoryPoll active={drafting > 0} />
      <div className="mx-auto flex max-w-[720px] flex-col gap-7 pt-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight">Category pages</h1>
            <p className="mt-1 text-[13px] text-[var(--muted)]">
              {active.length > 0 ? `${active.length} collection pages on ${biz.domain}. ` : ""}
              You paste, the engine writes. Nothing here publishes on its own.
            </p>
          </div>
          <form action={rescanCategoriesAction} className="shrink-0">
            <SubmitButton
              icon={<RefreshCw size={13} />}
              pendingLabel="Scanning…"
              title="Crawl the store and refresh the list of collection pages"
              className="flex h-[40px] items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-3.5 text-[12px] font-medium hover:bg-[var(--surface-2)]"
            >
              Rescan site
            </SubmitButton>
          </form>
        </div>

        {/* Empty state */}
        {pages.length === 0 && (
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
        )}

        {/* Next up */}
        {next && (
          <div className="flex flex-col items-center gap-[18px] rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-9 py-8 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">Next up</div>
            <div>
              <div className="text-[28px] font-semibold tracking-tight">{next.title}</div>
              <div className="mt-1.5 text-[13px] text-[var(--muted)]">
                {tierName(next.tier)}
                {next.productCount != null ? ` · ${next.productCount} products` : ""}
                {next.targetKeyword ? ` · “${next.targetKeyword}”` : ""}
              </div>
            </div>
            {next.status === "DRAFT_READY" && (
              <>
                <p className="max-w-[420px] text-[14px] leading-relaxed text-[var(--muted)]">
                  Written, fact-checked and graded {next.overall}. Read it once, then paste it into Shopify.
                </p>
                <Link
                  href={`/categories/${next.id}`}
                  className="flex h-[46px] items-center gap-2 rounded-full bg-[var(--success)] px-[26px] text-[14px] font-semibold text-white hover:brightness-110"
                >
                  Review &amp; paste <ArrowRight size={15} />
                </Link>
              </>
            )}
            {next.status === "NEEDS_FIX" && (
              <>
                <p className="max-w-[420px] text-[14px] leading-relaxed text-[var(--muted)]">
                  The draft needs {next.factIssues.length || "a few"} fix{next.factIssues.length === 1 ? "" : "es"}. One
                  click sends it back with the notes.
                </p>
                <div className="flex items-center gap-3">
                  <form action={autoFixCategoryAction}>
                    <input type="hidden" name="id" value={next.id} />
                    <SubmitButton
                      icon={<Wand2 size={14} />}
                      pendingLabel="Starting…"
                      className="flex h-[46px] items-center gap-2 rounded-full bg-[var(--accent)] px-[26px] text-[14px] font-semibold text-white hover:opacity-90"
                    >
                      Fix these
                    </SubmitButton>
                  </form>
                  <Link href={`/categories/${next.id}`} className="text-[13px] text-[var(--muted)] hover:text-[var(--text)]">
                    Take a look first
                  </Link>
                </div>
              </>
            )}
            {(next.status === "NOT_STARTED" || next.status === "NEEDS_REFRESH") && (
              <>
                <p className="max-w-[420px] text-[14px] leading-relaxed text-[var(--muted)]">
                  {next.status === "NEEDS_REFRESH"
                    ? "Live for 90 days — time to re-sync prices and refresh the copy."
                    : next.tier === 1
                      ? "Your highest-value page. Draft it, read it once, paste it. About 15 minutes end to end."
                      : "Draft it, read it once, paste it."}
                </p>
                <form action={draftCategoryAction}>
                  <input type="hidden" name="id" value={next.id} />
                  <input type="hidden" name="go" value="1" />
                  <SubmitButton
                    icon={<Sparkles size={15} />}
                    pendingLabel="Starting…"
                    className="flex h-[46px] items-center gap-2 rounded-full bg-[var(--accent)] px-[26px] text-[14px] font-semibold text-white hover:opacity-90"
                  >
                    {next.status === "NEEDS_REFRESH" ? "Refresh this page" : "Draft this page"}
                  </SubmitButton>
                </form>
              </>
            )}
            {next.status === "DRAFTING" && (
              <>
                <p className="max-w-[420px] text-[14px] leading-relaxed text-[var(--muted)]">
                  Writing now — usually 2–4 minutes. This page updates itself.
                </p>
                <div className="flex h-[46px] items-center gap-2 rounded-full border border-[var(--accent)] px-[26px] text-[14px] font-semibold text-[var(--accent)]">
                  <Loader2 size={15} className="animate-spin" /> Writing…
                </div>
              </>
            )}
          </div>
        )}

        {pages.length > 0 && !next && (
          <div className="rounded-xl border border-[var(--success)] bg-[var(--success-bg)] px-6 py-5 text-center text-[14px] text-[var(--success)]">
            Every category page is live. Nice. The engine will flag pages here when they’re due for a refresh.
          </div>
        )}

        {/* Summary */}
        {active.length > 0 && (
          <div className="flex flex-wrap items-center gap-2.5 text-[12px] font-medium">
            <span className="rounded-full bg-[var(--success-bg)] px-[11px] py-[5px] text-[var(--success)]">
              {count("DRAFT_READY")} ready to paste
            </span>
            <span className="rounded-full bg-[var(--warn-bg)] px-[11px] py-[5px] text-[var(--warn)]">
              {count("NEEDS_FIX")} need a look
            </span>
            <span className="rounded-full bg-[var(--surface-2)] px-[11px] py-[5px] text-[var(--muted)]">
              {count("LIVE")} live
            </span>
            {drafting > 0 && (
              <span className="rounded-full bg-[var(--accent-bg)] px-[11px] py-[5px] text-[var(--accent)]">
                {drafting} drafting
              </span>
            )}
          </div>
        )}

        {/* Groups */}
        {pages.length > 0 && (
          <CategoryGroups groups={GROUPS.map((g) => ({ ...g, pages: pages.filter((p) => p.tier === g.tier) }))} />
        )}
      </div>
    </Shell>
  );
}
