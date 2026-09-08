import Link from "next/link";
import { Shell } from "@/components/shell";
import { SubmitButton } from "@/components/submit-button";
import { listLiveCategoryPages, flagCategoryRefreshes } from "@/lib/categories/service";
import { draftCategoryAction } from "@/app/categories/actions";
import { CheckCircle2, Clock, ExternalLink, RefreshCw, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CategoryLivePage({
  searchParams,
}: {
  searchParams: Promise<{ just?: string }>;
}) {
  const sp = await searchParams;
  await flagCategoryRefreshes().catch(() => 0);
  const pages = await listLiveCategoryPages();
  const due = pages.filter((p) => p.status === "NEEDS_REFRESH");
  const just = sp.just ? pages.find((p) => p.id === sp.just) : null;

  return (
    <Shell>
      <div className="mx-auto flex max-w-[720px] flex-col gap-6 pt-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Live pages</h1>
          <p className="mt-1 text-[13px] text-[var(--muted)]">
            Category pages you’ve pasted into Shopify. Each one is flagged for a refresh after 90 days.
          </p>
        </div>

        {just && (
          <div className="flex items-center gap-2.5 rounded-xl border border-[var(--success)] bg-[var(--success-bg)] px-5 py-4 text-[14px] text-[var(--success)]">
            <CheckCircle2 size={18} />
            <span>
              <span className="font-semibold">{just.name}</span> is live. Nice work.
            </span>
            <Link href="/categories" className="ml-auto flex items-center gap-1 text-[13px] font-medium hover:underline">
              Next page <ArrowRight size={13} />
            </Link>
          </div>
        )}

        {pages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-strong)] px-6 py-14 text-center text-[13px] text-[var(--muted)]">
            Nothing live yet. Pages land here after you paste one and mark it live.
          </div>
        ) : (
          <>
            {due.length > 0 && (
              <div className="text-[12px] font-medium">
                <span className="rounded-full bg-[var(--danger-bg)] px-[11px] py-[5px] text-[var(--danger)]">
                  {due.length} due for refresh
                </span>
              </div>
            )}
            <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)]">
              {pages.map((p) => (
                <div key={p.id} className="flex h-[54px] items-center gap-3 border-b border-[var(--border)] px-[18px] last:border-b-0">
                  {p.status === "NEEDS_REFRESH" ? (
                    <Clock size={15} className="shrink-0 text-[var(--danger)]" />
                  ) : (
                    <CheckCircle2 size={15} className="shrink-0 text-[var(--success)]" />
                  )}
                  <Link href={`/categories/${p.id}`} className="truncate text-[13.5px] font-medium hover:underline">
                    {p.name}
                  </Link>
                  <a href={p.url} target="_blank" rel="noreferrer" className="shrink-0 text-[var(--subtle)] hover:text-[var(--text)]" title="View live page">
                    <ExternalLink size={12} />
                  </a>
                  <div className="min-w-0 flex-1 truncate text-[12px] text-[var(--subtle)]">
                    {p.status === "NEEDS_REFRESH"
                      ? "Due for a refresh"
                      : `Live since ${p.liveAt ? new Date(p.liveAt).toLocaleDateString() : "—"} · refresh ${p.refreshDueAt ? new Date(p.refreshDueAt).toLocaleDateString() : "—"}`}
                  </div>
                  {p.status === "NEEDS_REFRESH" ? (
                    <form action={draftCategoryAction} className="shrink-0">
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="go" value="1" />
                      <SubmitButton
                        icon={<RefreshCw size={12} />}
                        pendingLabel="Starting…"
                        className="flex h-[34px] items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-3 text-[12px] font-medium hover:bg-[var(--surface-2)]"
                      >
                        Refresh
                      </SubmitButton>
                    </form>
                  ) : (
                    <Link href={`/categories/${p.id}`} className="shrink-0 text-[12px] font-medium text-[var(--accent)] hover:underline">
                      Open →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}
