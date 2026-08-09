import type { ReactNode } from "react";
import { Shell } from "@/components/shell";
import { PageHeader, Pill } from "@/components/ui";
import { getPipeline, PIPELINE_COLUMNS } from "@/lib/data/repo";
import type { PipelineCard } from "@/lib/data/types";
import { MapPin, Search, Gauge, TrendingUp, PenLine } from "lucide-react";

type FlagMeta = { tone: "success" | "warn" | "accent"; label: string; icon: ReactNode };

const FLAG: Record<NonNullable<PipelineCard["flag"]>, FlagMeta> = {
  boost: { tone: "warn", label: "boost", icon: <TrendingUp size={11} /> },
  rewrite: { tone: "warn", label: "rewrite", icon: <PenLine size={11} /> },
  grading: { tone: "accent", label: "grading", icon: <Gauge size={11} /> },
  researching: { tone: "accent", label: "researching", icon: <Search size={11} /> },
  healthy: { tone: "success", label: "healthy", icon: <TrendingUp size={11} /> },
};

export default async function PipelinePage() {
  const cards = await getPipeline();

  return (
    <Shell>
      <PageHeader
        title="Content pipeline"
        subtitle="Every piece flows left to right. You only act at “Briefs · needs you.”"
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {PIPELINE_COLUMNS.map((col) => {
          const items = cards.filter((c) => c.stage === col.key);
          const needsYou = col.key === "briefs";
          return (
            <div key={col.key} className="rounded-xl bg-[var(--surface-1)] p-2.5">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-[12px] font-medium text-[var(--muted)]">{col.label}</span>
                <Pill tone={needsYou ? "warn" : col.key === "live" ? "success" : "neutral"}>
                  {items.length}
                </Pill>
              </div>
              <div className="space-y-2">
                {items.map((c) => (
                  <CardItem key={c.id} card={c} />
                ))}
                {items.length === 0 && (
                  <div className="rounded-lg border border-dashed border-[var(--border)] px-2 py-4 text-center text-[11px] text-[var(--subtle)]">
                    empty
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

function CardItem({ card }: { card: PipelineCard }) {
  const flag = card.flag ? FLAG[card.flag] : null;
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
      <div className="text-[12.5px] leading-snug">{card.title}</div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-[var(--subtle)]">
        {card.contentType === "geo" && <MapPin size={11} />}
        {typeof card.score === "number" && (
          <Pill tone={card.score >= 90 ? "success" : "warn"}>{card.score}</Pill>
        )}
        {flag && (
          <Pill tone={flag.tone}>
            <span className="mr-0.5 inline-flex align-middle">{flag.icon}</span>
            {flag.label}
          </Pill>
        )}
        {card.meta && <span>{card.meta}</span>}
      </div>
    </div>
  );
}
