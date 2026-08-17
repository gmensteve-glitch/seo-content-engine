import Link from "next/link";
import { Shell } from "@/components/shell";
import { PageHeader } from "@/components/ui";
import { getReadyForReview } from "@/lib/data/repo";
import { ArrowRight, Tag, CheckCircle2, CalendarPlus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ReadyPage() {
  const drafts = await getReadyForReview();

  return (
    <Shell>
      <div className="mb-4 flex items-start justify-between gap-4">
        <PageHeader
          title="Ready to publish"
          subtitle="Finished pieces that cleared the quality bar. Open one to see its full scorecard and read the post, then move it to the calendar."
        />
        {drafts.length > 0 && (
          <span className="shrink-0 rounded-full bg-[var(--success-bg)] px-3 py-1 text-[12px] font-medium text-[var(--success)]">
            {drafts.length} ready
          </span>
        )}
      </div>

      <div className="space-y-2.5">
        {drafts.map((d) => (
          <Link
            key={d.id}
            href={`/review/${d.id}`}
            className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3.5 hover:bg-[var(--surface-2)]"
          >
            <div className="flex w-12 shrink-0 flex-col items-center">
              <span className="text-[22px] font-semibold leading-none text-[var(--success)]">
                {d.overall}
              </span>
              <span className="mt-1 text-[10px] text-[var(--muted)]">/ {d.threshold}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-medium">{d.title}</div>
              <div className="mt-1 flex items-center gap-1 text-[11.5px] text-[var(--muted)]">
                <Tag size={11} /> {d.targetKeyword}
              </div>
            </div>
            <span className="flex shrink-0 items-center gap-1 rounded-lg bg-[var(--accent-bg)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--accent)]">
              Review &amp; schedule <ArrowRight size={13} />
            </span>
          </Link>
        ))}

        {drafts.length === 0 && (
          <div className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-1)] px-4 py-8 text-center">
            <CheckCircle2 size={20} className="mx-auto mb-2 text-[var(--muted)]" />
            <p className="text-[13px] text-[var(--muted)]">
              Nothing ready yet. Approve a brief — pieces that pass land here for a final look
              before the <CalendarPlus size={12} className="inline" /> calendar.
            </p>
          </div>
        )}
      </div>
    </Shell>
  );
}
