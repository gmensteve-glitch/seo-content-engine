// Answer-engine client (Perplexity) — the GEO measurement primitive. Ask a real
// AI answer engine a buyer's question and see whether OUR site is cited in the
// answer. This is to GEO what a rank check is to SEO. Gated by PERPLEXITY_API_KEY.
// Perplexity's API returns real source citations, which is exactly what we need.
// Docs: https://docs.perplexity.ai/

const BASE = "https://api.perplexity.ai/chat/completions";
const DEFAULT_MODEL = "sonar";

export interface GeoAnswer {
  answer: string; // the model's answer text
  citations: string[]; // source URLs the engine cited
  cited: boolean; // one of the citations is on our domain
  mentioned: boolean; // our domain/brand appears in the answer text
  position: number | null; // 1-based index of our site among the citations, if cited
}

export function perplexityModel(): string {
  return process.env.PERPLEXITY_MODEL || DEFAULT_MODEL;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/**
 * Ask the answer engine `question` and measure whether `siteDomain` (e.g.
 * "trustedcaskets.com") is cited. Returns null when GEO isn't configured or the
 * request fails, so callers degrade gracefully.
 */
export async function askAnswerEngine(
  question: string,
  siteDomain: string,
): Promise<GeoAnswer | null> {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return null;
  const domain = siteDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "").toLowerCase();

  try {
    const res = await fetch(BASE, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: perplexityModel(),
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant answering a consumer's question. Answer concisely and cite your sources.",
          },
          { role: "user", content: question },
        ],
      }),
    });
    if (!res.ok) {
      console.error(`[perplexity] HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 160)}`);
      return null;
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      citations?: string[];
      search_results?: Array<{ url?: string }>;
    };
    const answer = data.choices?.[0]?.message?.content ?? "";
    // Citations may come as a top-level `citations` array (URLs) or `search_results`.
    const citations = (
      data.citations ?? (data.search_results ?? []).map((s) => s.url ?? "")
    ).filter(Boolean);

    const idx = citations.findIndex((u) => hostOf(u).includes(domain));
    const cited = idx >= 0;
    const mentioned =
      cited || answer.toLowerCase().includes(domain) || answer.toLowerCase().includes(domain.split(".")[0]);

    return { answer, citations, cited, mentioned, position: cited ? idx + 1 : null };
  } catch (e) {
    console.error("[perplexity] request failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
