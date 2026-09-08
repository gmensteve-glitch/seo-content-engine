import Link from "next/link";
import { Circle, Loader2, PenLine, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import type { CategoryPageVM } from "@/lib/categories/service";
import { draftCategoryAction } from "@/app/categories/actions";
import { SubmitButton } from "@/components/submit-button";
import type { CategoryStatus } from "@prisma/client";

const LABEL: Record<CategoryStatus, string> = {
  NOT_STARTED: "Not started",
  DRAFTING: "Writing…",
  DRAFT_READY: "Ready",
  NEEDS_FIX: "Needs a look",
  LIVE: "Live",
  NEEDS_REFRESH: "Refresh due",
};

const COLOR: Record<CategoryStatus, string> = {
  NOT_STARTED: "text-[var(--subtle)]",
  DRAFTING: "text-[var(--accent)]",
  DRAFT_READY: "text-[var(--success)]",
  NEEDS_FIX: "text-[var(--warn)]",
  LIVE: "text-[var(--success)]",
  NEEDS_REFRESH: "text-[var(--danger)]",
};

function Icon({ s }: { s: CategoryStatus }) {
  const c = COLOR[s];
  switch (s) {
    case "DRAFTING":
      return <Loader2 size={15} className={`shrink-0 animate-spin ${c}`} />;
    case "DRAFT_READY":
      return <PenLine size={15} className={`shrink-0 ${c}`} />;
    case "LIVE":
      return <CheckCircle2 size={15} className={`shrink-0 ${c}`} />;
    case "NEEDS_FIX":
      return <AlertTriangle size={15} className={`shrink-0 ${c}`} />;
    case "NEEDS_REFRESH":
      return <Clock size={15} className={`shrink-0 ${c}`} />;
    default:
      return <Circle size={15} className={`shrink-0 ${c}`} />;
  }
}

function tierTag(p: CategoryPageVM): string {
  if (p.tier === 1) return "Hub";
  if (p.tier === 3) return p.locality ? "State" : "Colour";
  return "Sub";
}

function Row({ p }: { p: CategoryPageVM }) {
  const canDraft = p.status === "NOT_STARTED" || p.status === "NEEDS_REFRESH";
  const hasDraft = p.words != null;
  // Secondary line: the H1 we wrote (so you can see it), else the keyword.
  const sub = hasDraft && p.title !== p.name ? p.title : p.targetKeyword ? `“${p.targetKeyword}”` : "";
  const action =
    p.status === "DRAFT_READY" || p.status === "NEEDS_FIX"
      ? "Review →"
      : p.status === "LIVE"
        ? "Open →"
        : p.status === "DRAFTING"
          ? "Watch →"
          : p.status === "NEEDS_REFRESH"
            ? "Refresh →"
            : "Draft →";
  return (
    <div
      className={`flex min-h-[56px] items-center gap-3 border-b border-[var(--border)] px-[18px] py-2 last:border-b-0 ${
        p.removed ? "opacity-50" : ""
      }`}
    >
      <Icon s={p.status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <Link href={`/categories/${p.id}`} className="truncate text-[13.5px] font-medium hover:underline">
            {p.name}
          </Link>
          <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-[1px] text-[10.5px] font-medium text-[var(--muted)]">
            {tierTag(p)}
          </span>
          {p.productCount != null && <span className="shrink-0 text-[11px] text-[var(--subtle)]">{p.productCount} products</span>}
          {p.removed && <span className="shrink-0 text-[11px] text-[var(--danger)]">not on site</span>}
        </div>
        {sub && <div className="truncate text-[12px] text-[var(--subtle)]">{sub}</div>}
      </div>
      <div className={`shrink-0 text-[12px] ${COLOR[p.status]}`}>
        {LABEL[p.status]}
        {p.overall != null && (p.status === "DRAFT_READY" || p.status === "NEEDS_FIX" || p.status === "LIVE") ? ` · ${p.overall}` : ""}
      </div>
      {canDraft && !p.removed ? (
        <form action={draftCategoryAction} className="shrink-0">
          <input type="hidden" name="id" value={p.id} />
          <input type="hidden" name="go" value="1" />
          <SubmitButton pendingLabel="Starting…" className="h-[34px] w-[72px] text-right text-[12px] font-medium text-[var(--accent)] hover:underline">
            {action}
          </SubmitButton>
        </form>
      ) : (
        <Link href={`/categories/${p.id}`} className="w-[72px] shrink-0 text-right text-[12px] font-medium text-[var(--accent)] hover:underline">
          {action}
        </Link>
      )}
    </div>
  );
}

/** One long list. Priority order: ready → needs a look → refresh due → not started → writing → live; hubs first within each. */
export function CategoryList({ pages }: { pages: CategoryPageVM[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)]">
      {pages.map((p) => (
        <Row key={p.id} p={p} />
      ))}
    </div>
  );
}
