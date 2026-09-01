import Link from "next/link";
import { Shell } from "@/components/shell";
import { PageHeader, Pill } from "@/components/ui";
import { getIdeas, getBusiness } from "@/lib/data/repo";
import type { IdeaVM } from "@/lib/data/types";
import { buildBriefAction, dismissIdeaAction, generateIdeasAction } from "@/app/actions";
import { Sparkles, FileText, X, Tag, MapPin, BookOpen, SlidersHorizontal } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";

export const dynamic = "force-dynamic";

/** Score tier → color + label. Green = strong, blue = good, gray = fair.
 *  (Amber stays reserved for "needs you" elsewhere, so it's not used here.) */
function tier(score: number): {
  label: string;
  pill: "success" | "accent" | "neutral";
  bar: string;
  text: string;
} {
  if (score >= 90)
    return { label: "Strong", pill: "success", bar: "bg-[var(--success)]", text: "text-[var(--success)]" };
  if (score >= 78)
    return { label: "Good", pill: "accent", bar: "bg-[var(--accent)]", text: "text-[var(--accent)]" };
  return { label: "Fair", pill: "neutral", bar: "bg-[var(--border-strong)]", text: "text-[var(--muted)]" };
}

function IdeaCard({ i }: { i: IdeaVM }) {
  const t = tier(i.score);
  return (
    <div className="flex overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)]">
      {/* Left color bar = opportunity strength (scan by color) */}
      <div className={`w-1.5 shrink-0 ${t.bar}`} />
      <div className="flex flex-1 flex-wrap items-center justify-between gap-3 p-3.5">
        <div className="flex min-w-0 items-start gap-3.5">
          <div className="flex w-10 shrink-0 flex-col items-center">
            <span className={`text-[22px] font-semibold leading-none ${t.text}`}>{i.score}</span>
            <span className={`mt-1 text-[10px] font-medium ${t.text}`}>{t.label}</span>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13.5px] font-medium">{i.title}</span>
              <Pill tone="neutral">
                <Tag size={10} className="mr-1 inline" />
                {i.pillar}
              </Pill>
            </div>
            {i.rationale && (
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted)]">{i.rationale}</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <form action={buildBriefAction}>
            <input type="hidden" name="ideaId" value={i.id} />
            <SubmitButton
              icon={<FileText size={14} />}
              pendingLabel="Writing…"
              title="Build a brief and write the blog — it runs automatically and lands in Ready to publish"
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent-bg)] px-3 py-2 text-[13px] font-medium text-[var(--accent)] hover:brightness-110"
            >
              Build blog
            </SubmitButton>
          </form>
          <form action={dismissIdeaAction}>
            <input type="hidden" name="ideaId" value={i.id} />
            <button
              title="Dismiss this idea"
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-2.5 py-2 text-[13px] text-[var(--muted)] hover:bg-[var(--surface-2)]"
            >
              <X size={14} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function IdeaColumn({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: IdeaVM[];
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <h2 className="text-[14px] font-medium">{title}</h2>
        <span className="ml-auto rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
          {items.length}
        </span>
      </div>
      <div className="space-y-2.5">
        {items.map((i) => (
          <IdeaCard key={i.id} i={i} />
        ))}
        {items.length === 0 && (
          <div className="rounded-xl border border-dashed border-[var(--border-strong)] px-3 py-6 text-center text-[12px] text-[var(--muted)]">
            No {title.toLowerCase()} ideas yet — hit Generate ideas.
          </div>
        )}
      </div>
    </div>
  );
}

export default async function IdeasPage() {
  const [ideas, business] = await Promise.all([getIdeas(), getBusiness()]);
  const localRatio = business.localRatio;

  return (
    <Shell>
      <div className="mb-5 flex items-start justify-between gap-4">
        <PageHeader
          title="Idea box"
          subtitle="Scored for opportunity, best first. Click Build blog on any idea and the engine writes it and drops it in Ready. Generating adds a fresh batch — it never replaces what's here."
        />
        <form action={generateIdeasAction}>
          <button className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[13px] font-medium text-white hover:brightness-110">
            <Sparkles size={15} /> Generate ideas
          </button>
        </form>
      </div>

      {/* Content mix — read-only summary; adjust it (and the quality bar) on Strategy */}
      <Link
        href="/strategy"
        className="mb-4 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-2.5 text-[12px] hover:bg-[var(--surface-2)]"
      >
        <SlidersHorizontal size={13} className="text-[var(--accent)]" />
        <span className="text-[var(--muted)]">
          Target mix: <b className="text-[var(--text)]">{localRatio}% local · {100 - localRatio}% evergreen</b>
        </span>
        <span className="ml-auto text-[11px] text-[var(--accent)]">Adjust in Strategy →</span>
      </Link>

      {/* Color legend */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--muted)]">
        <span className="text-[var(--subtle)]">Opportunity:</span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--success)]" /> Strong 90+
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" /> Good 78–89
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--border-strong)]" /> Fair &lt;78
        </span>
        <span className="ml-auto text-[var(--subtle)]">{ideas.length} ideas</span>
      </div>

      {ideas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-1)] px-4 py-8 text-center">
          <Sparkles size={20} className="mx-auto mb-2 text-[var(--subtle)]" />
          <p className="text-[13px] text-[var(--muted)]">
            No ideas yet. Hit <span className="font-medium text-[var(--accent)]">Generate ideas</span>{" "}
            to fill the box.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <IdeaColumn
            title="Local"
            icon={<MapPin size={15} className="text-[var(--accent)]" />}
            items={ideas.filter((i) => i.kind === "LOCAL")}
          />
          <IdeaColumn
            title="Evergreen"
            icon={<BookOpen size={15} className="text-[var(--accent)]" />}
            items={ideas.filter((i) => i.kind === "EVERGREEN")}
          />
        </div>
      )}
    </Shell>
  );
}
