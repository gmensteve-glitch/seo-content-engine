import Link from "next/link";
import { Shell } from "@/components/shell";
import { PageHeader } from "@/components/ui";
import { getNeedsPolish } from "@/lib/data/repo";
import { boostAllNearMissesAction } from "@/app/actions";
import { Sparkles, ArrowRight, Tag, CheckCircle2, PartyPopper } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ passed?: string }>;
}) {
  const [{ passed }, drafts] = await Promise.all([searchParams, getNeedsPolish()]);

  return (
    <Shell>
      <div className="mb-4 flex items-start justify-between gap-4">
        <PageHeader
          title="Near-misses"
          subtitle="Pieces below the quality bar. The engine auto-boosts new ones with real data on its own — this is just where you can watch it, or boost the whole backlog at once."
        />
        <div className="flex shrink-0 items-center gap-2">
          {drafts.length > 0 && (
            <>
              <span className="rounded-full bg-[var(--warn-bg)] px-3 py-1 text-[12px] font-medium text-[var(--warn)]">
                {drafts.length} below bar
              </span>
              <form action={boostAllNearMissesAction}>
                <button className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-[13px] font-medium text-white hover:brightness-110">
                  <Sparkles size={14} /> Boost all
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {passed && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--success)] bg-[var(--success-bg)] px-3 py-2.5 text-[13px] text-[var(--success)]">
          <PartyPopper size={16} /> Nice — that one cleared the bar and moved to the calendar&apos;s
          ready queue.
        </div>
      )}

      <div className="space-y-2.5">
        {drafts.map((d) => {
          const gap = d.threshold - d.overall;
          const addCount = d.experienceNotes.length;
          return (
            <Link
              key={d.id}
              href={`/review/${d.id}`}
              className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3.5 hover:bg-[var(--surface-2)]"
            >
              {/* Score */}
              <div className="flex w-14 shrink-0 flex-col items-center">
                <span className="text-[22px] font-semibold leading-none text-[var(--warn)]">
                  {d.overall}
                </span>
                <span className="mt-1 text-[10px] text-[var(--muted)]">{gap} to go</span>
              </div>

              {/* Title + what's needed */}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium">{d.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-[var(--muted)]">
                  <span className="flex items-center gap-1">
                    <Tag size={11} /> {d.targetKeyword}
                  </span>
                  {addCount > 0 && (
                    <span className="flex items-center gap-1 text-[var(--accent)]">
                      <Sparkles size={11} /> {addCount} thing{addCount === 1 ? "" : "s"} to add
                    </span>
                  )}
                </div>
              </div>

              {/* CTA */}
              <span className="flex shrink-0 items-center gap-1 rounded-lg bg-[var(--accent-bg)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--accent)]">
                Polish <ArrowRight size={13} />
              </span>
            </Link>
          );
        })}

        {drafts.length === 0 && (
          <div className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-1)] px-4 py-8 text-center">
            <CheckCircle2 size={20} className="mx-auto mb-2 text-[var(--success)]" />
            <p className="text-[13px] text-[var(--muted)]">
              Nothing to polish. Near-misses land here with a checklist of what to add.
            </p>
          </div>
        )}
      </div>
    </Shell>
  );
}
