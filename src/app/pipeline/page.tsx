import type { ReactNode } from "react";
import Link from "next/link";
import { Shell } from "@/components/shell";
import { PageHeader, Pill } from "@/components/ui";
import { getPipeline, PIPELINE_COLUMNS } from "@/lib/data/repo";
import type { PipelineCard } from "@/lib/data/types";
import { MapPin, Search, Gauge, TrendingUp, PenLine, ArrowUpRight } from "lucide-react";

type FlagMeta = { tone: "success" | "warn" | "accent"; label: string; icon: ReactNode };

const FLAG: Record<NonNullable<PipelineCard["flag"]>, FlagMeta> = {
  boost: { tone: "warn", label: "boost", icon: <TrendingUp size={11} /> },
  rewrite: { tone: "warn", label: "rewrite", icon: <PenLine size={11} /> },
  grading: { tone: "accent", label: "grading", icon: <Gauge size={11} /> },
  researching: { tone: "accent", label: "researching", icon: <Search size={11} /> },
  healthy: { tone: "success", label: "healthy", icon: <TrendingUp size={11} /> },
};

export const dynamic = "force-dynamic";

// Color language: one accent bar per column so the whole flow is scannable by
// color — amber = needs YOU, blue = engine working / queued, green = done.
const TONE_BAR: Record<"neutral" | "warn" | "accent" | "success", string> = {
  neutral: "bg-[var(--border-strong)]",
  warn: "bg-[var(--warn)]",
  accent: "bg-[var(--accent)]",
  success: "bg-[var(--success)]",
};

export default async function PipelinePage() {
  const cards = await getPipeline();

  return (
    <Shell>
      <PageHeader
        title="Content pipeline"
        subtitle="Every piece, left to right, in one screen. You act where it says “needs you.”"
      />

      {/* Color legend — what the colors mean, once. */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--muted)]">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--warn)]" /> needs you
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" /> engine working / queued
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--success)]" /> live
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {PIPELINE_COLUMNS.map((col) => {
          const items = cards.filter((c) => c.stage === col.key);
          const needsYou = col.tone === "warn" && items.length > 0;
          return (
            <div
              key={col.key}
              className={`overflow-hidden rounded-xl bg-[var(--surface-1)] ${
                needsYou ? "ring-1 ring-[var(--warn)]" : ""
              }`}
            >
              {/* Colored top bar = the stage's meaning */}
              <div className={`h-1 w-full ${TONE_BAR[col.tone]}`} />
              <div className="p-2.5">
                {col.href ? (
                  <Link
                    href={col.href}
                    className="group mb-2 flex items-center justify-between rounded-md px-1 py-0.5 hover:bg-[var(--surface-2)]"
                  >
                    <span className="flex items-center gap-1 text-[12px] font-medium text-[var(--text)]">
                      {col.label}
                      <ArrowUpRight
                        size={12}
                        className="text-[var(--subtle)] opacity-0 transition-opacity group-hover:opacity-100"
                      />
                    </span>
                    <Pill tone={col.tone}>{items.length}</Pill>
                  </Link>
                ) : (
                  <div className="mb-2 flex items-center justify-between px-1 py-0.5">
                    <span className="text-[12px] font-medium text-[var(--text)]">{col.label}</span>
                    <Pill tone={col.tone}>{items.length}</Pill>
                  </div>
                )}
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
