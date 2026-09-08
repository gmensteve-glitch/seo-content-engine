"use client";

import { useState } from "react";
import { Copy, Check, Code2, Eye } from "lucide-react";

type Block = {
  key: string;
  label: string;
  hint: string;
  value: string;
  limit?: number; // character limit shown against the count
  html?: boolean; // offers a rendered preview
  mono?: boolean;
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {
      /* clipboard blocked — the text is selectable below */
    }
  }
  return (
    <button
      onClick={copy}
      type="button"
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium ${
        done
          ? "bg-[var(--success-bg)] text-[var(--success)]"
          : "bg-[var(--accent)] text-white hover:opacity-90"
      }`}
      title={`Copy ${label}`}
    >
      {done ? <Check size={13} /> : <Copy size={13} />} {done ? "Copied" : "Copy"}
    </button>
  );
}

function BlockCard({ b }: { b: Block }) {
  const [preview, setPreview] = useState(false);
  const chars = b.value.length;
  const words = b.value.trim().split(/\s+/).filter(Boolean).length;
  const over = b.limit != null && chars > b.limit;
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium">{b.label}</div>
          <div className="text-[11px] text-[var(--muted)]">{b.hint}</div>
        </div>
        <span
          className={`font-mono text-[11px] ${over ? "text-[var(--danger)]" : "text-[var(--subtle)]"}`}
          title="characters · words"
        >
          {chars}
          {b.limit != null ? `/${b.limit}` : ""} ch · {words} w
        </span>
        {b.html && (
          <button
            type="button"
            onClick={() => setPreview((p) => !p)}
            className="flex items-center gap-1.5 rounded-md border border-[var(--border-strong)] px-2.5 py-1 text-[12px] text-[var(--muted)] hover:bg-[var(--surface-2)]"
          >
            {preview ? <Code2 size={13} /> : <Eye size={13} />} {preview ? "HTML" : "Preview"}
          </button>
        )}
        <CopyButton text={b.value} label={b.label} />
      </div>
      {b.html && preview ? (
        <div
          className="category-preview max-h-[60vh] overflow-y-auto px-5 py-4 text-[14px] leading-relaxed"
          dangerouslySetInnerHTML={{ __html: b.value }}
        />
      ) : (
        <pre
          className={`max-h-[50vh] overflow-auto whitespace-pre-wrap px-4 py-3 text-[13px] leading-relaxed ${
            b.mono ? "font-mono text-[12px]" : ""
          }`}
        >
          {b.value}
        </pre>
      )}
    </div>
  );
}

export function CategoryPasteView({
  h1,
  intro,
  bodyHtml,
  seoTitle,
  metaDescription,
  faqJsonLd,
}: {
  h1: string;
  intro: string;
  bodyHtml: string;
  seoTitle: string;
  metaDescription: string;
  faqJsonLd: string;
}) {
  const blocks: Block[] = [
    {
      key: "h1",
      label: "1 · Collection title (H1)",
      hint: "Shopify → Products → Collections → Title. Replaces “Products”.",
      value: h1,
      limit: 70,
    },
    {
      key: "intro",
      label: "2 · Intro — above the product grid",
      hint: "Paste into the collection Description.",
      value: intro,
    },
    {
      key: "body",
      label: "3 · Long-form — below the product grid",
      hint: "Paste the HTML into the below-grid section (metafield or Custom Liquid). Use Preview to read it.",
      value: bodyHtml,
      html: true,
      mono: true,
    },
    {
      key: "seoTitle",
      label: "4 · SEO title",
      hint: "Search engine listing → Page title.",
      value: seoTitle,
      limit: 60,
    },
    {
      key: "meta",
      label: "5 · Meta description",
      hint: "Search engine listing → Description.",
      value: metaDescription,
      limit: 155,
    },
    {
      key: "faq",
      label: "6 · FAQ schema (optional)",
      hint: "JSON-LD for the theme’s <script type=\"application/ld+json\">. The visible FAQ is already in block 3.",
      value: faqJsonLd,
      mono: true,
    },
  ];
  return (
    <div className="space-y-3">
      <style>{`
        .category-preview h2 { font-size: 17px; font-weight: 600; margin: 18px 0 8px; }
        .category-preview h3 { font-size: 14.5px; font-weight: 600; margin: 14px 0 6px; }
        .category-preview p { margin: 0 0 10px; }
        .category-preview ul, .category-preview ol { margin: 0 0 10px 20px; }
        .category-preview li { margin-bottom: 4px; }
        .category-preview a { color: var(--accent); text-decoration: underline; }
        .category-preview table { border-collapse: collapse; width: 100%; margin: 8px 0 14px; font-size: 13px; }
        .category-preview th, .category-preview td { border: 1px solid var(--border); padding: 6px 8px; text-align: left; vertical-align: top; }
        .category-preview th { background: var(--surface-2); }
      `}</style>
      {blocks.map((b) => (
        <BlockCard key={b.key} b={b} />
      ))}
    </div>
  );
}
