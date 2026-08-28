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
  getGoalDiagnostics,
  getCostSummary,
  getSeoOpportunities,
  getKeywordMovers,
  getGeoVisibility,
} from "@/lib/data/repo";
import { setQualityThresholdAction, boostAllNearMissesAction } from "@/app/actions";
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
  Target,
  Wand2,
  MapPin,
  BookOpen,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Bot,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [biz, kpis, briefs, needsPolish, ready, pipeline, connectors, health, goal, cost, seo, movers, geo] =
    await Promise.all([
      getBusiness(),
      getKpis(),
      getPendingBriefs(),
      getNeedsPolish(),
      getReadyToSchedule(),
      getPipeline(),
      getConnectors(),
      getPipelineHealth(),
      getGoalDiagnostics(),
      getCostSummary(),
      getSeoOpportunities(),
      getKeywordMovers(),
      getGeoVisibility(),
    ]);

  const readyTotal = goal.readyLocal + goal.readyEver;
  const atGoal = goal.limiting === "none";
  const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const shortfall = Math.max(0, goal.total - readyTotal);
  const projectedFillCents = cost.avgCents !== null ? shortfall * cost.avgCents : null;

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

      {/* ── THE BRAIN: goal status + one-click optimize ────────────────── */}
      <div className="mb-5 rounded-2xl border border-[var(--accent)] bg-[var(--surface-1)] p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
              <Target size={13} /> Goal — 10 ready every morning
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span
                className={`text-[44px] font-bold leading-none ${atGoal ? "text-[var(--success)]" : "text-[var(--text)]"}`}
              >
                {Math.min(readyTotal, goal.total)}
              </span>
              <span className="text-[18px] text-[var(--muted)]">/ {goal.total} ready</span>
              {atGoal && (
                <span className="ml-1 rounded-full bg-[var(--success-bg)] px-2.5 py-1 text-[12px] font-medium text-[var(--success)]">
                  🎯 Goal met
                </span>
              )}
            </div>
          </div>
          <Link
            href="/ready"
            className="flex items-center gap-1.5 rounded-lg bg-[var(--success)] px-4 py-2 text-[13px] font-medium text-white hover:brightness-110"
          >
            Go to Ready <ArrowRight size={14} />
          </Link>
        </div>

        {/* Per-category progress */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <GoalBar label="Local" icon={<MapPin size={13} />} ready={goal.readyLocal} target={goal.localTarget} />
          <GoalBar label="Evergreen" icon={<BookOpen size={13} />} ready={goal.readyEver} target={goal.everTarget} />
        </div>

        {/* The recommendation — the math, in plain language */}
        {goal.limiting === "bar" && goal.recommendedBar !== null && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--warn)] bg-[var(--warn-bg)] px-4 py-3">
            <Wand2 size={17} className="shrink-0 text-[var(--warn)]" />
            <div className="min-w-0 flex-1 text-[13px] text-[var(--text)]">
              <span className="font-medium">You&apos;re {goal.total - readyTotal} short.</span>{" "}
              {goal.projectedLocal + goal.projectedEver - readyTotal} more pieces are sitting just
              below your bar of {goal.currentBar}. Drop it to{" "}
              <b className="text-[var(--success)]">{goal.recommendedBar}</b> and you hit{" "}
              {goal.projectedLocal} local + {goal.projectedEver} evergreen = your 10.
            </div>
            <form action={setQualityThresholdAction}>
              <input type="hidden" name="threshold" value={goal.recommendedBar} />
              <button className="flex items-center gap-1.5 rounded-lg bg-[var(--warn)] px-3.5 py-2 text-[13px] font-medium text-white hover:brightness-110">
                <Wand2 size={14} /> Optimize → bar {goal.recommendedBar}
              </button>
            </form>
          </div>
        )}
        {goal.limiting === "supply" && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--accent)] bg-[var(--accent-bg)] px-4 py-3">
            <Sparkles size={17} className="shrink-0 text-[var(--accent)]" />
            <div className="min-w-0 flex-1 text-[13px] text-[var(--text)]">
              <span className="font-medium">You&apos;re {goal.total - readyTotal} short</span> — and
              lowering the bar alone won&apos;t get there ({goal.poolLocal} local + {goal.poolEver}{" "}
              evergreen pieces exist). The engine needs to produce more: keep it running, and
              boosting the backlog squeezes out every piece it can.
            </div>
            <form action={boostAllNearMissesAction}>
              <button className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[13px] font-medium text-white hover:brightness-110">
                <Sparkles size={14} /> Boost the backlog
              </button>
            </form>
          </div>
        )}
        {atGoal && (
          <div className="mt-4 rounded-xl border border-[var(--success)] bg-[var(--success-bg)] px-4 py-3 text-[13px] text-[var(--success)]">
            <span className="font-medium">All set.</span> {goal.readyLocal} local + {goal.readyEver}{" "}
            evergreen are stacked and clean — go publish the good ones.
          </div>
        )}

        {/* Spend — cost of the goal, in real dollars */}
        {cost.avgCents !== null && (
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-[var(--border)] pt-3 text-[12px]">
            <span className="flex items-center gap-1.5 text-[var(--muted)]">
              <DollarSign size={13} /> Today&apos;s pieces:{" "}
              <b className="text-[var(--text)]">{usd(cost.todayCents)}</b>
              <span className="text-[var(--subtle)]">({cost.todayCount})</span>
            </span>
            <span className="text-[var(--muted)]">
              Avg / blog: <b className="text-[var(--text)]">{usd(cost.avgCents)}</b>
            </span>
            {projectedFillCents !== null && shortfall > 0 && (
              <span className="text-[var(--muted)]">
                To fill {shortfall} more: <b className="text-[var(--text)]">~{usd(projectedFillCents)}</b>
              </span>
            )}
            <Link href="/performance" className="ml-auto text-[var(--accent)] hover:underline">
              cost by score →
            </Link>
          </div>
        )}
      </div>

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

      {/* 2c) SEO opportunities — live from Search Console; the engine targets these */}
      {seo.connected && (
        <>
          <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-[var(--muted)]">
            <TrendingUp size={13} /> SEO opportunities
            <span className="ml-1 flex items-center gap-1 rounded-full bg-[var(--success-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--success)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" /> live from Search Console
            </span>
            <span className="ml-auto text-[11px] text-[var(--subtle)]">
              {seo.totalClicks28d.toLocaleString()} clicks · {seo.totalImpressions28d.toLocaleString()} impressions / 28d
            </span>
          </div>
          <Card className="mb-5">
            {seo.striking.length > 0 ? (
              <>
                <div className="mb-3 text-[12.5px] text-[var(--muted)]">
                  You rank on <b className="text-[var(--text)]">page 2</b> for these — one strong
                  piece each pushes them to page 1. The engine now targets them automatically.
                </div>
                <div className="space-y-1.5">
                  {seo.striking.map((k) => {
                    // Bar shows opportunity size (impressions), capped for layout.
                    const pct = Math.min(100, (k.impressions / (seo.striking[0]?.impressions || 1)) * 100);
                    return (
                      <div key={k.query} className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-[13px] font-medium">{k.query}</span>
                            <span className="shrink-0 text-[11px] text-[var(--muted)]">
                              pos {k.position.toFixed(0)} · {k.impressions.toLocaleString()} impr/mo
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                            <div
                              className="h-full rounded-full bg-[var(--accent)]"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="text-[12.5px] text-[var(--muted)]">
                No page-2 keywords right now — nothing sitting in striking distance. The engine will
                keep building broad coverage.
              </div>
            )}

            {seo.decaying.length > 0 && (
              <div className="mt-4 border-t border-[var(--border)] pt-3">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--warn)]">
                  <TrendingDown size={12} /> Decaying — refresh these
                </div>
                <div className="space-y-1">
                  {seo.decaying.map((d) => (
                    <div key={d.path} className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="truncate text-[var(--muted)]">{d.path}</span>
                      <span className="shrink-0 text-[var(--warn)]">
                        ↓{d.dropPct}% ({d.priorClicks}→{d.recentClicks} clk)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      {/* 2d) Movers — rank movement from stored history (needs a few days of data) */}
      {seo.connected && (
        <>
          <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-[var(--muted)]">
            <TrendingUp size={13} /> Movers
            {movers.hasHistory && (
              <span className="text-[11px] text-[var(--subtle)]">vs {movers.daysSpan}d ago</span>
            )}
          </div>
          <Card className="mb-5">
            {!movers.hasHistory ? (
              <div className="flex items-center gap-2.5 py-1 text-[12.5px] text-[var(--muted)]">
                <Loader2 size={15} className="text-[var(--subtle)]" />
                Collecting rank data — movers appear once there are a few days of history. Check
                back in a day or two.
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                <MoverColumn
                  title="Climbing"
                  icon={<TrendingUp size={13} className="text-[var(--success)]" />}
                  tone="success"
                  rows={movers.climbers}
                  empty="No climbers yet this week."
                />
                <MoverColumn
                  title="Slipping"
                  icon={<TrendingDown size={13} className="text-[var(--warn)]" />}
                  tone="warn"
                  rows={movers.droppers}
                  empty="Nothing slipping — good."
                />
              </div>
            )}
          </Card>
        </>
      )}

      {/* 2e) GEO — are AI answer engines citing us? */}
      {geo.connected && (
        <>
          <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-[var(--muted)]">
            <Bot size={13} /> AI answer visibility
            <span className="ml-1 flex items-center gap-1 rounded-full bg-[var(--success-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--success)]">
              GEO
            </span>
            <span className="ml-auto text-[11px] text-[var(--subtle)]">are ChatGPT / Perplexity citing you?</span>
          </div>
          <Link href="/geo" className="mb-5 block">
            <Card className="hover:bg-[var(--surface-2)]">
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-center">
                  <span className="text-[28px] font-bold leading-none text-[var(--success)]">
                    {geo.citationRate}%
                  </span>
                  <span className="mt-0.5 text-[10px] text-[var(--muted)]">cited</span>
                </div>
                <div className="min-w-0 flex-1 text-[12.5px] text-[var(--muted)]">
                  AI answers cite you for <b className="text-[var(--text)]">{geo.citedCount}</b> of{" "}
                  <b className="text-[var(--text)]">{geo.tested}</b> checked buyer questions.
                  {geo.notCited.length > 0 && (
                    <>
                      {" "}
                      {geo.notCited.length} not captured yet —{" "}
                      <span className="text-[var(--accent)]">the engine is targeting them.</span>
                    </>
                  )}
                </div>
                <ArrowRight size={15} className="shrink-0 text-[var(--accent)]" />
              </div>
            </Card>
          </Link>
        </>
      )}

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

/** A category progress bar for the goal panel (Local / Evergreen). */
function GoalBar({
  label,
  icon,
  ready,
  target,
}: {
  label: string;
  icon: ReactNode;
  ready: number;
  target: number;
}) {
  const pct = target > 0 ? Math.min(100, (ready / target) * 100) : 0;
  const done = target > 0 && ready >= target;
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-0)] p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[12px] text-[var(--muted)]">
        {icon} {label}
        <span className={`ml-auto font-medium ${done ? "text-[var(--success)]" : "text-[var(--text)]"}`}>
          {ready} / {target}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
        <div
          className={`h-full rounded-full ${done ? "bg-[var(--success)]" : "bg-[var(--accent)]"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** One side of the Movers panel — climbers or droppers. */
function MoverColumn({
  title,
  icon,
  tone,
  rows,
  empty,
}: {
  title: string;
  icon: ReactNode;
  tone: "success" | "warn";
  rows: { query: string; position: number; delta: number }[];
  empty: string;
}) {
  const color = tone === "success" ? "text-[var(--success)]" : "text-[var(--warn)]";
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
        {icon} {title}
      </div>
      {rows.length === 0 ? (
        <div className="text-[12px] text-[var(--subtle)]">{empty}</div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((m) => (
            <div key={m.query} className="flex items-center justify-between gap-2 text-[12.5px]">
              <span className="truncate">{m.query}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-[11px] text-[var(--muted)]">pos {m.position.toFixed(0)}</span>
                <span className={`font-medium ${color}`}>
                  {m.delta > 0 ? "▲" : "▼"}
                  {Math.abs(m.delta).toFixed(0)}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
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
