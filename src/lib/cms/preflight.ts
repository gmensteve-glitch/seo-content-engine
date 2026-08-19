// Pre-publish buffer. The last gate before anything reaches a CMS: inspect the
// FINAL rendered HTML and refuse to publish if it still contains something that
// would render as garbage or an unfinished artifact. Every guard upstream
// (finalize, the renderer, the link sanitizer, the Shopify script-strip) should
// already prevent these — this is the backstop that guarantees it.

export interface PreflightResult {
  ok: boolean;
  issues: string[];
}

function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

/** Validate the final HTML that is about to be published. */
export function preflightPublish(html: string): PreflightResult {
  const issues: string[] = [];
  const text = visibleText(html);

  // JSON-LD / <script> markup — Shopify renders these as visible text.
  if (/<script|application\/ld\+json|"@context"|"@graph"/i.test(html)) {
    issues.push("schema/script markup left in the body (renders as text on Shopify)");
  }
  // Unrendered markdown tells leaking into the visible text.
  if (/```/.test(text)) issues.push("unrendered code fence (```)");
  if (/\{#[a-z0-9-]+\}/i.test(text)) issues.push("unrendered heading id syntax ({#…})");
  if (/\*\*[^*\n]+\*\*/.test(text)) issues.push("unrendered bold markdown (**…**)");
  if (/\]\((?:https?:\/\/|\/|#)[^)]+\)/.test(text)) issues.push("unrendered markdown link ([text](url))");
  // Leftover template placeholder.
  if (/add your experience/i.test(text)) issues.push("leftover “Add your experience” placeholder");
  // Sanity: it actually rendered to HTML.
  if (!/<(p|h[1-6]|ul|ol|table)\b/i.test(html)) issues.push("body did not render to HTML (looks like raw text)");

  return { ok: issues.length === 0, issues };
}

/** Validate the SEO page title + meta description that will be published. */
export function metaIssues(seoTitle: string, metaDescription: string): string[] {
  const issues: string[] = [];
  if (!seoTitle || !seoTitle.trim()) issues.push("missing SEO page title");
  else if (seoTitle.length > 70) {
    issues.push(`SEO title too long (${seoTitle.length} chars — Google truncates ~60)`);
  }
  if (!metaDescription || !metaDescription.trim()) issues.push("missing meta description");
  else if (metaDescription.length > 160) {
    issues.push(`meta description too long (${metaDescription.length} chars — keep ≤ 160)`);
  }
  return issues;
}
