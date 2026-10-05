import type { ReactNode } from "react";
import Link from "next/link";
import { Shell } from "@/components/shell";
import { PageHeader, Pill } from "@/components/ui";
import { getPipeline, getShortfall, PIPELINE_COLUMNS } from "@/lib/data/repo";
import type { PipelineCard, ShortfallVM } from "@/lib/data/types";
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
  const [cards, shortfall] = await Promise.all([getPipeline(), getShortfall()]);

  return (
    <Shell>
      <PageHeader
        title="Content pipeline"
        subtitle="Every piece, left to right, in one screen. The engine moves them automatically — idea to Ready — with no manual gates."
      />

      {/* Color legend — what the colors mean, once. */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--muted)]">
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

      {shortfall && shortfall.nearMisses > 0 && <ShortfallPanel s={shortfall} />}
    </Shell>
  );
}

/** Where the near-misses lose points — real numbers from their best grades. */
function ShortfallPanel({ s }: { s: ShortfallVM }) {
  return (
    <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <h2 className="text-[14px] font-semibold">Why pieces fall short</h2>
      <p className="mt-1 text-[12px] text-[var(--muted)]">
        {s.nearMisses} near-miss{s.nearMisses === 1 ? "" : "es"} below the {s.threshold} bar
        {s.avgBest !== null ? `, average best score ${s.avgBest}` : ""}.
        {s.noGrade > 0 ? ` ${s.noGrade} never got a grade (stopped before grading).` : ""}
        {` ${s.queued} in the writing queue`}
        {s.stuckOutOfAttempts > 0 ? `, ${s.stuckOutOfAttempts} out of retries` : ""}.
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
        {s.bands.map((b) => (
          <span key={b.label} className="rounded-md border border-[var(--border)] px-2 py-1 text-[var(--muted)]">
            {b.label}: <span className="font-medium text-[var(--text)]">{b.count}</span>
          </span>
        ))}
      </div>
      <table className="mt-3 w-full text-left text-[12px]">
        <thead className="text-[var(--subtle)]">
          <tr>
            <th className="py-1 pr-3 font-medium">Dimension</th>
            <th className="py-1 pr-3 font-medium">Avg</th>
            <th className="py-1 pr-3 font-medium">Points lost</th>
            <th className="py-1 font-medium">What the grader says (worst case)</th>
          </tr>
        </thead>
        <tbody>
          {s.dimensions.map((d) => (
            <tr key={d.key} className="border-t border-[var(--border)] align-top">
              <td className="py-1.5 pr-3">{d.label}</td>
              <td className="py-1.5 pr-3 tabular-nums">
                {d.avg}/{d.max}
              </td>
              <td className="py-1.5 pr-3 tabular-nums">{d.lost}</td>
              <td className="py-1.5 text-[var(--muted)]">{d.sampleNote.slice(0, 220)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function CardItem({ card }: { card: PipelineCard }) {
  const flag = card.flag ? FLAG[card.flag] : null;
  const body = <CardBody card={card} flag={flag} />;
  return card.href ? (
    <Link
      href={card.href}
      className="block rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5 transition-colors hover:border-[var(--accent)]"
    >
      {body}
    </Link>
  ) : (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5">{body}</div>
  );
}

function CardBody({ card, flag }: { card: PipelineCard; flag: FlagMeta | null }) {
  return (
    <>
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
    </>
  );
}
