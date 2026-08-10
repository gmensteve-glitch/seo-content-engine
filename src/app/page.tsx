import type { ReactNode } from "react";
import Link from "next/link";
import { Shell } from "@/components/shell";
import { PageHeader, Card, StatTile } from "@/components/ui";
import {
  getBusiness,
  getKpis,
  getPendingBriefs,
  getLivePages,
  getPipeline,
} from "@/lib/data/repo";
import { ClipboardCheck, TrendingUp, PenLine, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const biz = await getBusiness();
  const kpis = await getKpis();
  const briefs = await getPendingBriefs();
  const pages = await getLivePages();
  const pipeline = await getPipeline();

  const boosts = pages.filter((p) => p.flag === "boost").length;
  const rewrites = pages.filter((p) => p.flag === "rewrite").length;
  const inProgress = pipeline.filter((c) => c.stage === "in_progress").length;
  const scheduled = pipeline.filter((c) => c.stage === "scheduled").length;

  return (
    <Shell>
      <PageHeader title="Overview" subtitle={biz.domain} />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Live pages" value={kpis.livePages} />
        <StatTile label="Indexed" value={kpis.indexed} />
        <StatTile label="Impressions 28d" value={kpis.impressions28d.toLocaleString()} />
        <StatTile label="Clicks 28d" value={kpis.clicks28d} />
        <StatTile label="Avg quality" value={kpis.avgQuality || "—"} accent="success" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <ClipboardCheck size={17} className="text-[var(--accent)]" />
            <h2 className="text-[15px] font-medium">Needs you today</h2>
          </div>
          <div className="space-y-2.5">
            <Row
              icon={<ClipboardCheck size={15} />}
              label={`${briefs.length} briefs awaiting approval`}
              href="/briefs"
              tone="warn"
            />
            <Row
              icon={<TrendingUp size={15} />}
              label={`${boosts} page at striking distance`}
              href="/performance"
              tone="accent"
            />
            <Row
              icon={<PenLine size={15} />}
              label={`${rewrites} page needs a title rewrite`}
              href="/performance"
              tone="accent"
            />
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-[15px] font-medium">Pipeline snapshot</h2>
          <div className="grid grid-cols-2 gap-2.5">
            <Snap label="Ideas" n={pipeline.filter((c) => c.stage === "ideas").length} />
            <Snap label="Awaiting approval" n={briefs.length} />
            <Snap label="In progress" n={inProgress} />
            <Snap label="Scheduled" n={scheduled} />
          </div>
          <Link
            href="/pipeline"
            className="mt-3 flex items-center gap-1 text-[13px] font-medium text-[var(--accent)]"
          >
            Open pipeline <ArrowRight size={14} />
          </Link>
        </Card>
      </div>

      <p className="mt-6 text-[12px] text-[var(--subtle)]">
        Autopilot {kpis.autopilot ? "on" : "off"} · data shown is seeded sample data until
        connectors and the database are live.
      </p>
    </Shell>
  );
}

function Row({
  icon,
  label,
  href,
  tone,
}: {
  icon: ReactNode;
  label: string;
  href: string;
  tone: "warn" | "accent";
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2.5 hover:bg-[var(--surface-2)]"
    >
      <span className="flex items-center gap-2.5 text-[13px]">
        <span className={tone === "warn" ? "text-[var(--warn)]" : "text-[var(--accent)]"}>
          {icon}
        </span>
        {label}
      </span>
      <ArrowRight size={14} className="text-[var(--subtle)]" />
    </Link>
  );
}

function Snap({ label, n }: { label: string; n: number }) {
  return (
    <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2.5">
      <div className="text-[20px] font-medium">{n}</div>
      <div className="text-[12px] text-[var(--muted)]">{label}</div>
    </div>
  );
}
