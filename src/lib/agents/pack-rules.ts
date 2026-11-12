// Per-industry hard rules that apply to every post a store publishes, checked
// deterministically (the writer is told too, but a model can slip):
// - forbiddenClaims: sentences that must not appear (pets: where a product is
//   made or who makes it, engraving, free shipping on urns/jewelry, the FTC
//   Funeral Rule, funeral homes).
// - blogLinksOnlyToAuthorities: outside links only to the pack's authority
//   sites (pets: AVMA, ASPCA, AKC); anything else is unlinked, words kept.
// Packs without these fields (caskets, headstones, general) are untouched.

import type { IndustryPack } from "@/lib/categories/industry";

/** Bare hosts of the pack's allowed outside links ("avma.org"). */
export function authorityHosts(pack: IndustryPack): string[] {
  return pack.authorityLinks
    .map((l) => {
      try {
        return new URL(l.url).hostname.replace(/^www\./, "").toLowerCase();
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}

function sentences(text: string): string[] {
  return text
    .split("\n")
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/))
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("```"));
}

/** Sentences that break one of the pack's forbidden claims. */
export function packClaimFlags(text: string, pack: IndustryPack, max = 12): { line: string; why: string }[] {
  const rules = pack.forbiddenClaims ?? [];
  if (!rules.length) return [];
  const out: { line: string; why: string }[] = [];
  for (const s of sentences(text)) {
    // Link targets aren't claims: judge the words only.
    const words = s.replace(/\]\([^)]*\)/g, "]").replace(/<[^>]+>/g, " ");
    for (const r of rules) {
      if (!r.re.test(words)) continue;
      if (r.onlyIf && !r.onlyIf.test(words)) continue;
      if (r.unless && r.unless.test(words)) continue;
      out.push({ line: s.length > 220 ? `${s.slice(0, 217)}…` : s, why: r.why });
      break;
    }
    if (out.length >= max) break;
  }
  return out;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Unlink every outside link whose host isn't an authority host (Markdown
 * links and HTML anchors; the link text stays). No-op unless the pack sets
 * blogLinksOnlyToAuthorities. Links to the store's own domain are kept.
 */
export function stripDisallowedLinks(md: string, pack: IndustryPack, ownDomain = ""): string {
  if (!pack.blogLinksOnlyToAuthorities) return md;
  const allowed = authorityHosts(pack);
  const own = ownDomain.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/^www\./, "").toLowerCase();
  const ok = (url: string) => {
    const h = hostOf(url);
    if (!h) return true; // relative / in-page links are not outside links
    if (own && (h === own || h.endsWith(`.${own}`))) return true;
    return allowed.some((a) => h === a || h.endsWith(`.${a}`));
  };
  return md
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/g, (all, text: string, url: string) => (ok(url) ? all : text))
    .replace(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (all, url: string, text: string) => (ok(url) ? all : text));
}
