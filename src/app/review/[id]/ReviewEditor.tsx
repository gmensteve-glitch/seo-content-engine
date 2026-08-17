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
  PartyPopper,
  MousePointerClick,
  ArrowLeft,
} from "lucide-react";

export function ReviewEditor({ initial }: { initial: PolishDraftVM }) {
  const [vm, setVm] = useState<PolishDraftVM>(initial);
  const [selection, setSelection] = useState("");
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState<null | "boost" | "edit" | "regrade">(null);
  const [note, setNote] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);

  const gap = vm.threshold - vm.overall;
  const passed = vm.status === "passed";
  const weak = vm.dimensions
    .filter((d) => d.score < d.max)
    .sort((a, b) => a.score / a.max - b.score / b.max);

  async function call(
    path: string,
    body: Record<string, unknown>,
    kind: "boost" | "edit" | "regrade",
    okNote: (data: { result?: { usedProducts?: number; usedSources?: number } }) => string,
  ) {
    setBusy(kind);
    setNote("");
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.draft) {
        setNote(data.error ? `Error: ${data.error}` : "Something went wrong.");
        return;
      }
      setVm(data.draft as PolishDraftVM);
      setNote(okNote(data));
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

  async function applyEdit() {
    if (!selection.trim() || !instruction.trim()) return;
    await call(
      "/api/review/edit",
      { draftId: vm.id, selectedText: selection, instruction },
      "edit",
      () => "Passage updated. Re-grade when you're ready to check the score.",
    );
    setSelection("");
    setInstruction("");
  }

  return (
    <div>
      <Link
        href="/review"
        className="mb-3 inline-flex items-center gap-1 text-[12px] text-[var(--muted)] hover:text-[var(--text)]"
      >
        <ArrowLeft size={13} /> All near-misses
      </Link>

      {/* Score header */}
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[19px] font-semibold tracking-tight">{vm.title}</h1>
          <div className="mt-0.5 text-[12px] text-[var(--muted)]">{vm.targetKeyword}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[26px] font-semibold leading-none">
            <span className={passed ? "text-[var(--success)]" : "text-[var(--warn)]"}>
              {vm.overall}
            </span>
            <span className="text-[14px] font-normal text-[var(--muted)]">/{vm.threshold}</span>
          </div>
          <div className={`mt-0.5 text-[11px] ${passed ? "text-[var(--success)]" : "text-[var(--warn)]"}`}>
            {passed ? "cleared" : `${gap} to go`}
          </div>
        </div>
      </div>

      {passed && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--success)] bg-[var(--success-bg)] px-3 py-2.5 text-[13px] text-[var(--success)]">
          <PartyPopper size={16} /> This cleared the bar and moved to the calendar&apos;s ready
          queue.
          <Link href="/calendar" className="ml-1 font-medium underline">
            Open calendar
          </Link>
        </div>
      )}

      {/* Weak dimensions */}
      {!passed && weak.length > 0 && (
        <div className="mb-3 grid gap-1.5 rounded-lg bg-[var(--surface-2)] p-3 sm:grid-cols-2">
          {weak.slice(0, 4).map((d) => {
            const pct = (d.score / d.max) * 100;
            const tone = pct < 50 ? "danger" : pct < 80 ? "warn" : "success";
            return (
              <div key={d.key} className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-[11.5px] text-[var(--muted)]">{d.label}</span>
                <Bar pct={pct} tone={tone} />
                <span className="w-9 shrink-0 text-right text-[11px] tabular-nums">
                  {d.score}/{d.max}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Actions */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          onClick={() =>
            call("/api/review/boost", { draftId: vm.id }, "boost", (d) => {
              const p = d.result?.usedProducts ?? 0;
              const s = d.result?.usedSources ?? 0;
              return p + s === 0
                ? "No product or web data available to boost with yet (connect Shopify / check data connectors)."
                : `Boosted with ${p} product fact(s) + ${s} source(s), then re-graded.`;
            })
          }
          disabled={busy !== null || passed}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-50"
        >
          <Sparkles size={15} /> {busy === "boost" ? "Boosting…" : "Boost with data"}
        </button>
        <button
          onClick={() =>
            call("/api/review/regrade", { draftId: vm.id }, "regrade", () => "Re-graded.")
          }
          disabled={busy !== null}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 py-2 text-[13px] text-[var(--muted)] hover:bg-[var(--surface-2)] disabled:opacity-50"
        >
          <RefreshCw size={14} /> {busy === "regrade" ? "Grading…" : "Re-grade"}
        </button>
        <span className="ml-1 flex items-center gap-1 text-[11.5px] text-[var(--subtle)]">
          <MousePointerClick size={13} /> or highlight any text below to reword it
        </span>
      </div>

      {note && (
        <div className="mb-2 rounded-md bg-[var(--surface-2)] px-3 py-2 text-[12px] text-[var(--text)]">
          {note}
        </div>
      )}

      {/* Read view — select text to edit it */}
      <div
        ref={bodyRef}
        onMouseUp={captureSelection}
        className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4 text-[13.5px] leading-relaxed text-[var(--text)] selection:bg-[var(--accent)] selection:text-white"
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
                if (e.key === "Enter" && !busy) applyEdit();
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
