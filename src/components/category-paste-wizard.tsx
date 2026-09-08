"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Check, ArrowDown, CheckCircle2 } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { markCategoryLiveAction } from "@/app/categories/actions";

type Block = {
  key: string;
  label: string;
  value: string;
  where: string; // where it goes in Shopify
  limit?: number;
  html?: boolean;
  optional?: boolean;
};

function Progress({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {[1, 2, 3].map((s) => (
        <div
          key={s}
          className={`h-1 rounded-full ${
            s < step ? "bg-[var(--success)]" : s === step ? "bg-[var(--accent)]" : "bg-[var(--border)]"
          }`}
        />
      ))}
    </div>
  );
}

const PREVIEW_CSS = `
.paste-preview { font-size: 14px; line-height: 1.6; }
.paste-preview h2 { font-size: 16px; font-weight: 600; margin: 16px 0 6px; }
.paste-preview h3 { font-size: 14px; font-weight: 600; margin: 12px 0 4px; }
.paste-preview p { margin: 0 0 10px; }
.paste-preview ul, .paste-preview ol { margin: 0 0 10px 20px; }
.paste-preview a { color: var(--accent); text-decoration: underline; }
.paste-preview table { border-collapse: collapse; width: 100%; margin: 6px 0 12px; font-size: 13px; }
.paste-preview th, .paste-preview td { border: 1px solid var(--border); padding: 6px 8px; text-align: left; }
.paste-preview th { background: var(--surface-2); }
`;

export function CategoryPasteWizard({
  id,
  title,
  h1,
  intro,
  bodyHtml,
  seoTitle,
  metaDescription,
  faqJsonLd,
}: {
  id: string;
  title: string;
  h1: string;
  intro: string;
  bodyHtml: string;
  seoTitle: string;
  metaDescription: string;
  faqJsonLd: string;
}) {
  const blocks: Block[] = [
    { key: "h1", label: "Collection title", value: h1, where: "Shopify → Products → Collections → open the collection → Title. This replaces “Products”.", limit: 70 },
    { key: "intro", label: "Intro", value: intro, where: "Same page → Description — the text box under the title. Shows above the product grid." },
    { key: "body", label: "Long-form guide", value: bodyHtml, where: "The below-grid section (metafield or Custom Liquid). Paste as HTML.", html: true },
    { key: "seo", label: "SEO title", value: seoTitle, where: "Scroll to Search engine listing → Edit → Page title.", limit: 60 },
    { key: "meta", label: "Meta description", value: metaDescription, where: "Search engine listing → Edit → Description.", limit: 155 },
    { key: "faq", label: "FAQ schema", value: faqJsonLd, where: "Optional. Your theme’s JSON-LD slot. The visible FAQ is already in the guide.", optional: true },
  ];

  const [i, setI] = useState(0);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [showHtml, setShowHtml] = useState(false);
  const finished = i >= blocks.length;
  const b = blocks[Math.min(i, blocks.length - 1)];
  const chars = b.value.length;
  const over = b.limit != null && chars > b.limit;

  async function copy() {
    try {
      await navigator.clipboard.writeText(b.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — text is selectable below */
    }
  }
  function next(mark: boolean) {
    if (mark) setDone((d) => new Set(d).add(b.key));
    setCopied(false);
    setShowHtml(false);
    setI((v) => v + 1);
  }

  const btn = "flex h-[46px] items-center gap-2 rounded-full px-7 text-[14px] font-semibold";

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-[26px] pt-2">
      <style>{PREVIEW_CSS}</style>

      {/* Step header */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-[12px] text-[var(--muted)]">
          <Link href={`/categories/${id}`} className="flex items-center gap-1.5 hover:text-[var(--text)]">
            <ArrowLeft size={13} /> {title}
          </Link>
          <div>
            <span className="font-medium text-[var(--text)]">Step {finished ? "3" : "2"} of 3</span> · {finished ? "Done" : "Paste"}
          </div>
        </div>
        <Progress step={finished ? 3 : 2} />
      </div>

      {finished ? (
        /* ── Done ── */
        <div className="flex flex-col items-center gap-6 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-8 py-10 text-center">
          <CheckCircle2 size={34} className="text-[var(--success)]" />
          <div>
            <div className="text-[24px] font-semibold tracking-tight">All pasted?</div>
            <p className="mt-2 max-w-[400px] text-[14px] leading-relaxed text-[var(--muted)]">
              Marking it live starts the 90-day refresh clock and adds this page to the link map, so new blogs and
              category pages can link to it.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[12px]">
            {blocks.map((x) => (
              <span key={x.key} className={`flex items-center gap-1.5 ${done.has(x.key) ? "text-[var(--success)]" : "text-[var(--subtle)]"}`}>
                {done.has(x.key) ? <Check size={12} strokeWidth={2.5} /> : <span className="h-2 w-2 rounded-full border border-[var(--border-strong)]" />}
                {x.label}
              </span>
            ))}
          </div>
          <form action={markCategoryLiveAction}>
            <input type="hidden" name="id" value={id} />
            <SubmitButton icon={<CheckCircle2 size={16} />} pendingLabel="Saving…" className={`${btn} bg-[var(--success)] text-white hover:brightness-110`}>
              Mark as live
            </SubmitButton>
          </form>
          <button type="button" onClick={() => setI(0)} className="text-[12px] text-[var(--subtle)] hover:text-[var(--text)]">
            Go back through the blocks
          </button>
        </div>
      ) : (
        <>
          {/* Which block */}
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex items-center gap-2">
              {blocks.map((x, k) => (
                <span
                  key={x.key}
                  className={`h-2.5 w-2.5 rounded-full ${
                    k === i
                      ? "bg-[var(--accent)] ring-4 ring-[var(--accent-bg)]"
                      : done.has(x.key)
                        ? "bg-[var(--success)]"
                        : k < i
                          ? "bg-[var(--border-strong)]"
                          : "bg-[var(--border)]"
                  }`}
                />
              ))}
            </div>
            <div className="text-[12px] text-[var(--muted)]">
              Block {i + 1} of {blocks.length}
              {b.optional ? " · optional" : ""}
            </div>
            <div className="text-[24px] font-semibold tracking-tight">{b.label}</div>
          </div>

          {/* The block */}
          <div className="flex flex-col gap-[22px] rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-8 py-7">
            {b.html ? (
              <div className="max-h-[38vh] overflow-y-auto rounded-lg bg-[var(--surface-2)] px-6 py-5">
                {showHtml ? (
                  <pre className="whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-[var(--muted)]">{b.value}</pre>
                ) : (
                  <div className="paste-preview" dangerouslySetInnerHTML={{ __html: b.value }} />
                )}
              </div>
            ) : (
              <div className={`rounded-lg bg-[var(--surface-2)] px-6 py-5 leading-relaxed ${b.key === "faq" ? "max-h-[38vh] overflow-y-auto whitespace-pre-wrap font-mono text-[12px] text-[var(--muted)]" : "text-[17px]"}`}>
                {b.value}
              </div>
            )}
            <div className="flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={copy}
                className={`${btn} ${copied ? "bg-[var(--success)] text-white" : "bg-[var(--accent)] text-white hover:opacity-90"}`}
              >
                {copied ? <Check size={15} strokeWidth={2.5} /> : <Copy size={15} />} {copied ? "Copied" : b.html ? "Copy HTML" : "Copy"}
              </button>
              <div className="flex items-center gap-4 text-[12px]">
                {b.html && (
                  <button type="button" onClick={() => setShowHtml((v) => !v)} className="text-[var(--muted)] hover:text-[var(--text)]">
                    {showHtml ? "Show preview" : "Show HTML"}
                  </button>
                )}
                <span className={`font-mono ${over ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>
                  {b.limit != null ? `${chars} / ${b.limit}` : `${b.value.split(/\s+/).filter(Boolean).length} words`}
                </span>
              </div>
            </div>
          </div>

          {/* Where it goes */}
          <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-[18px] py-3.5 text-[13px] leading-relaxed text-[var(--muted)]">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-bg)] text-[var(--accent)]">
              <ArrowDown size={14} />
            </span>
            <span>{b.where}</span>
          </div>

          {/* Next */}
          <div className="flex flex-col items-center gap-3.5">
            <button type="button" onClick={() => next(true)} className={`${btn} border border-[var(--success)] text-[var(--success)] hover:bg-[var(--success-bg)]`}>
              <Check size={15} strokeWidth={2.5} /> Pasted — next{i + 1 < blocks.length ? `: ${blocks[i + 1].label}` : ""}
            </button>
            <button type="button" onClick={() => next(false)} className="text-[12px] text-[var(--subtle)] hover:text-[var(--text)]">
              Skip this block
            </button>
          </div>

          {/* Quiet checklist */}
          <div className="flex flex-wrap items-center justify-center gap-x-[18px] gap-y-1.5 pt-1 text-[12px] text-[var(--subtle)]">
            {blocks.map((x, k) => (
              <span
                key={x.key}
                className={`flex items-center gap-1.5 ${done.has(x.key) ? "text-[var(--success)]" : k === i ? "font-medium text-[var(--text)]" : ""}`}
              >
                {done.has(x.key) ? (
                  <Check size={12} strokeWidth={2.5} />
                ) : (
                  <span className={`h-2 w-2 rounded-full ${k === i ? "bg-[var(--accent)]" : "border border-[var(--border-strong)]"}`} />
                )}
                {x.label}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
