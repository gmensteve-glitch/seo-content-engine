"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Circle,
  Loader2,
  PenLine,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
} from "lucide-react";
import type { CategoryPageVM } from "@/lib/categories/service";
import { draftCategoryAction, draftTierAction } from "@/app/categories/actions";
import { SubmitButton } from "@/components/submit-button";
import type { CategoryStatus } from "@prisma/client";

export type Group = { tier: 1 | 2 | 3; title: string; blurb: string; pages: CategoryPageVM[] };

const PAGE_SIZE = 5;

const LABEL: Record<CategoryStatus, string> = {
  NOT_STARTED: "Not started",
  DRAFTING: "Drafting…",
  DRAFT_READY: "Ready to paste",
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

function summary(pages: CategoryPageVM[]): string {
  const c = (s: CategoryStatus) => pages.filter((p) => p.status === s).length;
  const parts: string[] = [];
  if (c("DRAFT_READY")) parts.push(`${c("DRAFT_READY")} ready`);
  if (c("NEEDS_FIX")) parts.push(`${c("NEEDS_FIX")} need a look`);
  if (c("DRAFTING")) parts.push(`${c("DRAFTING")} drafting`);
  if (c("NEEDS_REFRESH")) parts.push(`${c("NEEDS_REFRESH")} refresh due`);
  if (c("LIVE")) parts.push(`${c("LIVE")} live`);
  if (!parts.length) return "Not started";
  return parts.join(" · ");
}

function Row({ p }: { p: CategoryPageVM }) {
  const canDraft = p.status === "NOT_STARTED" || p.status === "NEEDS_REFRESH";
  return (
    <div
      className={`flex h-[46px] items-center gap-3 border-b border-[var(--border)] pl-11 pr-[18px] last:border-b-0 ${
        p.removed ? "opacity-50" : ""
      }`}
    >
      <Icon s={p.status} />
      <Link href={`/categories/${p.id}`} className="truncate text-[13.5px] font-medium hover:underline">
        {p.title}
      </Link>
      <div className="min-w-0 flex-1 truncate text-[12px] text-[var(--subtle)]">
        {p.targetKeyword ? `“${p.targetKeyword}”` : ""}
        {p.removed ? " · not on site" : ""}
      </div>
      <div className={`shrink-0 text-[12px] ${COLOR[p.status]}`}>{LABEL[p.status]}</div>
      {canDraft && !p.removed ? (
        <form action={draftCategoryAction} className="shrink-0">
          <input type="hidden" name="id" value={p.id} />
          <input type="hidden" name="go" value="1" />
          <SubmitButton pendingLabel="Starting…" className="h-[34px] pl-2 text-[12px] font-medium text-[var(--accent)] hover:underline">
            {p.status === "NEEDS_REFRESH" ? "Refresh →" : "Draft →"}
          </SubmitButton>
        </form>
      ) : (
        <Link href={`/categories/${p.id}`} className="shrink-0 pl-2 text-[12px] font-medium text-[var(--accent)] hover:underline">
          Open →
        </Link>
      )}
    </div>
  );
}

export function CategoryGroups({ groups }: { groups: Group[] }) {
  const firstWithPages = groups.find((g) => g.pages.length)?.tier ?? 1;
  const [open, setOpen] = useState<Set<number>>(new Set([firstWithPages]));
  const [shown, setShown] = useState<Record<number, number>>({});

  function toggle(tier: number) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      {groups.map((g) => {
        if (!g.pages.length) return null;
        const isOpen = open.has(g.tier);
        const n = shown[g.tier] ?? PAGE_SIZE;
        const visible = g.pages.slice(0, n);
        const remaining = g.pages.length - visible.length;
        const undrafted = g.pages.filter((p) => !p.removed && (p.status === "NOT_STARTED" || p.status === "NEEDS_FIX")).length;
        return (
          <div key={g.tier} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)]">
            <button
              type="button"
              onClick={() => toggle(g.tier)}
              className="flex h-[52px] w-full items-center gap-3 px-[18px] text-left hover:bg-[var(--surface-2)]"
              aria-expanded={isOpen}
            >
              {isOpen ? (
                <ChevronDown size={14} className="text-[var(--muted)]" />
              ) : (
                <ChevronRight size={14} className="text-[var(--muted)]" />
              )}
              <div className="flex-1 text-[14px] font-semibold">
                {g.title} <span className="font-normal text-[var(--subtle)]">· {g.pages.length}</span>
              </div>
              <div className="text-[12px] text-[var(--muted)]">{summary(g.pages)}</div>
            </button>
            {isOpen && (
              <div className="border-t border-[var(--border)]">
                <div className="flex items-center justify-between gap-3 px-[18px] py-2.5 text-[12px] text-[var(--muted)]">
                  <span>{g.blurb}</span>
                  {undrafted > 0 && (
                    <form action={draftTierAction} className="shrink-0">
                      <input type="hidden" name="tier" value={g.tier} />
                      <SubmitButton
                        icon={<Sparkles size={12} />}
                        pendingLabel="Starting…"
                        title={`Draft every undrafted page in this group (${undrafted}), one after another`}
                        className="flex h-[30px] items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-3 text-[12px] font-medium hover:bg-[var(--surface-2)]"
                      >
                        Draft all {undrafted}
                      </SubmitButton>
                    </form>
                  )}
                </div>
                <div className="border-t border-[var(--border)]">
                  {visible.map((p) => (
                    <Row key={p.id} p={p} />
                  ))}
                </div>
                {remaining > 0 && (
                  <button
                    type="button"
                    onClick={() => setShown((s) => ({ ...s, [g.tier]: n + PAGE_SIZE }))}
                    className="flex h-[40px] w-full items-center justify-center border-t border-[var(--border)] text-[12px] text-[var(--muted)] hover:bg-[var(--surface-2)]"
                  >
                    Show {Math.min(PAGE_SIZE, remaining)} more
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
