import Link from "next/link";
import { Shell } from "@/components/shell";
import { PageHeader, Card } from "@/components/ui";
import { getBusiness } from "@/lib/data/repo";
import { getStalePosts } from "@/lib/pipeline/service";
import { refreshOnePostAction, refreshStalePostsAction } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { RefreshCw, TrendingDown, Clock, ExternalLink, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RefreshPage() {
  const biz = await getBusiness();
  const stale = await getStalePosts(biz.id, 40).catch(() => []);
  const decaying = stale.filter((s) => s.decaying).length;

  return (
    <Shell>
      <div className="mb-4 flex items-start justify-between gap-4">
        <PageHeader
          title="Needs refresh"
          subtitle="Live posts that are slipping or aging. Refresh rewrites one for the current year — updated stats, stronger quotable openings — and drops it into Ready to review, then re-publishes to the same article."
        />
        {stale.length > 0 && (
          <form action={refreshStalePostsAction} className="shrink-0">
            <SubmitButton
              icon={<RefreshCw size={13} />}
              pendingLabel="Starting…"
              title="Refresh the next few worst posts automatically"
              className="flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3.5 py-2 text-[12px] font-medium text-white hover:opacity-90"
            >
              Refresh next few
            </SubmitButton>
          </form>
        )}
      </div>

      {stale.length === 0 ? (
        <Card>
          <div className="flex items-center gap-2 py-4 text-[13px] text-[var(--muted)]">
            <CheckCircle2 size={18} className="text-[var(--success)]" />
            Nothing stale — every published post is recent and holding its traffic. Posts land here
            when Search Console shows them decaying or they age past the refresh window.
          </div>
        </Card>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
            <span className="rounded-full bg-[var(--warn-bg)] px-2 py-0.5 font-medium text-[var(--warn)]">
              {stale.length} to review
            </span>
            {decaying > 0 && (
              <span className="rounded-full bg-[var(--danger-bg)] px-2 py-0.5 font-medium text-[var(--danger)]">
                {decaying} losing traffic
              </span>
            )}
          </div>
          <div className="space-y-2">
            {stale.map((p) => (
              <Card key={p.draftId} className="flex items-center gap-3">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    p.decaying
                      ? "bg-[var(--danger-bg)] text-[var(--danger)]"
                      : "bg-[var(--surface-2)] text-[var(--muted)]"
                  }`}
                >
                  {p.decaying ? <TrendingDown size={15} /> : <Clock size={15} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium">
                    {p.url ? (
                      <Link
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 hover:underline"
                      >
                        {p.title}
                        <ExternalLink size={11} className="shrink-0 text-[var(--subtle)]" />
                      </Link>
                    ) : (
                      p.title
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px]">
                    <span className={`font-medium ${p.decaying ? "text-[var(--danger)]" : "text-[var(--muted)]"}`}>
                      {p.reason}
                    </span>
                    {p.refreshedAt && (
                      <span className="text-[var(--subtle)]">· last refreshed {p.ageMonths} mo ago</span>
                    )}
                  </div>
                </div>
                <form action={refreshOnePostAction} className="shrink-0">
                  <input type="hidden" name="draftId" value={p.draftId} />
                  <SubmitButton
                    icon={<RefreshCw size={13} />}
                    pendingLabel="Refreshing…"
                    title="Rewrite this post for the current year and move it into Ready for review"
                    className="flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-3 py-1.5 text-[12px] text-[var(--muted)] hover:bg-[var(--surface-2)]"
                  >
                    Refresh
                  </SubmitButton>
                </form>
              </Card>
            ))}
          </div>
        </>
      )}
    </Shell>
  );
}
