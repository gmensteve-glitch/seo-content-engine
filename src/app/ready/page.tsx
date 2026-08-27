import Link from "next/link";
import { Shell } from "@/components/shell";
import { PageHeader } from "@/components/ui";
import { getReadyForReview, getBusiness } from "@/lib/data/repo";
import type { PolishDraftVM } from "@/lib/data/types";
import { scrubReadyFabricationAction } from "@/app/actions";
import { ArrowRight, Tag, CheckCircle2, MapPin, BookOpen, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

const TOTAL_TARGET = 10;

function Row({ d }: { d: PolishDraftVM }) {
  return (
    <Link
      href={`/review/${d.id}`}
      className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 hover:bg-[var(--surface-2)]"
    >
      <div className="flex w-11 shrink-0 flex-col items-center">
        <span className="text-[20px] font-semibold leading-none text-[var(--success)]">{d.overall}</span>
        <span className="mt-0.5 text-[10px] text-[var(--muted)]">/ {d.threshold}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium">{d.title}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--muted)]">
          <span className="flex items-center gap-1 truncate">
            <Tag size={10} /> {d.targetKeyword}
          </span>
          {d.costCents > 0 && (
            <span className="shrink-0 text-[var(--subtle)]">${(d.costCents / 100).toFixed(2)}</span>
          )}
        </div>
      </div>
      <ArrowRight size={14} className="shrink-0 text-[var(--accent)]" />
    </Link>
  );
}

function Column({
  title,
  icon,
  count,
  target,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  target: number;
  items: PolishDraftVM[];
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <h2 className="text-[14px] font-medium">{title}</h2>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${
            count >= target
              ? "bg-[var(--success-bg)] text-[var(--success)]"
              : "bg-[var(--surface-2)] text-[var(--muted)]"
          }`}
        >
          {count} / {target}
        </span>
      </div>
      <div className="space-y-2">
        {items.map((d) => (
          <Row key={d.id} d={d} />
        ))}
        {items.length === 0 && (
          <div className="rounded-xl border border-dashed border-[var(--border-strong)] px-3 py-6 text-center text-[12px] text-[var(--muted)]">
            Filling up — new pieces land here automatically.
          </div>
        )}
      </div>
    </div>
  );
}

export default async function ReadyPage() {
  const [drafts, business] = await Promise.all([getReadyForReview(), getBusiness()]);
  const localTarget = Math.round((TOTAL_TARGET * business.localRatio) / 100);
  const local = drafts.filter((d) => d.kind === "LOCAL");
  const evergreen = drafts.filter((d) => d.kind === "EVERGREEN");

  return (
    <Shell>
      <div className="mb-4 flex items-start justify-between gap-4">
        <PageHeader
          title="Ready to publish"
          subtitle="Your morning stack — finished, quality-checked pieces. Open one to read it and push it to Shopify."
        />
        <div className="flex shrink-0 items-center gap-2">
          <form action={scrubReadyFabricationAction}>
            <button
              type="submit"
              title="Rewrite every Ready post to remove fabricated delivery timelines / shipping steps, and remember the rule for future posts"
              className="flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-3 py-1 text-[12px] text-[var(--muted)] hover:bg-[var(--surface-2)]"
            >
              <ShieldCheck size={13} /> Scrub fabricated claims
            </button>
          </form>
          <span
            className={`rounded-full px-3 py-1 text-[12px] font-medium ${
              drafts.length >= TOTAL_TARGET
                ? "bg-[var(--success-bg)] text-[var(--success)]"
                : "bg-[var(--surface-2)] text-[var(--muted)]"
            }`}
          >
            {drafts.length} / {TOTAL_TARGET} ready
          </span>
        </div>
      </div>

      {drafts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-1)] px-4 py-10 text-center">
          <CheckCircle2 size={22} className="mx-auto mb-2 text-[var(--muted)]" />
          <p className="text-[13px] text-[var(--muted)]">
            Nothing ready yet — the engine is building your stack. Check back shortly.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <Column
            title="Local"
            icon={<MapPin size={15} className="text-[var(--accent)]" />}
            count={local.length}
            target={localTarget}
            items={local}
          />
          <Column
            title="Evergreen"
            icon={<BookOpen size={15} className="text-[var(--accent)]" />}
            count={evergreen.length}
            target={TOTAL_TARGET - localTarget}
            items={evergreen}
          />
        </div>
      )}
    </Shell>
  );
}
