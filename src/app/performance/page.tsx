import Link from "next/link";
import { Shell } from "@/components/shell";
import { PageHeader, Card, Pill } from "@/components/ui";
import { getLivePages, getBusiness, getCostSummary } from "@/lib/data/repo";
import { listPublishedBlogs } from "@/lib/pipeline/service";
import {
  relocalizePostsAction,
  refreshStalePostsAction,
  fixPublishedPostsAction,
  scrubReadyFabricationAction,
} from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { TrendingUp, PenLine, FileText, ExternalLink, DollarSign, RefreshCw, MapPin, Undo2, ShieldCheck, Wrench } from "lucide-react";

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
  const [pages, published, cost] = await Promise.all([
    getLivePages(),
    listPublishedBlogs(biz.id).catch(() => []),
    getCostSummary(biz.id),
  ]);

  return (
    <Shell>
      <PageHeader
        title="Performance"
        subtitle="Results from Google Search Console + GA4. The engine turns these signals into improvement tasks."
      />

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
                  <th className="pb-2 font-medium">Updated</th>
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
                    <td className="py-2 text-[12px] text-[var(--muted)]">
                      {new Date(p.updatedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[11px] text-[var(--subtle)]">
          Live query rankings, clicks and impressions are in the “Pages &amp; signals” table below and
          on the Overview — pulled from Search Console.
        </p>
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

      {/* Content maintenance — occasional, run-when-needed tools (not part of the
          daily review/publish flow, so they live here rather than on Ready). */}
      <Card className="mt-4">
        <div className="mb-1 flex items-center gap-2">
          <Wrench size={16} className="text-[var(--accent)]" />
          <h2 className="text-[15px] font-medium">Content maintenance</h2>
        </div>
        <p className="mb-3 text-[11px] text-[var(--subtle)]">
          One-off library tools. The engine already bakes these standards into every new post — use
          these to bring the existing back catalog up to date. Rebuilt/refreshed pieces land in
          Ready for your review.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <form action={relocalizePostsAction}>
            <SubmitButton
              icon={<MapPin size={13} />}
              pendingLabel="Starting…"
              title="Rebuild every existing LOCAL post to the local + AEO template (place-named FTC-anchored answer, law/delivery/funeral-home sections) — lands in Ready for review"
              className="flex items-center gap-1.5 rounded-full border border-[var(--accent)] px-3 py-1 text-[12px] text-[var(--accent)] hover:bg-[var(--accent-bg)]"
            >
              Rebuild local (new template)
            </SubmitButton>
          </form>
          <form action={refreshStalePostsAction}>
            <SubmitButton
              icon={<RefreshCw size={13} />}
              pendingLabel="Starting…"
              title="Refresh a few decaying/stale published posts (update stats + freshness) into Ready for review — also runs automatically on a schedule"
              className="flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-3 py-1 text-[12px] text-[var(--muted)] hover:bg-[var(--surface-2)]"
            >
              Refresh stale posts
            </SubmitButton>
          </form>
          <form action={fixPublishedPostsAction}>
            <SubmitButton
              icon={<Undo2 size={13} />}
              pendingLabel="Starting…"
              title="Fix every already-PUBLISHED Shopify post: scrub fabricated business-operations claims, update it on Shopify, and set it Hidden for review"
              className="flex items-center gap-1.5 rounded-full border border-[var(--warn)] px-3 py-1 text-[12px] text-[var(--warn)] hover:bg-[var(--warn-bg)]"
            >
              Fix &amp; hide published
            </SubmitButton>
          </form>
          <form action={scrubReadyFabricationAction}>
            <SubmitButton
              icon={<ShieldCheck size={13} />}
              pendingLabel="Starting…"
              title="Rewrite every Ready post to remove fabricated delivery timelines / shipping steps, and remember the rule for future posts"
              className="flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-3 py-1 text-[12px] text-[var(--muted)] hover:bg-[var(--surface-2)]"
            >
              Scrub fabricated claims
            </SubmitButton>
          </form>
        </div>
      </Card>
    </Shell>
  );
}
