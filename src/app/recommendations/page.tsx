import { Shell } from "@/components/shell";
import { PageHeader, Card } from "@/components/ui";
import { getRecommendations } from "@/lib/data/repo";
import { RecommendationForm } from "@/components/recommendation-form";
import { recommendationStatusAction, deleteRecommendationAction } from "@/app/actions";
import { Inbox, Check, RotateCcw, Trash2, User } from "lucide-react";

export const dynamic = "force-dynamic";

function timeAgo(iso: string): string {
  const d = Math.max(0, Date.now() - new Date(iso).getTime());
  const days = Math.floor(d / 86_400_000);
  if (days >= 1) return `${days}d ago`;
  const hrs = Math.floor(d / 3_600_000);
  if (hrs >= 1) return `${hrs}h ago`;
  const mins = Math.floor(d / 60_000);
  return mins >= 1 ? `${mins}m ago` : "just now";
}

export default async function RecommendationsPage() {
  const recs = await getRecommendations();
  const open = recs.filter((r) => r.status === "open");
  const done = recs.filter((r) => r.status === "done");

  return (
    <Shell>
      <PageHeader
        title="SEO inbox"
        subtitle="Recommendations from your SEO consultant — a note plus an optional screenshot. They land here for you to review and mark done."
      />

      <Card className="mb-4">
        <div className="mb-3 flex items-center gap-2">
          <Inbox size={16} className="text-[var(--accent)]" />
          <h2 className="text-[15px] font-medium">New recommendation</h2>
        </div>
        <RecommendationForm />
      </Card>

      {recs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-strong)] px-4 py-10 text-center text-[13px] text-[var(--muted)]">
          Nothing yet — recommendations submitted above will show up here.
        </div>
      ) : (
        <div className="space-y-6">
          <Section title="Open" count={open.length} items={open} />
          {done.length > 0 && <Section title="Done" count={done.length} items={done} muted />}
        </div>
      )}
    </Shell>
  );
}

function Section({
  title,
  count,
  items,
  muted,
}: {
  title: string;
  count: number;
  items: Awaited<ReturnType<typeof getRecommendations>>;
  muted?: boolean;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-[14px] font-medium">{title}</h2>
        <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--muted)]">{count}</span>
      </div>
      <div className="space-y-3">
        {items.map((r) => (
          <Card key={r.id} className={muted ? "opacity-70" : ""}>
            <div className="flex flex-col gap-3 sm:flex-row">
              {r.imageData && (
                <a
                  href={r.imageData}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0"
                  title="Open full screenshot"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.imageData}
                    alt="Recommendation screenshot"
                    className="max-h-40 rounded-lg border border-[var(--border)] object-cover sm:w-56"
                  />
                </a>
              )}
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{r.note}</p>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-[var(--subtle)]">
                  {r.author && (
                    <span className="flex items-center gap-1">
                      <User size={11} /> {r.author}
                    </span>
                  )}
                  <span>{timeAgo(r.createdAt)}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-start gap-2">
                <form action={recommendationStatusAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="status" value={r.status === "open" ? "DONE" : "OPEN"} />
                  <button
                    type="submit"
                    title={r.status === "open" ? "Mark done" : "Reopen"}
                    className="flex items-center gap-1.5 rounded-md border border-[var(--border-strong)] px-2.5 py-1 text-[12px] text-[var(--muted)] hover:bg-[var(--surface-2)]"
                  >
                    {r.status === "open" ? <Check size={13} /> : <RotateCcw size={13} />}
                    {r.status === "open" ? "Done" : "Reopen"}
                  </button>
                </form>
                <form action={deleteRecommendationAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button
                    type="submit"
                    title="Delete"
                    className="rounded-md border border-[var(--border-strong)] px-2 py-1 text-[var(--muted)] hover:bg-[var(--surface-2)]"
                  >
                    <Trash2 size={13} />
                  </button>
                </form>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
