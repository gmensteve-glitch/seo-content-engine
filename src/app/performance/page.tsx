import Link from "next/link";
import { Shell } from "@/components/shell";
import { PageHeader, Card, Pill } from "@/components/ui";
import { getLivePages, getBusiness, getCostSummary } from "@/lib/data/repo";
import { listPublishedBlogs, getStalePosts } from "@/lib/pipeline/service";
import { refreshOnePostAction } from "@/app/actions";
import { BarChart3, TrendingUp, PenLine, FileText, ExternalLink, DollarSign, RefreshCw, TrendingDown, Clock } from "lucide-react";

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const FLAG_TONE = {
  boost: "warn",
  rewrite: "warn",
  decaying: "danger",
  healthy: "success",
} as const;

export const dynamic = "force-dynamic";

export default async function PerformancePage() {
  const biz = await getBusiness();
  const [pages, published, cost, stale] = await Promise.all([
    getLivePages(),
    listPublishedBlogs(biz.id).catch(() => []),
    getCostSummary(biz.id),
    getStalePosts(biz.id, 12).catch(() => []),
  ]);

  return (
    <Shell>
      <PageHeader
        title="Performance"
        subtitle="Results from Google Search Console + GA4. The engine turns these signals into improvement tasks."
      />

      {/* Needs refresh — decaying/aging published posts, worst-first, one-click rewrite */}
      <Card className="mb-4">
        <div className="mb-3 flex items-center gap-2">
          <RefreshCw size={16} className="text-[var(--accent)]" />
          <h2 className="text-[15px] font-medium">Needs refresh</h2>
          {stale.length > 0 && (
            <span className="ml-auto rounded-full bg-[var(--warn-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--warn)]">
              {stale.length} to review
            </span>
          )}
        </div>
        {stale.length === 0 ? (
          <p className="text-[12px] text-[var(--subtle)]">
            Nothing stale right now — every published post is recent and holding its traffic. Posts
            surface here when Search Console shows them decaying or they age past the refresh window.
          </p>
        ) : (
          <>
            <p className="mb-3 text-[11px] text-[var(--subtle)]">
              These live posts are decaying or aging. Refresh rewrites one for the current year —
              updated stats, stronger quotable openings — and drops it back in{" "}
              <Link href="/ready" className="text-[var(--accent)] hover:underline">
                Ready
              </Link>{" "}
              for you to review and re-publish (it updates the same Shopify article in place).
            </p>
            <div className="space-y-2">
              {stale.map((s) => (
                <div
                  key={s.draftId}
                  className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3"
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      s.decaying
                        ? "bg-[var(--danger-bg)] text-[var(--danger)]"
                        : "bg-[var(--surface-2)] text-[var(--muted)]"
                    }`}
                  >
                    {s.decaying ? <TrendingDown size={14} /> : <Clock size={14} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium">
                      {s.url ? (
                        <Link
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 hover:underline"
                        >
                          {s.title}
                          <ExternalLink size={11} className="shrink-0 text-[var(--subtle)]" />
                        </Link>
                      ) : (
                        s.title
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px]">
                      <span
                        className={`font-medium ${
                          s.decaying ? "text-[var(--danger)]" : "text-[var(--muted)]"
                        }`}
                      >
                        {s.reason}
                      </span>
                      {s.refreshedAt && (
                        <span className="text-[var(--subtle)]">· last refreshed {s.ageMonths} mo ago</span>
                      )}
                    </div>
                  </div>
                  <form action={refreshOnePostAction} className="shrink-0">
                    <input type="hidden" name="draftId" value={s.draftId} />
                    <button
                      type="submit"
                      title="Rewrite this post for the current year and move it into Ready for review"
                      className="flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-3 py-1 text-[12px] text-[var(--muted)] hover:bg-[var(--surface-2)]"
                    >
                      <RefreshCw size={13} /> Refresh
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* Cost per blog — the real $/quality curve from recorded token usage */}
      <Card className="mb-4">
        <div className="mb-3 flex items-center gap-2">
          <DollarSign size={16} className="text-[var(--accent)]" />
          <h2 className="text-[15px] font-medium">Cost per blog</h2>
          {cost.avgCents !== null && (
            <span className="ml-auto text-[13px] text-[var(--muted)]">
              avg <b className="text-[var(--text)]">{usd(cost.avgCents)}</b> · {cost.count} tracked
            </span>
          )}
        </div>
        {cost.avgCents === null ? (
          <p className="text-[12px] text-[var(--subtle)]">
            No cost data yet — new pieces record their token cost as the engine produces them.
          </p>
        ) : (
          <div className="space-y-1.5">
            <div className="mb-1 text-[11px] text-[var(--subtle)]">Average cost by quality score</div>
            {cost.byBand.map((b) => {
              const max = Math.max(...cost.byBand.map((x) => x.avgCents), 1);
              const pct = (b.avgCents / max) * 100;
              return (
                <div key={b.band} className="flex items-center gap-3 text-[12px]">
                  <span className="w-14 shrink-0 text-[var(--muted)]">{b.band}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded bg-[var(--surface-2)]">
                    <div
                      className="h-full rounded bg-[var(--accent)]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-[var(--text)]">
                    {usd(b.avgCents)} <span className="text-[var(--subtle)]">×{b.count}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* All published posts — straight from your live blog */}
      <Card className="mb-4">
        <div className="mb-3 flex items-center gap-2">
          <FileText size={16} className="text-[var(--accent)]" />
          <h2 className="text-[15px] font-medium">All published posts</h2>
          <span className="ml-auto rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
            {published.length} live on your blog
          </span>
        </div>
        {published.length === 0 ? (
          <p className="text-[12px] text-[var(--subtle)]">
            Couldn&apos;t load posts from your blog — check the Shopify connector.
          </p>
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="sticky top-0 bg-[var(--surface-1)] text-[11px] uppercase tracking-wide text-[var(--subtle)]">
                <tr className="border-b border-[var(--border)]">
                  <th className="pb-2 pr-4 font-medium">Post</th>
                  <th className="pb-2 pr-4 font-medium">Updated</th>
                  <th className="pb-2 font-medium">Clicks 28d</th>
                </tr>
              </thead>
              <tbody>
                {published.map((p) => (
                  <tr key={p.cmsId} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2 pr-4">
                      <Link
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-medium hover:underline"
                      >
                        {p.title}
                        <ExternalLink size={11} className="text-[var(--subtle)]" />
                      </Link>
                    </td>
                    <td className="py-2 pr-4 text-[12px] text-[var(--muted)]">
                      {new Date(p.updatedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-2 text-[12px] text-[var(--subtle)]">— (connect GSC)</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[11px] text-[var(--subtle)]">
          Click totals, impressions, and rankings light up here once Google Search Console is
          connected.
        </p>
      </Card>

      <Card className="mb-4">
        <div className="flex items-center gap-2 text-[13px] text-[var(--muted)]">
          <BarChart3 size={16} className="text-[var(--accent)]" />
          <span>
            Embedded Looker Studio report goes here (GSC + GA4) — we plug in the free report rather
            than rebuilding analytics.
          </span>
        </div>
        <div className="mt-3 flex h-40 items-center justify-center rounded-lg border border-dashed border-[var(--border)] text-[12px] text-[var(--subtle)]">
          Looker Studio embed placeholder
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-[15px] font-medium">Pages &amp; signals</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="text-[11px] uppercase tracking-wide text-[var(--subtle)]">
              <tr className="border-b border-[var(--border)]">
                <th className="pb-2 pr-4 font-medium">Page</th>
                <th className="pb-2 pr-4 font-medium">Pos.</th>
                <th className="pb-2 pr-4 font-medium">CTR</th>
                <th className="pb-2 pr-4 font-medium">Clicks 28d</th>
                <th className="pb-2 font-medium">Signal</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-2.5 pr-4">
                    <div className="font-medium">{p.title}</div>
                    <div className="text-[11px] text-[var(--subtle)]">{p.url}</div>
                  </td>
                  <td className="py-2.5 pr-4">{p.position ?? "—"}</td>
                  <td className="py-2.5 pr-4">{p.ctr != null ? `${p.ctr}%` : "—"}</td>
                  <td className="py-2.5 pr-4">{p.clicks28d ?? "—"}</td>
                  <td className="py-2.5">
                    {p.flag && (
                      <Pill tone={FLAG_TONE[p.flag]}>
                        {p.flag === "boost" && <TrendingUp size={11} className="mr-1 inline align-middle" />}
                        {p.flag === "rewrite" && <PenLine size={11} className="mr-1 inline align-middle" />}
                        {p.flag}
                      </Pill>
                    )}
                  </td>
                </tr>
              ))}
              {pages.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-[12px] text-[var(--subtle)]">
                    No live pages yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </Shell>
  );
}
