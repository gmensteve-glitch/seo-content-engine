// Publish-time link guarantee. Every link in a piece is validated before it
// reaches the CMS; anything that doesn't resolve is unlinked (its text is kept)
// so a broken link can NEVER ship. Three kinds:
//   • in-page anchors (#id)  → valid iff a heading with that id exists
//   • internal paths (/...)  → HTTP-checked against the live site
//   • external (http[s]://)  → HTTP-checked as-is
// mailto:/tel: and the like are left alone.

export interface LinkSanitizeReport {
  total: number;
  kept: number;
  unlinked: { href: string; reason: string }[];
}

const CHECK_TIMEOUT_MS = 6000;
const MAX_CONCURRENCY = 8;

async function httpOk(url: string, timeoutMs: number): Promise<boolean> {
  const attempt = async (method: "HEAD" | "GET") => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        redirect: "follow",
        signal: ctrl.signal,
        headers: { "User-Agent": "Mozilla/5.0 (SEO-Content-Engine link check)" },
      });
      return res.status;
    } finally {
      clearTimeout(t);
    }
  };
  try {
    // Some servers reject/!support HEAD — fall back to GET on 405/501 or error.
    let status = await attempt("HEAD").catch(() => 0);
    if (status === 405 || status === 501 || status === 0) {
      status = await attempt("GET").catch(() => 0);
    }
    return status > 0 && status < 400;
  } catch {
    return false;
  }
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Validate every <a href> in the HTML. Returns HTML in which every remaining
 * link resolves; unresolved links are replaced by their inner text.
 */
export async function sanitizeLinks(
  html: string,
  opts: { siteBase: string; timeoutMs?: number },
): Promise<{ html: string; report: LinkSanitizeReport }> {
  const timeoutMs = opts.timeoutMs ?? CHECK_TIMEOUT_MS;
  const siteBase = opts.siteBase.replace(/\/+$/, "");

  const ids = new Set(
    [...html.matchAll(/<h[1-6][^>]*\bid="([^"]+)"/g)].map((m) => m[1]),
  );

  const hrefs = new Set(
    [...html.matchAll(/<a\s+[^>]*href="([^"]+)"[^>]*>/gi)].map((m) => m[1]),
  );

  // Decide validity per unique href.
  const verdict = new Map<string, boolean>();
  const toCheck: string[] = [];
  for (const href of hrefs) {
    if (href.startsWith("#")) {
      verdict.set(href, ids.has(href.slice(1)));
    } else if (href.startsWith("/")) {
      toCheck.push(href);
    } else if (/^https?:\/\//i.test(href)) {
      toCheck.push(href);
    } else {
      verdict.set(href, true); // mailto:, tel:, etc. — leave alone
    }
  }

  const checkResults = await mapPool(toCheck, MAX_CONCURRENCY, async (href) => {
    const url = href.startsWith("/") ? `${siteBase}${href}` : href;
    return { href, ok: await httpOk(url, timeoutMs) };
  });
  for (const { href, ok } of checkResults) verdict.set(href, ok);

  const totalAnchors = (html.match(/<a\s/gi) || []).length;
  const unlinked: { href: string; reason: string }[] = [];
  const out = html.replace(
    /<a\s+([^>]*?)href="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/gi,
    (whole, _pre, href, _post, text) => {
      if (verdict.get(href)) return whole;
      const reason = href.startsWith("#")
        ? "no matching heading"
        : "did not resolve";
      unlinked.push({ href, reason });
      return text; // keep the words, drop the dead link
    },
  );

  return {
    html: out,
    report: { total: totalAnchors, kept: totalAnchors - unlinked.length, unlinked },
  };
}
