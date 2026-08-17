import { Shell } from "@/components/shell";
import { PageHeader, Pill } from "@/components/ui";
import { getIdeas } from "@/lib/data/repo";
import { buildBriefAction, dismissIdeaAction, generateIdeasAction } from "@/app/actions";
import { Sparkles, FileText, X, Tag } from "lucide-react";

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

export default async function IdeasPage() {
  const ideas = await getIdeas();

  return (
    <Shell>
      <div className="mb-5 flex items-start justify-between gap-4">
        <PageHeader
          title="Idea box"
          subtitle="Scored for opportunity, best first. Pick a strong one and Build a brief. Generating adds a fresh batch — it never replaces what's here."
        />
        <form action={generateIdeasAction}>
          <button className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[13px] font-medium text-white hover:brightness-110">
            <Sparkles size={15} /> Generate ideas
          </button>
        </form>
      </div>

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

      <div className="space-y-2.5">
        {ideas.map((i) => {
          const t = tier(i.score);
          return (
            <div
              key={i.id}
              className="flex overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)]"
            >
              {/* Left color bar = opportunity strength (scan by color) */}
              <div className={`w-1.5 shrink-0 ${t.bar}`} />

              <div className="flex flex-1 items-center justify-between gap-4 p-3.5">
                {/* Score + content */}
                <div className="flex min-w-0 items-start gap-3.5">
                  <div className="flex w-12 shrink-0 flex-col items-center">
                    <span className={`text-[24px] font-semibold leading-none ${t.text}`}>
                      {i.score}
                    </span>
                    <span className={`mt-1 text-[10px] font-medium ${t.text}`}>{t.label}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-medium">{i.title}</span>
                      <Pill tone="neutral">
                        <Tag size={10} className="mr-1 inline" />
                        {i.pillar}
                      </Pill>
                    </div>
                    {i.rationale && (
                      <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--muted)]">
                        {i.rationale}
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions — primary + clearly-visible secondary */}
                <div className="flex shrink-0 items-center gap-2">
                  <form action={buildBriefAction}>
                    <input type="hidden" name="ideaId" value={i.id} />
                    <button className="flex items-center gap-1.5 rounded-lg bg-[var(--accent-bg)] px-3 py-2 text-[13px] font-medium text-[var(--accent)] hover:brightness-110">
                      <FileText size={14} /> Build brief
                    </button>
                  </form>
                  <form action={dismissIdeaAction}>
                    <input type="hidden" name="ideaId" value={i.id} />
                    <button
                      title="Dismiss this idea"
                      className="flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 py-2 text-[13px] text-[var(--muted)] hover:bg-[var(--surface-2)]"
                    >
                      <X size={14} /> Dismiss
                    </button>
                  </form>
                </div>
              </div>
            </div>
          );
        })}

        {ideas.length === 0 && (
          <div className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-1)] px-4 py-8 text-center">
            <Sparkles size={20} className="mx-auto mb-2 text-[var(--subtle)]" />
            <p className="text-[13px] text-[var(--muted)]">
              No ideas yet. Hit <span className="font-medium text-[var(--accent)]">Generate ideas</span>{" "}
              to fill the box.
            </p>
          </div>
        )}
      </div>
    </Shell>
  );
}
