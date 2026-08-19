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
  getPipelineHealth,
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
  Activity,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [biz, kpis, briefs, needsPolish, ready, pipeline, connectors, health] = await Promise.all([
    getBusiness(),
    getKpis(),
    getPendingBriefs(),
    getNeedsPolish(),
    getReadyToSchedule(),
    getPipeline(),
    getConnectors(),
    getPipelineHealth(),
  ]);

  const inProgress = pipeline.filter((c) => c.stage === "in_progress").length;
  const gscConnected = connectors.find((c) => c.type === "GSC")?.status === "connected";

  const engineHealthy = health.engineHealthy;
  const lastActivityLabel = health.lastActivityLabel;

  const funnel = [
    { label: "Ideas", value: health.ideas, href: "/ideas" },
    { label: "Briefs", value: health.briefs, href: "/briefs" },
    { label: "Writing", value: health.writing, href: "/pipeline" },
    { label: "Ready", value: health.ready, href: "/ready" },
    { label: "Live", value: health.published, href: "/performance" },
  ];

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

      {/* 1) DO THIS NEXT — one clear focal action (no triage, no paralysis). */}
      {todos.length === 0 ? (
        <Card className="mb-4 border-[var(--success)]">
          <div className="flex items-center gap-3 py-2">
            <CheckCircle2 size={22} className="text-[var(--success)]" />
            <div>
              <div className="text-[15px] font-medium">You&apos;re all caught up</div>
              <div className="text-[12px] text-[var(--muted)]">
                The engine keeps drafting in the background. Nothing needs you right now.
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <Link
            href={todos[0].href}
            className="mb-3 block rounded-xl border border-[var(--accent)] bg-[var(--accent-bg)] p-5 transition-colors hover:brightness-110"
          >
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
              Do this next
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-[var(--accent)]">{todos[0].icon}</span>
                <div>
                  <div className="text-[18px] font-semibold leading-tight">
                    {todos[0].label}
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-[var(--muted)]">
                    {todos[0].hint}
                  </div>
                </div>
              </div>
              <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[13px] font-medium text-white">
                Open <ArrowRight size={15} />
              </span>
            </div>
          </Link>

          {/* Then — the rest, small and quiet so they don't compete. */}
          {todos.length > 1 && (
            <div className="mb-4">
              <div className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wider text-[var(--subtle)]">
                Then
              </div>
              <div className="space-y-1.5">
                {todos.slice(1).map((t) => (
                  <Link
                    key={t.href}
                    href={t.href}
                    className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2.5 hover:bg-[var(--surface-2)]"
                  >
                    <span className="flex items-center gap-2.5 text-[13px]">
                      <span
                        className={
                          t.tone === "warn" ? "text-[var(--warn)]" : "text-[var(--accent)]"
                        }
                      >
                        {t.icon}
                      </span>
                      {t.label}
                    </span>
                    <ArrowRight size={14} className="text-[var(--subtle)]" />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}

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

      {/* 2b) Pipeline health — watch the background engine move */}
      <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-[var(--muted)]">
        <Activity size={13} /> Pipeline health
      </div>
      <Card className="mb-5">
        <div className="mb-3 flex items-center gap-2">
          <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
              engineHealthy
                ? "bg-[var(--success-bg)] text-[var(--success)]"
                : "bg-[var(--warn-bg)] text-[var(--warn)]"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${engineHealthy ? "bg-[var(--success)]" : "bg-[var(--warn)]"}`} />
            {engineHealthy ? "Engine running" : "Engine idle"}
          </span>
          <span className="text-[11px] text-[var(--muted)]">last activity {lastActivityLabel}</span>
          {health.stuck > 0 && (
            <span className="ml-auto flex items-center gap-1 text-[11px] text-[var(--warn)]">
              <AlertTriangle size={12} /> {health.stuck} stuck
            </span>
          )}
        </div>

        {/* The funnel — counts at each stage, left to right */}
        <div className="flex items-stretch gap-1.5 overflow-x-auto">
          {funnel.map((s, i) => (
            <div key={s.label} className="flex items-center gap-1.5">
              <Link
                href={s.href}
                className="flex min-w-[76px] flex-col items-center rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2.5 hover:bg-[var(--surface-2)]"
              >
                <span className="text-[22px] font-semibold leading-none">{s.value}</span>
                <span className="mt-1 text-[11px] text-[var(--muted)]">{s.label}</span>
              </Link>
              {i < funnel.length - 1 && <ChevronRight size={14} className="shrink-0 text-[var(--subtle)]" />}
            </div>
          ))}
        </div>

        {health.failed > 0 && (
          <Link
            href="/review"
            className="mt-3 flex items-center gap-1.5 text-[11px] text-[var(--warn)] hover:underline"
          >
            <AlertTriangle size={12} /> {health.failed} piece{health.failed === 1 ? "" : "s"} couldn&apos;t reach the quality bar — review or boost
          </Link>
        )}
      </Card>

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
