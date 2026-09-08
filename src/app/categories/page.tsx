import Link from "next/link";
import { Shell } from "@/components/shell";
import { PageHeader, Card, Pill } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { CategoryPoll } from "@/components/category-poll";
import { getBusiness } from "@/lib/data/repo";
import { listCategoryPages, flagCategoryRefreshes, type CategoryPageVM } from "@/lib/categories/service";
import { rescanCategoriesAction, draftCategoryAction, draftTierAction } from "@/app/categories/actions";
import {
  Layers,
  RefreshCw,
  Sparkles,
  ExternalLink,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Circle,
  Clock,
  PenLine,
} from "lucide-react";
import type { CategoryStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUS: Record<CategoryStatus, { label: string; tone: "neutral" | "accent" | "success" | "warn" | "danger" }> = {
  NOT_STARTED: { label: "Not started", tone: "neutral" },
  DRAFTING: { label: "Drafting…", tone: "accent" },
  DRAFT_READY: { label: "Draft ready", tone: "success" },
  NEEDS_FIX: { label: "Needs fix", tone: "warn" },
  LIVE: { label: "Live", tone: "success" },
  NEEDS_REFRESH: { label: "Needs refresh", tone: "danger" },
};

function StatusIcon({ s }: { s: CategoryStatus }) {
  const cls = "shrink-0";
  switch (s) {
    case "DRAFTING":
      return <Loader2 size={15} className={`${cls} animate-spin text-[var(--accent)]`} />;
    case "DRAFT_READY":
      return <PenLine size={15} className={`${cls} text-[var(--success)]`} />;
    case "LIVE":
      return <CheckCircle2 size={15} className={`${cls} text-[var(--success)]`} />;
    case "NEEDS_FIX":
      return <AlertTriangle size={15} className={`${cls} text-[var(--warn)]`} />;
    case "NEEDS_REFRESH":
      return <Clock size={15} className={`${cls} text-[var(--danger)]`} />;
    default:
      return <Circle size={15} className={`${cls} text-[var(--subtle)]`} />;
  }
}

const TIERS: { tier: 1 | 2 | 3; title: string; blurb: string }[] = [
  { tier: 1, title: "Hubs", blurb: "Head-term money pages. 1,500–2,000 words, comparison table, 6–8 FAQs." },
  { tier: 2, title: "Sub-collections", blurb: "Use-case and material pages. 800–1,200 words, 5–6 FAQs." },
  {
    tier: 3,
    title: "Colour, variant & state pages",
    blurb: "Short, focused copy that links back to the hub. State pages are localized (the place, delivery there, the Funeral Rule). 300–500 words.",
  },
];

function Row({ p }: { p: CategoryPageVM }) {
  const st = STATUS[p.status];
  const canDraft = p.status !== "DRAFTING";
  return (
    <Card className={`flex items-center gap-3 ${p.removed ? "opacity-50" : ""}`}>
      <StatusIcon s={p.status} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/categories/${p.id}`} className="truncate text-[13.5px] font-medium hover:underline">
            {p.title}
          </Link>
          <Pill tone={st.tone}>{st.label}</Pill>
          {p.removed && <Pill tone="danger">not on site</Pill>}
          {p.liveHasContent && p.status === "NOT_STARTED" && (
            <Pill tone="neutral">has copy on site</Pill>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[var(--muted)]">
          <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono hover:underline">
            /collections/{p.handle} <ExternalLink size={10} />
          </a>
          {p.targetKeyword && <span>“{p.targetKeyword}”</span>}
          {p.productCount != null && <span>{p.productCount} products</span>}
          {p.overall != null && (
            <span className={p.overall >= 85 ? "text-[var(--success)]" : "text-[var(--warn)]"}>grade {p.overall}</span>
          )}
          {p.words != null && <span>{p.words.toLocaleString()} words</span>}
          {p.factIssues.length > 0 && (
            <span className="text-[var(--warn)]">{p.factIssues.length} issue{p.factIssues.length === 1 ? "" : "s"}</span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {canDraft && p.status !== "LIVE" && (
          <form action={draftCategoryAction}>
            <input type="hidden" name="id" value={p.id} />
            <SubmitButton
              icon={<Sparkles size={13} />}
              pendingLabel="Starting…"
              className="flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-3 py-1.5 text-[12px] text-[var(--muted)] hover:bg-[var(--surface-2)]"
            >
              {p.status === "NOT_STARTED" ? "Draft" : "Redraft"}
            </SubmitButton>
          </form>
        )}
        <Link
          href={`/categories/${p.id}`}
          className="flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-3 py-1.5 text-[12px] font-medium hover:bg-[var(--border)]"
        >
          Open <ArrowRight size={12} />
        </Link>
      </div>
    </Card>
  );
}

export default async function CategoriesPage() {
  await flagCategoryRefreshes().catch(() => 0);
  const [biz, pages] = await Promise.all([getBusiness(), listCategoryPages()]);
  const active = pages.filter((p) => !p.removed);
  const counts = {
    ready: active.filter((p) => p.status === "DRAFT_READY").length,
    live: active.filter((p) => p.status === "LIVE").length,
    fix: active.filter((p) => p.status === "NEEDS_FIX").length,
    refresh: active.filter((p) => p.status === "NEEDS_REFRESH").length,
    drafting: active.filter((p) => p.status === "DRAFTING").length,
  };

  return (
    <Shell>
      <CategoryPoll active={counts.drafting > 0} />
      <div className="mb-4 flex items-start justify-between gap-4">
        <PageHeader
          title="Category pages"
          subtitle={`SEO content for every collection page on ${biz.domain}. The engine writes paste-ready blocks; you paste them into Shopify. Nothing here publishes automatically.`}
        />
        <form action={rescanCategoriesAction} className="shrink-0">
          <SubmitButton
            icon={<RefreshCw size={13} />}
            pendingLabel="Scanning site…"
            title="Crawl the store and refresh the list of collection pages"
            className="flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-3.5 py-2 text-[12px] font-medium hover:bg-[var(--surface-2)]"
          >
            Rescan site
          </SubmitButton>
        </form>
      </div>

      {pages.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <Layers size={26} className="text-[var(--muted)]" />
            <div className="text-[14px] font-medium">No collection pages yet</div>
            <p className="max-w-md text-[13px] text-[var(--muted)]">
              Scan {biz.domain} and every collection page shows up here with its current title, product
              count, and a starting keyword — before anyone writes a word.
            </p>
            <form action={rescanCategoriesAction}>
              <SubmitButton
                icon={<RefreshCw size={14} />}
                pendingLabel="Scanning site…"
                className="flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-2 text-[13px] font-medium text-white hover:opacity-90"
              >
                Scan the site now
              </SubmitButton>
            </form>
          </div>
        </Card>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 font-medium text-[var(--muted)]">
              {active.length} pages
            </span>
            {counts.drafting > 0 && (
              <span className="rounded-full bg-[var(--accent-bg)] px-2.5 py-1 font-medium text-[var(--accent)]">
                {counts.drafting} drafting
              </span>
            )}
            {counts.ready > 0 && (
              <span className="rounded-full bg-[var(--success-bg)] px-2.5 py-1 font-medium text-[var(--success)]">
                {counts.ready} ready to paste
              </span>
            )}
            {counts.fix > 0 && (
              <span className="rounded-full bg-[var(--warn-bg)] px-2.5 py-1 font-medium text-[var(--warn)]">
                {counts.fix} need a fix
              </span>
            )}
            {counts.live > 0 && (
              <span className="rounded-full bg-[var(--success-bg)] px-2.5 py-1 font-medium text-[var(--success)]">
                {counts.live} live
              </span>
            )}
            {counts.refresh > 0 && (
              <span className="rounded-full bg-[var(--danger-bg)] px-2.5 py-1 font-medium text-[var(--danger)]">
                {counts.refresh} need refresh
              </span>
            )}
          </div>

          {TIERS.map((t) => {
            const rows = pages.filter((p) => p.tier === t.tier);
            if (!rows.length) return null;
            const undrafted = rows.filter((p) => !p.removed && (p.status === "NOT_STARTED" || p.status === "NEEDS_FIX")).length;
            return (
              <section key={t.tier} className="mb-7">
                <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h2 className="text-[15px] font-medium">
                      {t.title}{" "}
                      <span className="text-[12px] font-normal text-[var(--muted)]">· {rows.length}</span>
                    </h2>
                    <p className="text-[12px] text-[var(--muted)]">{t.blurb}</p>
                  </div>
                  {undrafted > 0 && (
                    <form action={draftTierAction}>
                      <input type="hidden" name="tier" value={t.tier} />
                      <SubmitButton
                        icon={<Sparkles size={13} />}
                        pendingLabel="Starting…"
                        title={`Draft every undrafted page in this tier (${undrafted})`}
                        className="flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
                      >
                        Draft all ({undrafted})
                      </SubmitButton>
                    </form>
                  )}
                </div>
                <div className="space-y-2">
                  {rows.map((p) => (
                    <Row key={p.id} p={p} />
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
    </Shell>
  );
}
