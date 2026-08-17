import type { ReactNode } from "react";
import Link from "next/link";
import { Shell } from "@/components/shell";
import { PageHeader, Card, StatTile } from "@/components/ui";
import {
  getBusiness,
  getKpis,
  getPendingBriefs,
  getNeedsPolish,
  getReadyToSchedule,
  getPipeline,
  getConnectors,
} from "@/lib/data/repo";
import {
  ClipboardCheck,
  Sparkles,
  CalendarPlus,
  ArrowRight,
  CheckCircle2,
  FileText,
  Gauge,
  Loader2,
  Search,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [biz, kpis, briefs, needsPolish, ready, pipeline, connectors] = await Promise.all([
    getBusiness(),
    getKpis(),
    getPendingBriefs(),
    getNeedsPolish(),
    getReadyToSchedule(),
    getPipeline(),
    getConnectors(),
  ]);

  const inProgress = pipeline.filter((c) => c.stage === "in_progress").length;
  const gscConnected = connectors.find((c) => c.type === "GSC")?.status === "connected";

  // The real daily to-dos, in priority order.
  const todos = [
    {
      show: briefs.length > 0,
      icon: <ClipboardCheck size={16} />,
      label: `${briefs.length} brief${briefs.length === 1 ? "" : "s"} to approve`,
      hint: "Your one gate — approve to start the engine",
      href: "/briefs",
      tone: "warn" as const,
    },
    {
      show: needsPolish.length > 0,
      icon: <Sparkles size={16} />,
      label: `${needsPolish.length} draft${needsPolish.length === 1 ? "" : "s"} need your experience`,
      hint: "Add a real detail, then re-grade to pass",
      href: "/review",
      tone: "accent" as const,
    },
    {
      show: ready.length > 0,
      icon: <CalendarPlus size={16} />,
      label: `${ready.length} piece${ready.length === 1 ? "" : "s"} ready to schedule`,
      hint: "Drop them on the calendar to auto-publish",
      href: "/calendar",
      tone: "accent" as const,
    },
  ].filter((t) => t.show);

  return (
    <Shell>
      <PageHeader title="Overview" subtitle={biz.name} />

      {/* 1) What needs you — the daily action list, first and biggest */}
      <Card className="mb-4">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-[15px] font-medium">Needs you today</h2>
          {todos.length === 0 && (
            <span className="ml-auto flex items-center gap-1 text-[12px] text-[var(--success)]">
              <CheckCircle2 size={14} /> All caught up
            </span>
          )}
        </div>
        {todos.length === 0 ? (
          <p className="text-[13px] text-[var(--muted)]">
            Nothing waiting on you. The engine keeps generating ideas and drafting
            in the background — check back, or approve a brief to queue more.
          </p>
        ) : (
          <div className="space-y-2.5">
            {todos.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-3 hover:bg-[var(--surface-2)]"
              >
                <span className="flex items-center gap-3">
                  <span
                    className={
                      t.tone === "warn" ? "text-[var(--warn)]" : "text-[var(--accent)]"
                    }
                  >
                    {t.icon}
                  </span>
                  <span>
                    <span className="block text-[13.5px] font-medium">{t.label}</span>
                    <span className="block text-[12px] text-[var(--muted)]">{t.hint}</span>
                  </span>
                </span>
                <ArrowRight size={15} className="text-[var(--subtle)]" />
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* 2) Your content — the REAL numbers */}
      <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-[var(--muted)]">
        <FileText size={13} /> Your content
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Live pages" value={kpis.livePages} />
        <Tile
          label="Avg quality"
          value={kpis.avgQuality ? `${kpis.avgQuality}` : "—"}
          icon={<Gauge size={13} />}
          accent="success"
        />
        <Tile
          label="In progress"
          value={inProgress}
          icon={inProgress > 0 ? <Loader2 size={13} /> : undefined}
        />
        <StatTile label="Ready to publish" value={ready.length} />
      </div>

      {/* 3) Search performance — honest: real only once GSC is connected */}
      <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-[var(--muted)]">
        <Search size={13} /> Search performance
      </div>
      {gscConnected ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Indexed" value={kpis.indexed} />
          <StatTile label="Impressions 28d" value={kpis.impressions28d.toLocaleString()} />
          <StatTile label="Clicks 28d" value={kpis.clicks28d.toLocaleString()} />
          <StatTile label="Avg quality" value={kpis.avgQuality || "—"} />
        </div>
      ) : (
        <Link
          href="/connectors"
          className="flex items-center justify-between rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-1)] px-4 py-4 hover:bg-[var(--surface-2)]"
        >
          <span className="flex items-center gap-3">
            <Search size={18} className="text-[var(--subtle)]" />
            <span>
              <span className="block text-[13px] font-medium">
                Connect Google Search Console
              </span>
              <span className="block text-[12px] text-[var(--muted)]">
                Then impressions, clicks, and rankings show up here — and the engine
                learns from what actually performs.
              </span>
            </span>
          </span>
          <ArrowRight size={15} className="text-[var(--subtle)]" />
        </Link>
      )}
    </Shell>
  );
}

/** StatTile variant that can show a small inline icon next to the label. */
function Tile({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon?: ReactNode;
  accent?: "success" | "warn" | "danger";
}) {
  const color =
    accent === "success"
      ? "text-[var(--success)]"
      : accent === "warn"
        ? "text-[var(--warn)]"
        : "text-[var(--text)]";
  return (
    <div className="rounded-lg bg-[var(--surface-2)] px-3.5 py-3">
      <div className="flex items-center gap-1 text-[12px] text-[var(--muted)]">
        {icon} {label}
      </div>
      <div className={`mt-0.5 text-[24px] font-medium ${color}`}>{value}</div>
    </div>
  );
}
