"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { PolishDraftVM } from "@/lib/data/types";
import { Bar } from "@/components/ui";
import {
  Sparkles,
  Wand2,
  RefreshCw,
  X,
  CalendarPlus,
  Rocket,
  MessageSquare,
  MousePointerClick,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";

function defaultWhen(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1); // default: tomorrow 9am
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`;
}

export function ReviewEditor({ initial }: { initial: PolishDraftVM }) {
  const [vm, setVm] = useState<PolishDraftVM>(initial);
  const [selection, setSelection] = useState("");
  const [instruction, setInstruction] = useState("");
  const [when, setWhen] = useState(defaultWhen());
  const [busy, setBusy] = useState<null | "boost" | "edit" | "regrade" | "schedule" | "publish">(null);
  const [note, setNote] = useState("");
  const [done, setDone] = useState<null | { label: string; href: string }>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const gap = vm.threshold - vm.overall;
  const passed = vm.status === "passed";

  async function post(path: string, body: Record<string, unknown>) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  }

  async function run(
    kind: typeof busy,
    path: string,
    body: Record<string, unknown>,
    onOk: (data: Record<string, unknown>) => void,
  ) {
    setBusy(kind);
    setNote("");
    try {
      const { ok, data } = await post(path, body);
      if (!ok) {
        setNote(data.error ? `Error: ${data.error}` : "Something went wrong.");
        return;
      }
      onOk(data);
    } catch {
      setNote("Network error — try again.");
    } finally {
      setBusy(null);
    }
  }

  function captureSelection() {
    const sel = window.getSelection()?.toString() ?? "";
    if (sel.trim().length > 2) setSelection(sel);
  }

  const applyEdit = () =>
    run("edit", "/api/review/edit", { draftId: vm.id, selectedText: selection, instruction }, (d) => {
      if (d.draft) setVm(d.draft as PolishDraftVM);
      setSelection("");
      setInstruction("");
      setNote("Passage updated. Re-grade to see the new score.");
    });

  const boost = () =>
    run("boost", "/api/review/boost", { draftId: vm.id }, (d) => {
      if (d.draft) setVm(d.draft as PolishDraftVM);
      const r = (d.result ?? {}) as { usedProducts?: number; usedSources?: number };
      const n = (r.usedProducts ?? 0) + (r.usedSources ?? 0);
      setNote(
        n === 0
          ? "No product or web data available to boost with yet (connect Shopify / check data connectors)."
          : `Boosted with ${r.usedProducts ?? 0} product fact(s) + ${r.usedSources ?? 0} source(s), then re-graded.`,
      );
    });

  const regrade = () =>
    run("regrade", "/api/review/regrade", { draftId: vm.id }, (d) => {
      if (d.draft) setVm(d.draft as PolishDraftVM);
      setNote("Re-graded.");
    });

  const moveToCalendar = () =>
    run("schedule", "/api/review/schedule", { draftId: vm.id, scheduledFor: when }, () => {
      setDone({ label: "Moved to calendar", href: "/calendar" });
    });

  const publishNow = () =>
    run("publish", "/api/review/publish", { draftId: vm.id }, () => {
      setDone({ label: "Published", href: "/performance" });
    });

  return (
    <div>
      <Link
        href={passed ? "/ready" : "/review"}
        className="mb-3 inline-flex items-center gap-1 text-[12px] text-[var(--muted)] hover:text-[var(--text)]"
      >
        <ArrowLeft size={13} /> {passed ? "All ready pieces" : "All near-misses"}
      </Link>

      {/* Score header (Quality-style) */}
      <div className="mb-1 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[19px] font-semibold tracking-tight">{vm.title}</h1>
          <div className="mt-0.5 text-[12px] text-[var(--muted)]">{vm.targetKeyword}</div>
        </div>
      </div>
      <div className="mb-4 flex items-baseline gap-3">
        <span
          className={`text-[44px] font-semibold leading-none ${passed ? "text-[var(--success)]" : "text-[var(--warn)]"}`}
        >
          {vm.overall}
        </span>
        <span className="text-[12.5px] text-[var(--muted)]">
          / 100 · {passed ? `passed threshold (${vm.threshold})` : `${gap} below threshold (${vm.threshold})`} · loop{" "}
          {vm.loop}
        </span>
      </div>

      {/* Success banner after schedule/publish */}
      {done && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--success)] bg-[var(--success-bg)] px-3 py-2.5 text-[13px] text-[var(--success)]">
          <CheckCircle2 size={16} /> {done.label}.
          <Link href={done.href} className="ml-1 font-medium underline">
            {done.href === "/calendar" ? "Open calendar" : "See it"}
          </Link>
        </div>
      )}

      {/* FULL scorecard — every dimension, always visible */}
      <div className="mb-4 space-y-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
        {vm.dimensions.map((d) => {
          const pct = (d.score / d.max) * 100;
          const tone = pct >= 85 ? "success" : pct >= 70 ? "warn" : "danger";
          return (
            <div key={d.key}>
              <div className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-[12px] text-[var(--muted)]">{d.label}</span>
                <Bar pct={pct} tone={tone} />
                <span className="w-12 shrink-0 text-right text-[12px] text-[var(--muted)]">
                  {d.score}/{d.max}
                </span>
              </div>
              {d.note && <p className="ml-40 pl-3 text-[11px] text-[var(--subtle)]">{d.note}</p>}
            </div>
          );
        })}
        {vm.feedback && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-2.5">
            <MessageSquare size={15} className="mt-0.5 shrink-0 text-[var(--muted)]" />
            <p className="text-[12.5px] text-[var(--text)]">
              <span className="font-medium">Notes: </span>
              {vm.feedback}
            </p>
          </div>
        )}
      </div>

      {/* Primary actions */}
      {passed && !done ? (
        <div className="mb-4 rounded-xl border border-[var(--success)] bg-[var(--success-bg)] p-4">
          <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-[var(--success)]">
            <CheckCircle2 size={13} /> Ready to publish
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface-0)] px-2.5 py-2 text-[13px]"
            />
            <button
              onClick={moveToCalendar}
              disabled={busy !== null}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--success)] px-3.5 py-2 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-50"
            >
              <CalendarPlus size={15} /> {busy === "schedule" ? "Moving…" : "Move to calendar"}
            </button>
            <button
              onClick={publishNow}
              disabled={busy !== null}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 py-2 text-[13px] text-[var(--muted)] hover:bg-[var(--surface-1)] disabled:opacity-50"
            >
              <Rocket size={14} /> {busy === "publish" ? "Publishing…" : "Publish now"}
            </button>
          </div>
        </div>
      ) : !passed ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            onClick={boost}
            disabled={busy !== null}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-50"
          >
            <Sparkles size={15} /> {busy === "boost" ? "Boosting…" : "Boost with data"}
          </button>
          <button
            onClick={regrade}
            disabled={busy !== null}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 py-2 text-[13px] text-[var(--muted)] hover:bg-[var(--surface-2)] disabled:opacity-50"
          >
            <RefreshCw size={14} /> {busy === "regrade" ? "Grading…" : "Re-grade"}
          </button>
        </div>
      ) : null}

      {note && (
        <div className="mb-2 rounded-md bg-[var(--surface-2)] px-3 py-2 text-[12px] text-[var(--text)]">
          {note}
        </div>
      )}

      {/* Read the post — highlight any text to reword it */}
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--subtle)]">
        <MousePointerClick size={12} /> The post — highlight any line to reword it
      </div>
      <div
        ref={bodyRef}
        onMouseUp={captureSelection}
        className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4 text-[13.5px] leading-relaxed text-[var(--text)] selection:bg-[var(--accent)] selection:text-white"
      >
        {vm.bodyMd}
      </div>

      {/* Highlight → instruct chatbox */}
      {selection && (
        <div className="fixed inset-x-0 bottom-4 z-30 mx-auto w-[min(680px,92vw)] rounded-xl border border-[var(--border-strong)] bg-[var(--surface-1)] p-3 shadow-lg">
          <div className="mb-2 flex items-start gap-2">
            <Wand2 size={14} className="mt-0.5 shrink-0 text-[var(--accent)]" />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium text-[var(--muted)]">Selected passage</div>
              <div className="truncate text-[12px] text-[var(--text)]">
                &ldquo;{selection.slice(0, 120)}
                {selection.length > 120 ? "…" : ""}&rdquo;
              </div>
            </div>
            <button
              onClick={() => {
                setSelection("");
                setInstruction("");
              }}
              className="shrink-0 text-[var(--subtle)] hover:text-[var(--text)]"
            >
              <X size={15} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && busy === null) applyEdit();
              }}
              placeholder="What should I change? e.g. 'shorten this', 'add a real stat', 'make it warmer'"
              className="flex-1 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-0)] px-3 py-2 text-[13px]"
            />
            <button
              onClick={applyEdit}
              disabled={busy !== null || !instruction.trim()}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-50"
            >
              <Wand2 size={14} /> {busy === "edit" ? "Editing…" : "Apply"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
