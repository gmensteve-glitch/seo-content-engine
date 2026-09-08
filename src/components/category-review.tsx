"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  AlertTriangle,
  Clock,
  Loader2,
  Wand2,
  Info,
  X,
  ExternalLink,
  Sparkles,
  Undo2,
  Copy,
  Highlighter,
} from "lucide-react";
import type { CategoryPageDetailVM } from "@/lib/categories/service";
import { SubmitButton } from "@/components/submit-button";
import {
  draftCategoryAction,
  autoFixCategoryAction,
  fixCategoryAction,
  fixPassageCategoryAction,
  saveCategoryEditsAction,
  markCategoryNotLiveAction,
  markCategoryRefreshAction,
  setCategoryStrategyAction,
  type PassageFixResult,
} from "@/app/categories/actions";

const READ_CSS = `
.cat-read { font-size: 15.5px; line-height: 1.65; color: var(--text); }
.cat-read h2 { font-size: 18px; font-weight: 600; line-height: 1.3; margin: 26px 0 8px; scroll-margin-top: 16px; }
.cat-read h3 { font-size: 15.5px; font-weight: 600; margin: 18px 0 6px; }
.cat-read p { margin: 0 0 12px; max-width: 62ch; }
.cat-read ul, .cat-read ol { margin: 0 0 12px 22px; max-width: 62ch; }
.cat-read li { margin-bottom: 5px; }
.cat-read a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
.cat-read table { border-collapse: collapse; width: 100%; margin: 8px 0 16px; font-size: 13.5px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.cat-read th { text-align: left; font-weight: 500; color: var(--muted); background: var(--surface-2); padding: 9px 12px; }
.cat-read td { padding: 9px 12px; border-top: 1px solid var(--border); vertical-align: top; }
.cat-read ::selection { background: var(--accent-bg); }
`;

type Tab = "read" | "edit" | "score" | "html" | "text";

/** Clickable step bar — the way to move along to Paste and Done. */
function Steps({ step, pasteHref }: { step: 1 | 2 | 3; pasteHref: string | null }) {
  const items: { n: 1 | 2 | 3; label: string; href: string | null }[] = [
    { n: 1, label: "Review", href: null },
    { n: 2, label: "Paste", href: pasteHref },
    { n: 3, label: "Done", href: pasteHref ? `${pasteHref}?step=done` : null },
  ];
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {items.map((it) => {
        const cls = `flex flex-col gap-1.5 ${it.href ? "group cursor-pointer" : ""}`;
        const inner = (
          <>
            <div className={`h-1 rounded-full ${it.n < step ? "bg-[var(--success)]" : it.n === step ? "bg-[var(--accent)]" : "bg-[var(--border)] group-hover:bg-[var(--border-strong)]"}`} />
            <div className={`text-[11.5px] ${it.n === step ? "font-medium text-[var(--text)]" : it.href ? "text-[var(--muted)] group-hover:text-[var(--text)]" : "text-[var(--subtle)]"}`}>
              {it.n} · {it.label}
              {it.href && it.n !== step ? " →" : ""}
            </div>
          </>
        );
        return it.href ? (
          <Link key={it.n} href={it.href} className={cls}>
            {inner}
          </Link>
        ) : (
          <div key={it.n} className={cls}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, name, value, rows, limit, mono }: { label: string; name: string; value: string; rows?: number; limit?: number; mono?: boolean }) {
  const [v, setV] = useState(value);
  const over = limit != null && v.length > limit;
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between text-[12px] text-[var(--muted)]">
        <span>{label}</span>
        {limit != null && <span className={`font-mono text-[11px] ${over ? "text-[var(--danger)]" : "text-[var(--subtle)]"}`}>{v.length} / {limit}</span>}
      </span>
      {rows ? (
        <textarea name={name} value={v} onChange={(e) => setV(e.target.value)} rows={rows} className={`w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-0)] px-3.5 py-2.5 leading-relaxed ${mono ? "font-mono text-[12.5px]" : "text-[14px]"}`} />
      ) : (
        <input name={name} value={v} onChange={(e) => setV(e.target.value)} className="h-10 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-0)] px-3.5 text-[14px]" />
      )}
    </label>
  );
}

function money(n: number | null | undefined): string {
  return n == null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`;
}

function CopyButton({ text, small = false }: { text: string; small?: boolean }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1600);
    } catch {
      /* clipboard blocked — text is selectable */
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className={`flex items-center gap-1.5 rounded-full font-medium ${small ? "h-8 px-3 text-[12px]" : "h-9 px-3.5 text-[12.5px]"} ${
        done ? "bg-[var(--success-bg)] text-[var(--success)]" : "bg-[var(--accent)] text-white hover:opacity-90"
      }`}
    >
      {done ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} />} {done ? "Copied" : "Copy"}
    </button>
  );
}

function CopyBlock({ label, value, mono = false, limit }: { label: string; value: string; mono?: boolean; limit?: number }) {
  const over = limit != null && value.length > limit;
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)]">
      <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-2.5">
        <div className="flex-1 text-[13px] font-medium">{label}</div>
        <span className={`font-mono text-[11px] ${over ? "text-[var(--danger)]" : "text-[var(--subtle)]"}`}>
          {limit != null ? `${value.length} / ${limit}` : `${value.split(/\s+/).filter(Boolean).length} words`}
        </span>
        <CopyButton text={value} small />
      </div>
      <pre className={`max-h-[46vh] overflow-auto whitespace-pre-wrap px-4 py-3 leading-relaxed ${mono ? "font-mono text-[11.5px] text-[var(--muted)]" : "text-[13.5px]"}`}>
        {value}
      </pre>
    </div>
  );
}

export function CategoryReview({ page: p }: { page: CategoryPageDetailVM }) {
  const [tab, setTab] = useState<Tab>("read");
  const [fixOpen, setFixOpen] = useState(false);
  const [details, setDetails] = useState(false);

  // Highlight → fix this passage
  const readRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<{ text: string; top: number; left: number } | null>(null);
  const [passage, setPassage] = useState<string | null>(null);
  const [passageResult, passageAction, passagePending] = useActionState<PassageFixResult, FormData>(
    fixPassageCategoryAction,
    null,
  );
  // The result we'd already seen when the panel was opened — so a fresh success
  // closes the panel, but a stale one from an earlier fix doesn't. (Derived, no effect.)
  const [seenResult, setSeenResult] = useState<PassageFixResult>(null);
  const freshResult = passageResult !== seenResult ? passageResult : null;
  const panelOpen = passage != null && !freshResult?.ok;

  // Edit tab
  const [editResult, editAction, editPending] = useActionState<PassageFixResult, FormData>(saveCategoryEditsAction, null);

  function onMouseUp() {
    const s = window.getSelection();
    const text = s?.toString().trim() ?? "";
    if (!s || text.length < 4 || !readRef.current) {
      setSel(null);
      return;
    }
    const range = s.getRangeAt(0);
    if (!readRef.current.contains(range.commonAncestorContainer)) {
      setSel(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    const host = readRef.current.getBoundingClientRect();
    setSel({ text, top: rect.top - host.top - 44, left: Math.max(0, rect.left - host.left) });
  }

  const hasDraft = Boolean(p.bodyHtml);
  const drafting = p.status === "DRAFTING";
  const issueCount = p.factIssues.length + (p.overall != null && p.overall < p.threshold ? 1 : 0);
  const btn = "flex h-[46px] items-center gap-2 rounded-full px-6 text-[14px] font-semibold";
  const quiet = "flex h-[44px] items-center gap-1.5 text-[13px] text-[var(--muted)] hover:text-[var(--text)]";
  const tabBtn = (t: Tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(t)}
      className={`h-9 rounded-full px-3.5 text-[13px] font-medium ${
        tab === t ? "bg-[var(--surface-2)] text-[var(--text)]" : "text-[var(--muted)] hover:text-[var(--text)]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="relative -m-6 flex h-[calc(100vh-49px)] flex-col">
      <style>{READ_CSS}</style>

      {/* Scrolling body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-6">
        <div className="mx-auto flex max-w-[720px] flex-col gap-[18px] pb-8">
          {/* Step header */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-[12px] text-[var(--muted)]">
              <Link href="/categories" className="flex items-center gap-1.5 hover:text-[var(--text)]">
                <ArrowLeft size={13} /> {p.liveTitle ?? p.handle}
              </Link>
              <div>
                <span className="font-medium text-[var(--text)]">Step 1 of 3</span> · Review
              </div>
            </div>
            <Steps step={1} pasteHref={hasDraft && !drafting ? `/categories/${p.id}/paste` : null} />
          </div>

          {/* Status line */}
          {drafting && (
            <div className="flex items-center gap-2.5 text-[13px] text-[var(--muted)]">
              <Loader2 size={16} className="animate-spin text-[var(--accent)]" />
              Writing — live catalog, plan, draft, editor pass, fact-check, grade. Usually 2–4 minutes. This page updates itself.
            </div>
          )}
          {!drafting && p.status === "NOT_STARTED" && <div className="text-[13px] text-[var(--muted)]">Nothing written yet.</div>}
          {!drafting && p.status === "DRAFT_READY" && (
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[13px] text-[var(--muted)]">
              <span className="flex items-center gap-1.5 rounded-full bg-[var(--success-bg)] px-[11px] py-[5px] text-[12px] font-semibold text-[var(--success)]">
                <Check size={13} strokeWidth={2.5} /> Score {p.overall}
              </span>
              {p.words != null && <span>{p.words.toLocaleString()} words</span>}
              <span>·</span>
              <span>Every price checked against the catalog</span>
              {p.links && (
                <>
                  <span>·</span>
                  <span>
                    {p.links.internal} internal · {p.links.external} authority links
                  </span>
                </>
              )}
            </div>
          )}
          {!drafting && p.status === "NEEDS_FIX" && (
            <div className="rounded-xl border border-[var(--warn)] bg-[var(--warn-bg)] px-5 py-4">
              <div className="flex items-center gap-2 text-[14px] font-semibold text-[var(--warn)]">
                <AlertTriangle size={16} />
                {p.draftFailed ? "The last redraft hit an error" : `Needs ${issueCount} fix${issueCount === 1 ? "" : "es"}`}
                {p.overall != null && !p.draftFailed && (
                  <span className="font-normal opacity-80">
                    · score {p.overall} of {p.threshold}
                  </span>
                )}
              </div>
              {p.draftFailed ? (
                <p className="mt-1.5 text-[13px] text-[var(--warn)]">
                  Nothing was lost — the previous draft is still below. Press <span className="font-semibold">Fix these</span> to run it again.
                </p>
              ) : (
                <ul className="mt-2 list-disc pl-5 text-[13px] leading-relaxed text-[var(--warn)]">
                  {p.factIssues.slice(0, 4).map((i, k) => (
                    <li key={k}>{i}</li>
                  ))}
                  {p.overall != null && p.overall < p.threshold && p.gradeNotes && <li>{p.gradeNotes.split(/(?<=[.;])\s+/)[0]}</li>}
                </ul>
              )}
            </div>
          )}
          {!drafting && p.status === "LIVE" && (
            <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-[var(--muted)]">
              <span className="flex items-center gap-1.5 rounded-full bg-[var(--success-bg)] px-[11px] py-[5px] text-[12px] font-semibold text-[var(--success)]">
                <Check size={13} strokeWidth={2.5} /> Live
              </span>
              <span>since {p.liveAt ? new Date(p.liveAt).toLocaleDateString() : "—"}</span>
              <span>·</span>
              <span>refresh due {p.refreshDueAt ? new Date(p.refreshDueAt).toLocaleDateString() : "—"}</span>
              {p.drifted && (
                <span className="rounded-full bg-[var(--warn-bg)] px-[10px] py-[4px] text-[12px] font-medium text-[var(--warn)]">
                  draft changed since it was pasted
                </span>
              )}
            </div>
          )}
          {!drafting && p.status === "NEEDS_REFRESH" && (
            <div className="flex items-center gap-2 text-[13px] text-[var(--danger)]">
              <Clock size={15} /> Due for a refresh — redraft to re-sync prices, then paste the changed blocks.
            </div>
          )}

          {/* Tabs */}
          {hasDraft && (
            <div className="flex items-center gap-1 border-b border-[var(--border)] pb-2">
              {tabBtn("read", "Read")}
              {p.draft && tabBtn("edit", "Edit")}
              {tabBtn("score", "Score")}
              {tabBtn("html", "HTML")}
              {tabBtn("text", "Text")}
              {tab === "read" && (
                <span className="ml-auto flex items-center gap-1.5 text-[11.5px] text-[var(--subtle)]">
                  <Highlighter size={12} /> Highlight any text to fix just that part
                </span>
              )}
            </div>
          )}

          {/* READ */}
          {hasDraft && tab === "read" && (
            <div ref={readRef} onMouseUp={onMouseUp} className="relative rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-12 py-10">
              {sel && !panelOpen && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setPassage(sel.text);
                    setSeenResult(passageResult);
                    setSel(null);
                    window.getSelection()?.removeAllRanges();
                  }}
                  style={{ top: sel.top, left: sel.left }}
                  className="absolute z-10 flex h-9 items-center gap-1.5 rounded-full bg-[var(--accent)] px-3.5 text-[12.5px] font-semibold text-white shadow-lg hover:opacity-90"
                >
                  <Wand2 size={13} /> Fix this
                </button>
              )}
              <h1 className="text-[26px] font-semibold leading-tight tracking-tight">{p.h1}</h1>
              <p className="mt-5 max-w-[62ch] text-[15.5px] leading-[1.65] text-[var(--text)]">{p.intro}</p>
              <div className="mt-6 flex h-16 items-center justify-center rounded-lg border border-dashed border-[var(--border-strong)] text-[12px] tracking-wider text-[var(--subtle)]">
                PRODUCT GRID{p.productCount != null ? ` — ${p.productCount} products` : ""}
              </div>
              <div className="cat-read mt-2" dangerouslySetInnerHTML={{ __html: p.bodyHtml ?? "" }} />
            </div>
          )}

          {/* Passage fix panel */}
          {panelOpen && (
            <div className="rounded-xl border border-[var(--accent)] bg-[var(--surface-1)] p-5">
              <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                <Highlighter size={13} /> Fix this passage
              </div>
              <blockquote className="mb-3 max-h-24 overflow-y-auto rounded-lg border-l-2 border-[var(--accent)] bg-[var(--surface-2)] px-3.5 py-2.5 text-[13px] leading-relaxed text-[var(--muted)]">
                “{passage}”
              </blockquote>
              <form action={passageAction} className="flex flex-col gap-3">
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="selectedText" value={passage} />
                <textarea
                  name="instruction"
                  rows={2}
                  required
                  autoFocus
                  placeholder="What should change here? e.g. ‘shorter’, ‘drop the veneer mention’, ‘say this in plain English’"
                  className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-0)] px-3.5 py-3 text-[14px]"
                />
                <div className="flex flex-wrap items-center gap-4">
                  <button type="submit" disabled={passagePending} className={`${btn} bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-60`}>
                    {passagePending ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
                    {passagePending ? "Rewriting…" : "Rewrite this passage"}
                  </button>
                  <span className="text-[12px] text-[var(--subtle)]">Only this passage changes. About 30 seconds.</span>
                  <button type="button" onClick={() => setPassage(null)} className="ml-auto text-[13px] text-[var(--muted)] hover:text-[var(--text)]">
                    Cancel
                  </button>
                </div>
              </form>
              {freshResult && !freshResult.ok && (
                <p className="mt-3 text-[13px] text-[var(--warn)]">{freshResult.message}</p>
              )}
            </div>
          )}
          {freshResult?.ok && (
            <div className="flex items-center gap-2 rounded-xl border border-[var(--success)] bg-[var(--success-bg)] px-4 py-3 text-[13px] text-[var(--success)]">
              <Check size={15} strokeWidth={2.5} /> {freshResult.message}
            </div>
          )}

          {/* EDIT */}
          {hasDraft && tab === "edit" && p.draft && (
            <form action={editAction} className="flex flex-col gap-5 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-6 py-6">
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="sectionCount" value={p.draft.sections.length} />
              <input type="hidden" name="faqCount" value={p.draft.faqs.length} />
              <p className="text-[13px] text-[var(--muted)]">
                Change any text here, then <span className="font-medium text-[var(--text)]">Save &amp; update</span>. The HTML is rebuilt from what you wrote, every
                number is re-checked against the catalog, and it’s re-graded. Sections and “Why us” are Markdown — links stay in{" "}
                <span className="font-mono text-[12px]">[text](url)</span> form.
              </p>
              <Field label="Collection title (H1)" name="h1" value={p.draft.h1} limit={70} />
              <Field label="Intro — above the grid" name="intro" value={p.draft.intro} rows={4} />
              {p.draft.sections.map((s, i) => (
                <div key={i} className="flex flex-col gap-2.5 border-t border-[var(--border)] pt-4">
                  <Field label={`Section ${i + 1} — heading`} name={`section_heading_${i}`} value={s.heading} />
                  <Field label="Body (Markdown)" name={`section_body_${i}`} value={s.bodyMarkdown} rows={Math.min(14, Math.max(4, Math.ceil(s.bodyMarkdown.length / 90)))} mono />
                </div>
              ))}
              <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-4">
                <div className="text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)]">FAQ</div>
                {p.draft.faqs.map((f, i) => (
                  <div key={i} className="flex flex-col gap-2 rounded-lg bg-[var(--surface-2)] p-3.5">
                    <Field label={`Question ${i + 1}`} name={`faq_q_${i}`} value={f.question} />
                    <Field label="Answer" name={`faq_a_${i}`} value={f.answer} rows={3} />
                  </div>
                ))}
              </div>
              <div className="border-t border-[var(--border)] pt-4">
                <Field label="Why us (Markdown)" name="whyUs" value={p.draft.whyUs} rows={5} mono />
              </div>
              <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-4">
                <Field label="SEO title" name="seoTitle" value={p.draft.seoTitle} limit={60} />
                <Field label="Meta description" name="metaDescription" value={p.draft.metaDescription} rows={2} limit={155} />
              </div>
              <div className="flex flex-wrap items-center gap-4 border-t border-[var(--border)] pt-4">
                <button type="submit" disabled={editPending} className={`${btn} bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-60`}>
                  {editPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={2.5} />}
                  {editPending ? "Rebuilding & grading…" : "Save & update"}
                </button>
                <span className="text-[12px] text-[var(--subtle)]">About 20 seconds — it re-grades so the score stays honest.</span>
                {editResult && (
                  <span className={`text-[13px] ${editResult.ok ? "text-[var(--success)]" : "text-[var(--warn)]"}`}>{editResult.message}</span>
                )}
              </div>
            </form>
          )}

          {/* SCORE */}
          {hasDraft && tab === "score" && (
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-6 py-5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className={`text-[44px] font-semibold leading-none tracking-tight ${p.overall != null && p.overall >= p.threshold ? "text-[var(--success)]" : "text-[var(--warn)]"}`}>
                    {p.overall ?? "—"}
                  </span>
                  <span className="text-[13px] text-[var(--muted)]">
                    / 100 · {p.overall != null && p.overall >= p.threshold ? "passed" : "below"} threshold ({p.threshold}) · loop {p.loops} · cost{" "}
                    <span className="font-medium text-[var(--text)]">${(p.costCents / 100).toFixed(2)}</span>
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 text-[12.5px] text-[var(--muted)]">
                  {p.words != null && <span>{p.words.toLocaleString()} words</span>}
                  {p.links && (
                    <span>
                      · {p.links.internal} internal · {p.links.external} authority links
                    </span>
                  )}
                  <span className={p.factIssues.length ? "text-[var(--warn)]" : "text-[var(--success)]"}>
                    · {p.factIssues.length ? `${p.factIssues.length} fact-check issue${p.factIssues.length === 1 ? "" : "s"}` : "fact-check passed"}
                  </span>
                </div>
              </div>

              {p.gradeDimensions.length > 0 && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-6 py-2">
                  {p.gradeDimensions.map((d) => {
                    const pct = d.max ? d.score / d.max : 0;
                    return (
                      <div key={d.key} className="grid grid-cols-[170px_minmax(0,1fr)] gap-x-5 border-b border-[var(--border)] py-4 last:border-b-0">
                        <div className="text-[13px] text-[var(--text)]">{d.label}</div>
                        <div>
                          <div className="flex items-center gap-3">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                              <div className={`h-full rounded-full ${pct >= 0.85 ? "bg-[var(--success)]" : pct >= 0.6 ? "bg-[var(--warn)]" : "bg-[var(--danger)]"}`} style={{ width: `${Math.round(pct * 100)}%` }} />
                            </div>
                            <span className="w-10 text-right font-mono text-[12px] text-[var(--muted)]">
                              {d.score}/{d.max}
                            </span>
                          </div>
                          {d.note && <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--muted)]">{d.note}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {p.factIssues.length > 0 && (
                <div className="rounded-xl border border-[var(--warn)] bg-[var(--warn-bg)] px-5 py-4 text-[13px] text-[var(--warn)]">
                  <div className="mb-1 font-semibold">Fact-check</div>
                  <ul className="list-disc pl-5 leading-relaxed">
                    {p.factIssues.map((i, k) => (
                      <li key={k}>{i}</li>
                    ))}
                  </ul>
                </div>
              )}

              {p.gradeNotes && !p.draftFailed && (
                <div className="flex gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-5 py-4 text-[13.5px] leading-relaxed">
                  <span className="shrink-0 font-semibold">Notes:</span>
                  <p className="text-[var(--muted)]">{p.gradeNotes}</p>
                </div>
              )}
            </div>
          )}

          {/* HTML */}
          {hasDraft && tab === "html" && (
            <div className="flex flex-col gap-3">
              <CopyBlock label="Collection title (H1)" value={p.h1 ?? ""} limit={70} />
              <CopyBlock label="Intro — above the grid" value={p.intro ?? ""} />
              <CopyBlock label="Long-form — below the grid (HTML)" value={p.bodyHtml ?? ""} mono />
              <CopyBlock label="SEO title" value={p.seoTitle ?? ""} limit={60} />
              <CopyBlock label="Meta description" value={p.metaDescription ?? ""} limit={155} />
              <CopyBlock label="FAQ schema (JSON-LD, optional)" value={p.faqJsonLd ?? ""} mono />
            </div>
          )}

          {/* TEXT */}
          {hasDraft && tab === "text" && (
            <div className="flex flex-col gap-3">
              <CopyBlock label="Collection title (H1)" value={p.h1 ?? ""} limit={70} />
              <CopyBlock label="Intro — above the grid" value={p.intro ?? ""} />
              <CopyBlock label="Long-form — below the grid (plain text)" value={p.bodyText ?? ""} />
              <CopyBlock label="SEO title" value={p.seoTitle ?? ""} limit={60} />
              <CopyBlock label="Meta description" value={p.metaDescription ?? ""} limit={155} />
            </div>
          )}

          {!hasDraft && !drafting && (
            <div className="rounded-xl border border-dashed border-[var(--border-strong)] px-6 py-16 text-center text-[13px] text-[var(--muted)]">
              Drafting pulls this collection’s live products and prices, plans the page for its keyword, writes it, tightens it,
              checks every number against the catalog, and grades it.
            </div>
          )}

          {/* Fix with a note (whole page) */}
          {fixOpen && hasDraft && !drafting && (
            <div className="rounded-xl border border-[var(--accent)] bg-[var(--surface-1)] p-5">
              <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                <Wand2 size={13} /> Fix with a note
              </div>
              <p className="mb-3 text-[13px] text-[var(--muted)]">
                For changes across the whole page. It redrafts now. Tick “remember” and the rule applies to every future category page and blog.
                (To change one spot, highlight it on the Read tab instead.)
              </p>
              <form action={fixCategoryAction} className="flex flex-col gap-3">
                <input type="hidden" name="id" value={p.id} />
                <textarea
                  name="note"
                  rows={3}
                  required
                  autoFocus
                  placeholder="e.g. ‘lead with oversized widths’, ‘don’t mention veneer’, ‘shorter FAQ answers’"
                  className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-0)] px-3.5 py-3 text-[14px]"
                />
                <div className="flex flex-wrap items-center gap-4">
                  <SubmitButton icon={<Wand2 size={14} />} pendingLabel="Starting…" className={`${btn} bg-[var(--accent)] text-white hover:opacity-90`}>
                    Fix &amp; redraft
                  </SubmitButton>
                  <label className="flex items-center gap-2 text-[13px] text-[var(--muted)]">
                    <input type="checkbox" name="remember" className="h-4 w-4" /> Remember this for every page
                  </label>
                  <button type="button" onClick={() => setFixOpen(false)} className="ml-auto text-[13px] text-[var(--muted)] hover:text-[var(--text)]">
                    Cancel
                  </button>
                </div>
              </form>
              {p.fixNotes.length > 0 && (
                <ul className="mt-3 list-disc pl-5 text-[12.5px] text-[var(--muted)]">
                  {p.fixNotes.map((n, k) => (
                    <li key={k}>{n}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action bar — never scrolls away */}
      <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface-1)] px-6 py-4">
        <div className="mx-auto flex max-w-[720px] items-center justify-between gap-4">
          <div className="flex items-center gap-[22px]">
            {hasDraft && !drafting && p.status !== "LIVE" && (
              <button type="button" onClick={() => setFixOpen((v) => !v)} className={quiet}>
                <Wand2 size={14} /> Fix with a note
              </button>
            )}
            {(hasDraft || p.brief) && (
              <button type="button" onClick={() => setDetails(true)} className={quiet}>
                <Info size={14} /> Details
              </button>
            )}
            {p.status === "LIVE" && (
              <a href={p.url} target="_blank" rel="noreferrer" className={quiet}>
                <ExternalLink size={14} /> View live page
              </a>
            )}
          </div>
          <div className="flex items-center gap-4">
            {hasDraft && !drafting && p.status !== "DRAFT_READY" && (
              <Link href={`/categories/${p.id}/paste`} className="flex h-[44px] items-center gap-1 text-[13px] text-[var(--muted)] hover:text-[var(--text)]">
                {p.status === "NEEDS_FIX" ? "Paste anyway" : "Go to paste"} <ArrowRight size={13} />
              </Link>
            )}
            {p.status === "DRAFT_READY" && (
              <Link href={`/categories/${p.id}/paste`} className={`${btn} bg-[var(--success)] text-white hover:brightness-110`}>
                Looks good — paste it <ArrowRight size={15} />
              </Link>
            )}
            {p.status === "NEEDS_FIX" && (
              <form action={autoFixCategoryAction}>
                <input type="hidden" name="id" value={p.id} />
                <SubmitButton icon={<Wand2 size={15} />} pendingLabel="Starting…" className={`${btn} bg-[var(--accent)] text-white hover:opacity-90`}>
                  {p.draftFailed ? "Try again" : "Fix these"}
                </SubmitButton>
              </form>
            )}
            {(p.status === "NOT_STARTED" || p.status === "NEEDS_REFRESH") && (
              <form action={draftCategoryAction}>
                <input type="hidden" name="id" value={p.id} />
                <SubmitButton icon={<Sparkles size={15} />} pendingLabel="Starting…" className={`${btn} bg-[var(--accent)] text-white hover:opacity-90`}>
                  {p.status === "NEEDS_REFRESH" ? "Refresh this page" : "Draft this page"}
                </SubmitButton>
              </form>
            )}
            {p.status === "LIVE" && (
              <form action={markCategoryRefreshAction}>
                <input type="hidden" name="id" value={p.id} />
                <SubmitButton icon={<Clock size={14} />} className={`${btn} border border-[var(--border-strong)] text-[var(--muted)] hover:bg-[var(--surface-2)]`}>
                  Flag for refresh
                </SubmitButton>
              </form>
            )}
            {drafting && (
              <div className={`${btn} border border-[var(--accent)] text-[var(--accent)]`}>
                <Loader2 size={15} className="animate-spin" /> Writing…
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Details drawer — facts, plan, strategy */}
      {details && (
        <div className="absolute inset-0 z-20 flex justify-end bg-black/40" onClick={() => setDetails(false)}>
          <div className="flex h-full w-[400px] flex-col overflow-y-auto border-l border-[var(--border)] bg-[var(--surface-1)] p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <div className="text-[15px] font-semibold">Details</div>
              <button type="button" onClick={() => setDetails(false)} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[var(--surface-2)]" aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="flex flex-col gap-6 text-[13px]">
              {p.facts && (
                <section>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Live catalog</div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    <dt className="text-[var(--muted)]">Products</dt>
                    <dd>{p.facts.productCount}</dd>
                    <dt className="text-[var(--muted)]">Prices</dt>
                    <dd>
                      {money(p.facts.priceMin)} – {money(p.facts.priceMax)}
                    </dd>
                    {p.facts.gauges.length > 0 && (
                      <>
                        <dt className="text-[var(--muted)]">Gauges</dt>
                        <dd>{p.facts.gauges.join(", ")}</dd>
                      </>
                    )}
                    {p.facts.widths.length > 0 && (
                      <>
                        <dt className="text-[var(--muted)]">Widths</dt>
                        <dd>{p.facts.widths.join(", ")}</dd>
                      </>
                    )}
                    {p.facts.materials.length > 0 && (
                      <>
                        <dt className="text-[var(--muted)]">Materials</dt>
                        <dd>{p.facts.materials.slice(0, 8).join(", ")}</dd>
                      </>
                    )}
                  </dl>
                  <p className="mt-1.5 text-[11px] text-[var(--subtle)]">Pulled {new Date(p.facts.fetchedAt).toLocaleString()}</p>
                  {!p.hasPolicies && (
                    <p className="mt-2 text-[12px] text-[var(--subtle)]">No shipping/returns policy page was readable on the site, so the copy avoids shipping specifics.</p>
                  )}
                </section>
              )}

              {p.brief && (
                <section>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Plan</div>
                  <p className="leading-relaxed">{p.brief.angle}</p>
                  {p.brief.keywordVolumes.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-0.5 text-[12.5px] text-[var(--muted)]">
                      {p.brief.keywordVolumes.map((k) => (
                        <li key={k.keyword} className="flex justify-between gap-2">
                          <span>{k.keyword}</span>
                          <span className="font-mono">{k.volume == null ? "—" : `${k.volume.toLocaleString()}/mo`}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <ol className="mt-2 list-decimal pl-5 text-[12.5px] text-[var(--muted)]">
                    {p.brief.sections.map((s) => (
                      <li key={s.heading}>{s.heading}</li>
                    ))}
                  </ol>
                  {p.brief.competitorUrls.length > 0 && (
                    <p className="mt-2 text-[11.5px] text-[var(--subtle)]">
                      Benchmarked against {p.brief.competitorUrls.length} competitor category page{p.brief.competitorUrls.length === 1 ? "" : "s"}.
                    </p>
                  )}
                </section>
              )}

              <section>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Strategy</div>
                <form action={setCategoryStrategyAction} className="flex flex-col gap-2.5">
                  <input type="hidden" name="id" value={p.id} />
                  <label className="text-[12px] text-[var(--muted)]">
                    Target keyword
                    <input name="targetKeyword" defaultValue={p.targetKeyword ?? ""} className="mt-1 h-9 w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface-0)] px-2.5 text-[13px]" />
                  </label>
                  <label className="text-[12px] text-[var(--muted)]">
                    Depth
                    <select name="tier" defaultValue={p.tier} className="mt-1 h-9 w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface-0)] px-2.5 text-[13px]">
                      <option value={1}>Hub · 1,500–2,000 words</option>
                      <option value={2}>Sub-collection · 800–1,200</option>
                      <option value={3}>State / colour · 300–500</option>
                    </select>
                  </label>
                  <SubmitButton className="h-9 rounded-md border border-[var(--border-strong)] px-3 text-[12px] hover:bg-[var(--surface-2)]">Save</SubmitButton>
                </form>
              </section>

              {p.fixNotes.length > 0 && (
                <section>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Fixes applied</div>
                  <ul className="list-disc pl-5 text-[12.5px] text-[var(--muted)]">
                    {p.fixNotes.map((n, k) => (
                      <li key={k}>{n}</li>
                    ))}
                  </ul>
                </section>
              )}

              {(hasDraft || p.status === "LIVE") && !drafting && (
                <section className="flex flex-col gap-2 border-t border-[var(--border)] pt-4">
                  {p.status !== "LIVE" && (
                    <form action={draftCategoryAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <SubmitButton icon={<Sparkles size={13} />} pendingLabel="Starting…" className="flex h-10 items-center gap-1.5 text-[13px] text-[var(--muted)] hover:text-[var(--text)]">
                        Redraft from scratch
                      </SubmitButton>
                    </form>
                  )}
                  {p.status === "LIVE" && (
                    <form action={markCategoryNotLiveAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <SubmitButton icon={<Undo2 size={13} />} className="flex h-10 items-center gap-1.5 text-[13px] text-[var(--muted)] hover:text-[var(--text)]">
                        Mark as not live
                      </SubmitButton>
                    </form>
                  )}
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
