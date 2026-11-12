"use client";

import { useState } from "react";
import { Check, ClipboardCopy, Download, Loader2, Package, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { CopyPackage } from "@/lib/pipeline/copy-package";

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => {});
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="flex shrink-0 items-center gap-1 rounded-md border border-[var(--border-strong)] px-2 py-1 text-[11px] text-[var(--muted)] hover:bg-[var(--surface-2)]"
    >
      {done ? <Check size={11} className="text-[var(--success)]" /> : <ClipboardCopy size={11} />}
      {done ? "Copied" : label}
    </button>
  );
}

function Field({ label, value, hint, mono }: { label: string; value: string; hint?: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--subtle)]">{label}</span>
        {hint && <span className="text-[11px] text-[var(--muted)]">{hint}</span>}
        <span className="ml-auto">
          <CopyButton text={value} />
        </span>
      </div>
      <div
        className={`max-h-40 overflow-auto whitespace-pre-wrap break-words text-[12.5px] ${mono ? "font-mono text-[11.5px]" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

/** Everything needed to publish this blog by hand in Shopify. */
export function CopyPackagePanel({ draftId }: { draftId: string }) {
  const [pkg, setPkg] = useState<CopyPackage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(refreshSeo = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/review/copy-package?draftId=${encodeURIComponent(draftId)}${refreshSeo ? "&refreshSeo=1" : ""}`);
      const data = (await res.json()) as CopyPackage & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setPkg(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the copy package");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <Package size={15} className="text-[var(--accent)]" />
        <span className="text-[14px] font-medium">Copy package</span>
        <span className="text-[12px] text-[var(--muted)]">Everything to paste into Shopify by hand.</span>
        <span className="ml-auto flex items-center gap-2">
          {pkg && (
            <button
              type="button"
              onClick={() => load(true)}
              disabled={loading}
              title="Write the SEO title and meta description again"
              className="flex items-center gap-1 rounded-md border border-[var(--border-strong)] px-2 py-1 text-[11px] text-[var(--muted)] hover:bg-[var(--surface-2)] disabled:opacity-60"
            >
              <RefreshCw size={11} /> New SEO title &amp; description
            </button>
          )}
          {!pkg && (
            <button
              type="button"
              onClick={() => load(false)}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-110 disabled:opacity-60"
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : <Package size={13} />}
              {loading ? "Preparing…" : "Show copy package"}
            </button>
          )}
        </span>
      </div>
      {error && <p className="mt-2 text-[12px] text-[var(--danger)]">{error}</p>}

      {pkg && (
        <div className="mt-3 space-y-2.5">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {pkg.checks.map((c) => (
              <span key={c.label} className={`flex items-center gap-1 text-[11.5px] ${c.ok ? "text-[var(--success)]" : "text-[var(--warn)]"}`}>
                {c.ok ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                {c.label}
              </span>
            ))}
          </div>

          {pkg.flags.length > 0 && (
            <div className="rounded-lg border border-[var(--warn)] p-2.5 text-[12px]">
              <div className="mb-1 flex items-center gap-1.5 font-medium text-[var(--warn)]">
                <AlertTriangle size={13} /> Check these lines: they may describe an invented person, quote or story, or break a store rule
              </div>
              <ul className="space-y-1 text-[var(--muted)]">
                {pkg.flags.map((f) => (
                  <li key={f.line}>
                    “{f.line}” <span className="text-[var(--subtle)]">({f.why})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-2.5 md:grid-cols-2">
            <Field label="Title" value={pkg.title} />
            <Field label="URL handle" value={pkg.handle} mono />
            <Field label="SEO title" value={pkg.seoTitle} hint={`${pkg.seoTitle.length}/60`} />
            <Field label="Meta description" value={pkg.metaDescription} hint={`${pkg.metaDescription.length} chars (150–160)`} />
            <Field label="In this guide" value={pkg.toc.map((t, i) => `${i + 1}. ${t}`).join("\n")} />
            <Field label="What to know first" value={pkg.takeaways.map((t) => `• ${t}`).join("\n")} />
          </div>

          <Field label="Body HTML" value={pkg.bodyHtml} hint="no H1, no guide boxes, no schema" mono />

          <div className="grid gap-2.5 md:grid-cols-2">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-[12.5px]">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--subtle)]">Byline</div>
              {pkg.byline.authors.length > 0 && (
                <div className="mb-1 flex flex-wrap gap-1.5">
                  {pkg.byline.authors.map((a) => (
                    <span key={a} className="rounded-full bg-[var(--surface-1)] px-2 py-0.5 text-[12px]">
                      {a}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-[11.5px] text-[var(--muted)]">{pkg.byline.note}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-[12.5px]">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--subtle)]">Hero image</div>
              {pkg.hasHero ? (
                <a
                  href={`/api/review/hero-webp?draftId=${encodeURIComponent(pkg.draftId)}`}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-2.5 py-1 text-[12px] font-medium text-white hover:brightness-110"
                >
                  <Download size={12} /> Download WebP (1200px, under 200 KB)
                </a>
              ) : (
                <p className="text-[11.5px] text-[var(--muted)]">
                  No hero image on this blog (image generation is off). Upload one below, or add it in Shopify.
                </p>
              )}
            </div>
          </div>

          <details className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
            <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-[var(--subtle)]">
              Schema (optional, kept out of the body)
            </summary>
            <div className="mt-2">
              <Field label="JSON-LD" value={pkg.schemaJsonLd} mono />
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
