import { Shell } from "@/components/shell";
import { PageHeader, Card, Pill } from "@/components/ui";
import { getIdeas } from "@/lib/data/repo";
import { buildBriefAction, dismissIdeaAction, generateIdeasAction } from "@/app/actions";
import { Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function IdeasPage() {
  const ideas = await getIdeas();

  return (
    <Shell>
      <div className="mb-5 flex items-start justify-between gap-4">
        <PageHeader
          title="Idea box"
          subtitle="Auto-scored for opportunity, grounded in your pillars and existing coverage. Highest-opportunity first. New ideas replenish automatically as the pool runs low."
        />
        <form action={generateIdeasAction}>
          <button className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--accent-bg)] px-3 py-2 text-[13px] font-medium text-[var(--accent)] hover:opacity-90">
            <Sparkles size={15} /> Generate ideas
          </button>
        </form>
      </div>
      <div className="space-y-2.5">
        {ideas.map((i) => (
          <Card key={i.id} className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-medium">{i.title}</span>
                <Pill tone="neutral">{i.pillar}</Pill>
              </div>
              {i.rationale && (
                <p className="mt-1 text-[12.5px] text-[var(--muted)]">{i.rationale}</p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <Pill tone={i.score >= 90 ? "success" : "warn"}>{i.score}</Pill>
              <form action={buildBriefAction}>
                <input type="hidden" name="ideaId" value={i.id} />
                <button className="rounded-md border border-[var(--border-strong)] px-2.5 py-1 text-[12px] hover:bg-[var(--surface-2)]">
                  Build brief
                </button>
              </form>
              <form action={dismissIdeaAction}>
                <input type="hidden" name="ideaId" value={i.id} />
                <button className="rounded-md px-2.5 py-1 text-[11px] text-[var(--subtle)] hover:text-[var(--muted)]">
                  Dismiss
                </button>
              </form>
            </div>
          </Card>
        ))}
        {ideas.length === 0 && (
          <Card>
            <p className="text-[13px] text-[var(--muted)]">No ideas yet — connect data to generate them.</p>
          </Card>
        )}
      </div>
    </Shell>
  );
}
